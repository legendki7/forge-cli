import { access, mkdir, mkdtemp, realpath, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import {
  createFileSafely,
  getStackComponent,
  validateProjectName,
  validateStack,
  type DependencyDefinition,
  type EnvironmentVariableDefinition,
  type StackComponentId,
  type StackDefinition,
  type StackFramework,
} from '@forgecli7/core';
import {
  createPluginSafetyReport,
  normalizeDependencies,
  renderPluginTemplate,
  type ForgeKiPluginManifest,
} from '@forgecli7/plugin-sdk';
import { renderBuiltinTemplate, type TemplateId } from './catalog.js';

export interface ProjectCreationInput {
  projectName: string;
  destinationDirectory: string;
  templateId?: string;
  declarativePlugins?: readonly DeclarativePluginPlanSource[];
}
export interface DeclarativePluginPlanSource {
  manifest: ForgeKiPluginManifest;
  files?: Readonly<Record<string, string>>;
}
export type PlanOwner = StackComponentId | 'base' | `plugin:${string}`;
export interface PlannedFile {
  path: string;
  content: string;
  owner: PlanOwner;
}
export interface PlannedDependency extends DependencyDefinition {
  sourceComponent: PlanOwner;
}
export interface PlannedPlugin {
  id: string;
  files: readonly string[];
  source: 'built-in' | 'community';
}
export interface ProjectGenerationPlan {
  schemaVersion: 1;
  projectName: string;
  destinationDirectory: string;
  framework: StackFramework;
  templateId: string;
  stack: StackDefinition;
  resolvedComponents: StackComponentId[];
  automaticallyAdded: StackComponentId[];
  files: PlannedFile[];
  dependencies: PlannedDependency[];
  devDependencies: PlannedDependency[];
  scripts: Record<string, string>;
  environmentVariables: EnvironmentVariableDefinition[];
  plugins: PlannedPlugin[];
  warnings: string[];
}
export interface ProjectGenerationResult {
  projectDirectory: string;
  createdFiles: string[];
}

export class GenerationPlanError extends Error {
  constructor(
    readonly code:
      | 'INVALID_STACK'
      | 'DEPENDENCY_CONFLICT'
      | 'SCRIPT_CONFLICT'
      | 'FILE_COLLISION'
      | 'ENVIRONMENT_CONFLICT'
      | 'UNSAFE_FILE'
      | 'UNSAFE_DESTINATION',
    message: string,
  ) {
    super(message);
    this.name = 'GenerationPlanError';
  }
}

export async function createGenerationPlan(
  stack: StackDefinition,
  project: ProjectCreationInput,
): Promise<ProjectGenerationPlan> {
  const name = validateProjectName(project.projectName);
  if (!name.valid)
    throw new GenerationPlanError('UNSAFE_DESTINATION', name.message ?? 'Invalid project name.');
  const validation = validateStack(stack);
  if (!validation.valid)
    throw new GenerationPlanError(
      'INVALID_STACK',
      validation.errors.map(({ message }) => message).join(' '),
    );

  const templateId =
    stack.framework === 'nextjs'
      ? (project.templateId ?? stack.templateId ?? 'nextjs-blank')
      : stack.framework;
  const plan = new PlanBuilder(stack.framework);
  const base = await frameworkBase(
    stack.framework,
    templateId,
    project.projectName,
    stack.packageManager,
  );
  base.files.forEach((file) => plan.file({ ...file, owner: 'base' }));
  base.dependencies.forEach((item) => plan.dependency({ ...item, sourceComponent: 'base' }));
  base.devDependencies.forEach((item) => plan.devDependency({ ...item, sourceComponent: 'base' }));
  Object.entries(base.scripts).forEach(([key, command]) => plan.script(key, command, 'base'));

  const selected = new Set(validation.resolvedComponents);
  for (const id of validation.resolvedComponents) {
    const component = getStackComponent(id);
    component.dependencies.forEach((item) => plan.dependency({ ...item, sourceComponent: id }));
    component.devDependencies.forEach((item) =>
      plan.devDependency({ ...item, sourceComponent: id }),
    );
    Object.entries(component.scripts).forEach(([key, command]) => plan.script(key, command, id));
    component.environmentVariables.forEach((item) => plan.environment(item));
  }

  if (selected.has('tailwind')) {
    plan.file({
      path: 'postcss.config.mjs',
      content: "export default { plugins: { '@tailwindcss/postcss': {} } };\n",
      owner: 'tailwind',
    });
    const css = stack.framework === 'react-vite' ? 'src/index.css' : 'src/app/globals.css';
    plan.replaceFile(
      css,
      (existing) => `@import 'tailwindcss';\n${existing.replace("@import 'tailwindcss';\n", '')}`,
      'tailwind',
    );
  }
  applyTests(stack.framework, selected, plan);
  applyDatabase(selected, plan);
  if (selected.has('docker')) applyDocker(stack.framework, selected, plan);
  if (selected.has('github-actions')) {
    plan.file({
      path: '.github/workflows/ci.yml',
      content: workflow(stack.packageManager, plan.scriptNames()),
      owner: 'github-actions',
    });
  }

  const declarativePlugins = validateDeclarativePlugins(project.declarativePlugins ?? [], stack);
  for (const source of declarativePlugins) {
    applyDeclarativePlugin(source, stack, project.projectName, plan);
  }

  plan.updatePackageJson(project.projectName, stack.packageManager);
  plan.writeEnvironmentExample();
  plan.updateGitignore(selected.has('sqlite'));
  const result = plan.result();
  return {
    schemaVersion: 1,
    projectName: project.projectName,
    destinationDirectory: project.destinationDirectory,
    framework: stack.framework,
    templateId,
    stack: { ...stack, components: [...stack.components] },
    resolvedComponents: validation.resolvedComponents,
    automaticallyAdded: validation.requiredComponents,
    ...result,
    plugins: [
      ...(selected.has('docker')
        ? [
            {
              id: 'docker' as const,
              source: 'built-in' as const,
              files: [
                'Dockerfile',
                '.dockerignore',
                ...(selected.has('postgres') ? ['docker-compose.yml'] : []),
              ],
            },
          ]
        : []),
      ...(selected.has('github-actions')
        ? [
            {
              id: 'github-actions' as const,
              source: 'built-in' as const,
              files: ['.github/workflows/ci.yml'],
            },
          ]
        : []),
      ...declarativePlugins.map(({ manifest }) => ({
        id: manifest.id,
        source: 'community' as const,
        files: plan.filesForOwner(`plugin:${manifest.id}`),
      })),
    ],
    warnings: validation.warnings.map(({ message }) => message),
  };
}

export async function executeGenerationPlan(
  plan: ProjectGenerationPlan,
): Promise<ProjectGenerationResult> {
  validateExecutablePlan(plan);
  const parent = await realpath(plan.destinationDirectory).catch(() => {
    throw new GenerationPlanError(
      'UNSAFE_DESTINATION',
      'Destination parent directory does not exist.',
    );
  });
  const destination = path.resolve(parent, plan.projectName);
  if (path.dirname(destination) !== parent)
    throw new GenerationPlanError(
      'UNSAFE_DESTINATION',
      'Project destination must stay inside the selected parent directory.',
    );
  if (await exists(destination))
    throw new GenerationPlanError('UNSAFE_DESTINATION', 'Project destination already exists.');
  const staging = await mkdtemp(path.join(parent, `.forgeki-${plan.projectName}-`));
  try {
    for (const file of plan.files) {
      const output = path.resolve(staging, file.path);
      if (!output.startsWith(`${staging}${path.sep}`))
        throw new GenerationPlanError('UNSAFE_FILE', `Unsafe generated path: ${file.path}`);
      await mkdir(path.dirname(output), { recursive: true });
      if (!(await createFileSafely(output, file.content)))
        throw new GenerationPlanError('FILE_COLLISION', `Refusing to overwrite ${file.path}.`);
    }
    await rename(staging, destination);
    return {
      projectDirectory: destination,
      createdFiles: plan.files.map(({ path: filePath }) => filePath),
    };
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}

export function validateExecutablePlan(plan: ProjectGenerationPlan): void {
  const validation = validateStack(plan.stack);
  if (!validation.valid)
    throw new GenerationPlanError(
      'INVALID_STACK',
      'The generation plan contains an invalid stack.',
    );
  if (plan.projectName !== path.basename(plan.projectName))
    throw new GenerationPlanError(
      'UNSAFE_DESTINATION',
      'The project name cannot contain path segments.',
    );
  const paths = new Set<string>();
  const pluginIds = new Set(
    plan.plugins.filter(({ source }) => source === 'community').map(({ id }) => id),
  );
  for (const file of plan.files) {
    validateRelativePath(file.path);
    if (paths.has(file.path))
      throw new GenerationPlanError('FILE_COLLISION', `Duplicate generated file: ${file.path}`);
    paths.add(file.path);
    if (file.owner.startsWith('plugin:') && !pluginIds.has(file.owner.slice('plugin:'.length)))
      throw new GenerationPlanError('UNSAFE_FILE', `Unknown plugin file owner: ${file.owner}`);
  }
}

function validateDeclarativePlugins(
  sources: readonly DeclarativePluginPlanSource[],
  stack: StackDefinition,
): DeclarativePluginPlanSource[] {
  const selected = new Set(stack.pluginComponents ?? []);
  const seenPlugins = new Set<string>();
  const seenComponents = new Set<string>();
  const result = [...sources].sort((a, b) => a.manifest.id.localeCompare(b.manifest.id));
  for (const source of result) {
    const report = createPluginSafetyReport(source.manifest);
    if (report.result === 'blocked')
      throw new GenerationPlanError(
        'INVALID_STACK',
        `Plugin ${source.manifest.id} is unsafe or incompatible: ${report.errors[0]?.message ?? 'validation failed'}`,
      );
    if (seenPlugins.has(source.manifest.id))
      throw new GenerationPlanError('INVALID_STACK', `Duplicate plugin ${source.manifest.id}.`);
    seenPlugins.add(source.manifest.id);
    for (const component of source.manifest.contributions.stackComponents ?? []) {
      if (seenComponents.has(component.id))
        throw new GenerationPlanError(
          'INVALID_STACK',
          `Duplicate plugin component ${component.id}.`,
        );
      seenComponents.add(component.id);
      if (selected.has(component.id)) {
        if (!component.supportedFrameworks.includes(stack.framework))
          throw new GenerationPlanError(
            'INVALID_STACK',
            `${component.name} is not supported by ${stack.framework}.`,
          );
        const missing = (component.requires ?? []).filter(
          (id) => !stack.components.includes(id as StackComponentId) && !selected.has(id),
        );
        if (missing.length)
          throw new GenerationPlanError(
            'INVALID_STACK',
            `${component.name} requires ${missing.join(', ')}.`,
          );
        const conflicts = (component.conflictsWith ?? []).filter(
          (id) => stack.components.includes(id as StackComponentId) || selected.has(id),
        );
        if (conflicts.length)
          throw new GenerationPlanError(
            'INVALID_STACK',
            `${component.name} conflicts with ${conflicts.join(', ')}.`,
          );
      }
    }
  }
  const unknown = [...selected].filter((id) => !seenComponents.has(id));
  if (unknown.length)
    throw new GenerationPlanError(
      'INVALID_STACK',
      `Unknown or disabled plugin components: ${unknown.join(', ')}.`,
    );
  return result.filter(({ manifest }) =>
    (manifest.contributions.stackComponents ?? []).some(({ id }) => selected.has(id)),
  );
}

function applyDeclarativePlugin(
  source: DeclarativePluginPlanSource,
  stack: StackDefinition,
  projectName: string,
  plan: PlanBuilder,
) {
  const { manifest } = source;
  const owner = `plugin:${manifest.id}` as const;
  const selected = new Set(stack.pluginComponents ?? []);
  const applies = (condition?: { framework?: string | readonly string[]; component?: string }) => {
    if (condition?.component && !selected.has(condition.component)) return false;
    const supported = condition?.framework;
    return (
      !supported ||
      (Array.isArray(supported)
        ? supported.includes(stack.framework)
        : supported === stack.framework)
    );
  };
  for (const item of normalizeDependencies(manifest.contributions.dependencies))
    plan.dependency({ ...item, sourceComponent: owner });
  for (const item of normalizeDependencies(manifest.contributions.devDependencies))
    plan.devDependency({ ...item, sourceComponent: owner });
  for (const [name, command] of Object.entries(manifest.contributions.scripts ?? {}))
    plan.script(name, command, owner);
  for (const item of manifest.contributions.environmentVariables ?? [])
    plan.environment({ ...item, sourceComponent: owner });
  for (const file of manifest.contributions.generatedFiles ?? []) {
    if (!applies(file.condition)) continue;
    const template = file.content ?? (file.source ? source.files?.[file.source] : undefined);
    if (template === undefined)
      throw new GenerationPlanError(
        'UNSAFE_FILE',
        `Plugin ${manifest.id} is missing template source ${file.source ?? file.path}.`,
      );
    plan.file({
      path: file.path,
      content: renderPluginTemplate(template, {
        project: {
          name: projectName,
          framework: stack.framework,
          packageManager: stack.packageManager,
        },
      }),
      owner,
    });
  }
}

interface FrameworkBase {
  files: Array<Omit<PlannedFile, 'owner'>>;
  dependencies: DependencyDefinition[];
  devDependencies: DependencyDefinition[];
  scripts: Record<string, string>;
}

async function frameworkBase(
  framework: StackFramework,
  templateId: string,
  projectName: string,
  packageManager: StackDefinition['packageManager'],
): Promise<FrameworkBase> {
  if (framework === 'nextjs') {
    const rendered = await renderBuiltinTemplate(templateId as TemplateId, {
      projectName,
      packageManager,
    });
    const packageFile = rendered.files.find(({ path: filePath }) => filePath === 'package.json');
    if (!packageFile)
      throw new GenerationPlanError('FILE_COLLISION', 'Next.js template has no package.json.');
    const metadata = JSON.parse(packageFile.content) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
      scripts: Record<string, string>;
    };
    return {
      files: rendered.files,
      dependencies: entries(metadata.dependencies),
      devDependencies: entries(metadata.devDependencies),
      scripts: metadata.scripts,
    };
  }
  return framework === 'react-vite'
    ? viteBase(projectName, packageManager)
    : expressBase(projectName, packageManager);
}

function viteBase(name: string, manager: StackDefinition['packageManager']): FrameworkBase {
  return {
    files: [
      text('package.json', emptyPackage(name, manager)),
      text(
        'index.html',
        '<!doctype html>\n<html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>ForgeKi App</title></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>\n',
      ),
      text(
        'src/main.tsx',
        "import { StrictMode } from 'react';\nimport { createRoot } from 'react-dom/client';\nimport App from './App';\nimport './index.css';\n\ncreateRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);\n",
      ),
      text(
        'src/App.tsx',
        'export default function App() { return <main><p>ForgeKi</p><h1>React + Vite</h1><p>Your project is ready.</p></main>; }\n',
      ),
      text(
        'src/index.css',
        ':root { font-family: system-ui, sans-serif; color: #172033; background: #f5f7fb; } body { margin: 0; } main { max-width: 48rem; margin: 8rem auto; padding: 2rem; }\n',
      ),
      text(
        'vite.config.ts',
        "import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\nexport default defineConfig({ plugins: [react()] });\n",
      ),
      text(
        'tsconfig.json',
        '{"files":[],"references":[{"path":"./tsconfig.app.json"},{"path":"./tsconfig.node.json"}]}\n',
      ),
      text(
        'tsconfig.app.json',
        '{"compilerOptions":{"target":"ES2022","lib":["ES2022","DOM","DOM.Iterable"],"strict":true,"module":"ESNext","moduleResolution":"Bundler","isolatedModules":true,"noEmit":true,"jsx":"react-jsx"},"include":["src"]}\n',
      ),
      text(
        'tsconfig.node.json',
        '{"compilerOptions":{"composite":true,"skipLibCheck":true,"module":"ESNext","moduleResolution":"Bundler"},"include":["vite.config.ts","vitest.config.ts"]}\n',
      ),
      text(
        'eslint.config.mjs',
        "import js from '@eslint/js';\nexport default [js.configs.recommended, { ignores: ['dist'] }];\n",
      ),
      text('.gitignore', 'node_modules\ndist\ncoverage\n*.log\n'),
      text(
        'README.md',
        `# ${name}\n\nGenerated offline by ForgeKi. Install dependencies, then run the development script.\n`,
      ),
      text('public/.gitkeep', ''),
    ],
    dependencies: [dep('react', '^19.1.1'), dep('react-dom', '^19.1.1')],
    devDependencies: [
      dep('@types/react', '^19.1.10'),
      dep('@types/react-dom', '^19.1.7'),
      dep('@vitejs/plugin-react', '^5.0.2'),
      dep('vite', '^7.1.3'),
      dep('eslint', '^9.34.0'),
    ],
    scripts: {
      dev: 'vite',
      build: 'tsc -b && vite build',
      preview: 'vite preview',
      lint: 'eslint .',
      typecheck: 'tsc -b --pretty false',
    },
  };
}

function expressBase(name: string, manager: StackDefinition['packageManager']): FrameworkBase {
  return {
    files: [
      text('package.json', emptyPackage(name, manager)),
      text(
        'src/routes/health.ts',
        "import { Router } from 'express';\nexport const healthRouter = Router().get('/health', (_request, response) => response.json({ status: 'ok' }));\n",
      ),
      text(
        'src/app.ts',
        "import express from 'express';\nimport { healthRouter } from './routes/health.js';\nexport const app = express().use(express.json()).use(healthRouter);\n",
      ),
      text(
        'src/index.ts',
        "import { app } from './app.js';\nconst parsed = Number.parseInt(process.env.PORT ?? '3000', 10);\nconst port = Number.isSafeInteger(parsed) && parsed > 0 && parsed < 65536 ? parsed : 3000;\nconst server = app.listen(port, () => console.log(`ForgeKi API listening on ${port}`));\nconst shutdown = () => server.close(() => process.exit(0));\nprocess.once('SIGINT', shutdown);\nprocess.once('SIGTERM', shutdown);\n",
      ),
      text(
        'tests/health.test.ts',
        "import { afterAll, beforeAll, describe, expect, it } from 'vitest';\nimport { app } from '../src/app.js';\nimport type { Server } from 'node:http';\nlet server: Server;\nlet baseUrl: string;\nbeforeAll(async () => { await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => { const address = server.address(); if (!address || typeof address === 'string') throw new Error('Test server did not bind.'); baseUrl = `http://127.0.0.1:${address.port}`; resolve(); }); }); });\nafterAll(async () => { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); });\ndescribe('GET /health', () => { it('returns the service status', async () => { const response = await fetch(`${baseUrl}/health`); expect(response.status).toBe(200); await expect(response.json()).resolves.toEqual({ status: 'ok' }); }); });\n",
      ),
      text(
        'tsconfig.json',
        '{"compilerOptions":{"target":"ES2022","module":"NodeNext","moduleResolution":"NodeNext","rootDir":".","outDir":"dist","strict":true,"esModuleInterop":true,"skipLibCheck":true},"include":["src","tests","vitest.config.ts","drizzle.config.ts"]}\n',
      ),
      text(
        'eslint.config.mjs',
        "import js from '@eslint/js';\nexport default [js.configs.recommended, { ignores: ['dist'] }];\n",
      ),
      text('.env.example', 'PORT=3000\n'),
      text('.gitignore', 'node_modules\ndist\ncoverage\n.env\n*.log\n'),
      text(
        'README.md',
        `# ${name}\n\nA minimal TypeScript Express API generated offline by ForgeKi.\n\n## Health\n\n\`GET /health\` returns \`{ "status": "ok" }\`.\n`,
      ),
    ],
    dependencies: [dep('express', '^5.1.0')],
    devDependencies: [
      dep('@types/express', '^5.0.3'),
      dep('@types/node', '^22.17.2'),
      dep('tsx', '^4.20.5'),
      dep('eslint', '^9.34.0'),
    ],
    scripts: {
      dev: 'tsx watch src/index.ts',
      build: 'tsc',
      start: 'node dist/src/index.js',
      lint: 'eslint .',
      typecheck: 'tsc --noEmit',
      test: 'vitest run',
    },
  };
}

function applyTests(framework: StackFramework, selected: Set<StackComponentId>, plan: PlanBuilder) {
  if (selected.has('vitest')) {
    plan.file({
      path: 'vitest.config.ts',
      content: `import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: '${framework === 'react-vite' ? 'jsdom' : 'node'}' } });
`,
      owner: 'vitest',
    });
    if (framework === 'react-vite') {
      plan.devDependency({
        name: '@testing-library/react',
        version: '^16.3.0',
        sourceComponent: 'vitest',
      });
      plan.devDependency({ name: 'jsdom', version: '^26.1.0', sourceComponent: 'vitest' });
      plan.file({
        path: 'src/App.test.tsx',
        content:
          "import { render, screen } from '@testing-library/react';\nimport { describe, expect, it } from 'vitest';\nimport App from './App';\ndescribe('App', () => { it('renders the generated application', () => { render(<App />); expect(screen.getByRole('heading', { name: 'React + Vite' })).toBeDefined(); }); });\n",
        owner: 'vitest',
      });
    } else if (framework !== 'express')
      plan.file({
        path: 'tests/example.test.ts',
        content:
          "import { describe, expect, it } from 'vitest';\ndescribe('project', () => it('is configured', () => expect(true).toBe(true)));\n",
        owner: 'vitest',
      });
  }
  if (selected.has('playwright')) {
    plan.file({
      path: 'playwright.config.ts',
      content:
        "import { defineConfig } from '@playwright/test';\nexport default defineConfig({ testDir: './tests/e2e', use: { baseURL: 'http://127.0.0.1:3000' } });\n",
      owner: 'playwright',
    });
    plan.file({
      path: 'tests/e2e/smoke.spec.ts',
      content:
        "import { expect, test } from '@playwright/test';\ntest('application responds', async ({ page }) => { await page.goto('/'); await expect(page.locator('body')).toBeVisible(); });\n",
      owner: 'playwright',
    });
  }
}

function applyDatabase(selected: Set<StackComponentId>, plan: PlanBuilder) {
  const provider = selected.has('postgres') ? 'postgresql' : 'sqlite';
  if (selected.has('prisma')) {
    plan.file({
      path: 'prisma/schema.prisma',
      content: `generator client {\n  provider = "prisma-client-js"\n}\n\ndatasource db {\n  provider = "${provider}"\n  url      = env("DATABASE_URL")\n}\n`,
      owner: 'prisma',
    });
    plan.file({
      path: 'src/lib/db.ts',
      content:
        "import { PrismaClient } from '@prisma/client';\nexport const db = new PrismaClient();\n",
      owner: 'prisma',
    });
  }
  if (selected.has('drizzle')) {
    const postgres = selected.has('postgres');
    const driver = postgres ? 'postgres' : 'better-sqlite3';
    plan.dependency({
      name: driver,
      version: postgres ? '^3.4.7' : '^12.2.0',
      sourceComponent: 'drizzle',
    });
    if (!postgres)
      plan.devDependency({
        name: '@types/better-sqlite3',
        version: '^7.6.13',
        sourceComponent: 'drizzle',
      });
    plan.file({
      path: 'drizzle.config.ts',
      content: `import { defineConfig } from 'drizzle-kit';\nexport default defineConfig({ schema: './src/db/schema.ts', out: './drizzle', dialect: '${postgres ? 'postgresql' : 'sqlite'}', dbCredentials: { url: process.env.DATABASE_URL ?? '${postgres ? 'postgres://forgeki:forgeki@localhost:5432/forgeki' : 'data/app.db'}' } });\n`,
      owner: 'drizzle',
    });
    plan.file({
      path: 'src/db/schema.ts',
      content: postgres
        ? "import { pgTable, serial, text } from 'drizzle-orm/pg-core';\nexport const items = pgTable('items', { id: serial('id').primaryKey(), name: text('name').notNull() });\n"
        : "import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';\nexport const items = sqliteTable('items', { id: integer('id').primaryKey(), name: text('name').notNull() });\n",
      owner: 'drizzle',
    });
  }
}

function applyDocker(
  framework: StackFramework,
  selected: Set<StackComponentId>,
  plan: PlanBuilder,
) {
  const content =
    framework === 'react-vite'
      ? 'FROM node:20-alpine AS build\nWORKDIR /app\nCOPY package.json ./\nRUN corepack enable && pnpm install --no-frozen-lockfile\nCOPY . .\nRUN pnpm build\nFROM nginx:1.27-alpine\nCOPY --from=build /app/dist /usr/share/nginx/html\n'
      : 'FROM node:20-alpine\nWORKDIR /app\nCOPY package.json ./\nRUN corepack enable && pnpm install --no-frozen-lockfile\nCOPY . .\nRUN pnpm build\nCMD ["pnpm", "start"]\n';
  plan.file({ path: 'Dockerfile', content, owner: 'docker' });
  plan.file({
    path: '.dockerignore',
    content: 'node_modules\ndist\ncoverage\n.next\n.git\n.env\n*.log\n',
    owner: 'docker',
  });
  if (selected.has('postgres'))
    plan.file({
      path: 'docker-compose.yml',
      content:
        "services:\n  postgres:\n    image: postgres:17-alpine\n    environment:\n      POSTGRES_USER: forgeki\n      POSTGRES_PASSWORD: forgeki\n      POSTGRES_DB: forgeki\n    ports:\n      - '5432:5432'\n    volumes:\n      - forgeki-postgres:/var/lib/postgresql/data\nvolumes:\n  forgeki-postgres:\n",
      owner: 'docker',
    });
}

class PlanBuilder {
  readonly files = new Map<string, PlannedFile>();
  readonly dependencies = new Map<string, PlannedDependency>();
  readonly devDependencies = new Map<string, PlannedDependency>();
  readonly scripts = new Map<string, { command: string; owner: PlanOwner }>();
  readonly environmentVariables = new Map<string, EnvironmentVariableDefinition>();
  constructor(readonly framework: StackFramework) {}

  file(file: PlannedFile) {
    validateRelativePath(file.path);
    const existing = this.files.get(file.path);
    if (existing && existing.content !== file.content)
      throw new GenerationPlanError(
        'FILE_COLLISION',
        `${file.path} is owned by both ${existing.owner} and ${file.owner}.`,
      );
    this.files.set(file.path, file);
  }
  replaceFile(filePath: string, transform: (content: string) => string, owner: StackComponentId) {
    const existing = this.files.get(filePath);
    if (!existing)
      throw new GenerationPlanError('FILE_COLLISION', `Cannot extend missing file ${filePath}.`);
    this.files.set(filePath, { path: filePath, content: transform(existing.content), owner });
  }
  dependency(item: PlannedDependency) {
    addDependency(this.dependencies, item);
  }
  devDependency(item: PlannedDependency) {
    addDependency(this.devDependencies, item);
  }
  script(name: string, command: string, owner: PlanOwner) {
    if (!/^[a-z0-9:_-]+$/u.test(name))
      throw new GenerationPlanError('SCRIPT_CONFLICT', `Unsafe script name: ${name}`);
    const existing = this.scripts.get(name);
    if (existing && existing.command !== command)
      throw new GenerationPlanError('SCRIPT_CONFLICT', `Conflicting commands for script ${name}.`);
    this.scripts.set(name, { command, owner });
  }
  environment(item: EnvironmentVariableDefinition) {
    if (!/^[A-Z][A-Z0-9_]*$/u.test(item.name))
      throw new GenerationPlanError(
        'ENVIRONMENT_CONFLICT',
        `Unsafe environment variable name: ${item.name}`,
      );
    const existing = this.environmentVariables.get(item.name);
    if (existing && existing.exampleValue !== item.exampleValue)
      throw new GenerationPlanError(
        'ENVIRONMENT_CONFLICT',
        `Conflicting definitions for ${item.name}.`,
      );
    this.environmentVariables.set(item.name, item);
  }
  scriptNames() {
    return [...this.scripts.keys()];
  }
  filesForOwner(owner: PlanOwner) {
    return [...this.files.values()]
      .filter((file) => file.owner === owner)
      .map((file) => file.path)
      .sort();
  }
  updatePackageJson(name: string, manager: StackDefinition['packageManager']) {
    const existing = this.files.get('package.json');
    if (!existing)
      throw new GenerationPlanError('FILE_COLLISION', 'Framework has no package.json.');
    const metadata = JSON.parse(existing.content) as Record<string, unknown>;
    metadata.name = name;
    metadata.packageManager = `${manager}@${managerVersion(manager)}`;
    metadata.scripts = Object.fromEntries(
      [...this.scripts]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => [key, value.command]),
    );
    metadata.dependencies = Object.fromEntries(
      [...this.dependencies]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => [key, value.version]),
    );
    metadata.devDependencies = Object.fromEntries(
      [...this.devDependencies]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => [key, value.version]),
    );
    this.files.set('package.json', {
      ...existing,
      content: `${JSON.stringify(metadata, null, 2)}\n`,
    });
  }
  writeEnvironmentExample() {
    if (!this.environmentVariables.size) return;
    const variables = [...this.environmentVariables.values()].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    const existing = this.files.get('.env.example');
    const other = (existing?.content ?? '')
      .split(/\r?\n/u)
      .filter((line) => line && !variables.some(({ name }) => line.startsWith(`${name}=`)));
    this.files.set('.env.example', {
      path: '.env.example',
      content:
        [...other, ...variables.map((item) => `${item.name}=${item.exampleValue ?? ''}`)].join(
          '\n',
        ) + '\n',
      owner: variables[0]!.sourceComponent,
    });
  }
  updateGitignore(sqlite: boolean) {
    const existing = this.files.get('.gitignore');
    const lines = new Set(
      `${existing?.content ?? ''}\n.env\n.env.local\n${sqlite ? 'data/*.db\ndata/*.db-*\n' : ''}`
        .split(/\r?\n/u)
        .filter(Boolean),
    );
    this.files.set('.gitignore', {
      path: '.gitignore',
      content: `${[...lines].join('\n')}\n`,
      owner: existing?.owner ?? 'base',
    });
  }
  result() {
    return {
      files: [...this.files.values()].sort((a, b) => a.path.localeCompare(b.path)),
      dependencies: [...this.dependencies.values()].sort((a, b) => a.name.localeCompare(b.name)),
      devDependencies: [...this.devDependencies.values()].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
      scripts: Object.fromEntries(
        [...this.scripts]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, value]) => [key, value.command]),
      ),
      environmentVariables: [...this.environmentVariables.values()].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    };
  }
}

function addDependency(target: Map<string, PlannedDependency>, item: PlannedDependency) {
  if (!/^@?[a-z0-9][a-z0-9._/-]*$/u.test(item.name) || item.name.includes('..'))
    throw new GenerationPlanError('DEPENDENCY_CONFLICT', `Unsafe dependency name: ${item.name}`);
  const existing = target.get(item.name);
  if (existing && existing.version !== item.version)
    throw new GenerationPlanError('DEPENDENCY_CONFLICT', `Conflicting versions for ${item.name}.`);
  target.set(item.name, item);
}

function workflow(manager: StackDefinition['packageManager'], available: string[]): string {
  const run = (script: string) =>
    manager === 'npm' ? `npm run ${script}` : `${manager} run ${script}`;
  return `# Generated by ForgeKi\nname: CI\non: [push, pull_request]\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v7\n      - uses: actions/setup-node@v6\n        with:\n          node-version: 20\n      - run: corepack enable\n      - run: ${manager === 'npm' ? 'npm install' : `${manager} install --no-frozen-lockfile`}\n${[
    'lint',
    'typecheck',
    'test',
    'build',
  ]
    .filter((name) => available.includes(name))
    .map((name) => `      - run: ${run(name)}`)
    .join('\n')}\n`;
}
function validateRelativePath(filePath: string) {
  if (
    !filePath ||
    path.isAbsolute(filePath) ||
    filePath.split(/[\\/]/u).includes('..') ||
    filePath.includes('\0')
  )
    throw new GenerationPlanError('UNSAFE_FILE', `Unsafe generated path: ${filePath}`);
}
function entries(record: Record<string, string>): DependencyDefinition[] {
  return Object.entries(record).map(([name, version]) => ({ name, version }));
}
function dep(name: string, version: string): DependencyDefinition {
  return { name, version };
}
function text(filePath: string, content: string): Omit<PlannedFile, 'owner'> {
  return { path: filePath, content };
}
function emptyPackage(name: string, manager: StackDefinition['packageManager']): string {
  return `${JSON.stringify(
    {
      name,
      version: '0.1.0',
      private: true,
      type: 'module',
      packageManager: `${manager}@${managerVersion(manager)}`,
      scripts: {},
      dependencies: {},
      devDependencies: {},
    },
    null,
    2,
  )}\n`;
}
function managerVersion(manager: StackDefinition['packageManager']) {
  return { pnpm: '10.15.0', npm: '11.5.2', yarn: '4.9.2', bun: '1.2.20' }[manager];
}
async function exists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
