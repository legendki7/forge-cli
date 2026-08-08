import type { SupportedPackageManager } from './package-managers.js';

export type StackFramework = 'nextjs' | 'react-vite' | 'express';
export type StackComponentCategory =
  'framework' | 'language' | 'styling' | 'database' | 'orm' | 'testing' | 'tooling' | 'runtime';

export type StackComponentId =
  | StackFramework
  | 'typescript'
  | 'plain-css'
  | 'tailwind'
  | 'postgres'
  | 'sqlite'
  | 'prisma'
  | 'drizzle'
  | 'vitest'
  | 'playwright'
  | 'git'
  | 'docker'
  | 'github-actions'
  | 'node';

export interface DependencyDefinition {
  name: string;
  version: string;
}

export interface GeneratedFileDefinition {
  path: string;
  description: string;
}

export interface EnvironmentVariableDefinition {
  name: string;
  description: string;
  required: boolean;
  secret: boolean;
  exampleValue?: string;
  sourceComponent: StackComponentId | `plugin:${string}`;
}

export interface StackRequirement {
  kind: 'component' | 'one-of-category';
  componentId?: StackComponentId;
  category?: StackComponentCategory;
  message: string;
}

export interface StackComponent {
  id: StackComponentId;
  name: string;
  description: string;
  category: StackComponentCategory;
  supportedFrameworks: readonly StackFramework[];
  requires: readonly StackRequirement[];
  conflictsWith: readonly StackComponentId[];
  provides: readonly string[];
  dependencies: readonly DependencyDefinition[];
  devDependencies: readonly DependencyDefinition[];
  scripts: Readonly<Record<string, string>>;
  generatedFiles: readonly GeneratedFileDefinition[];
  environmentVariables: readonly EnvironmentVariableDefinition[];
}

export interface StackDefinition {
  framework: StackFramework;
  components: readonly StackComponentId[];
  packageManager: SupportedPackageManager;
  initializeGit: boolean;
  addDocker: boolean;
  addGitHubActions: boolean;
  templateId?: string;
  /** IDs supplied by validated installed declarative plugins. */
  pluginComponents?: readonly string[];
}

export interface StackIssue {
  code: string;
  componentIds: readonly StackComponentId[];
  message: string;
  resolution: string;
}

export interface StackConflict {
  left: StackComponentId;
  right: StackComponentId;
  message: string;
}

export interface StackValidationResult {
  valid: boolean;
  errors: StackIssue[];
  warnings: StackIssue[];
  requiredComponents: StackComponentId[];
  conflicts: StackConflict[];
  resolvedComponents: StackComponentId[];
}

export interface StackPreset {
  id: string;
  name: string;
  description: string;
  builtIn: true;
  definition: StackDefinition;
}

const WEB: readonly StackFramework[] = ['nextjs', 'react-vite'];
const SERVER: readonly StackFramework[] = ['nextjs', 'express'];
const ALL: readonly StackFramework[] = ['nextjs', 'react-vite', 'express'];
const dep = (name: string, version: string): DependencyDefinition => ({ name, version });
const generated = (path: string, description: string): GeneratedFileDefinition => ({
  path,
  description,
});
const databaseRequirement: StackRequirement = {
  kind: 'one-of-category',
  category: 'database',
  message: 'This ORM requires PostgreSQL or SQLite.',
};

export const BUILTIN_STACK_COMPONENTS: readonly StackComponent[] = [
  component('nextjs', 'Next.js', 'Full-stack React framework using the App Router.', 'framework', [
    'nextjs',
  ]),
  component(
    'react-vite',
    'React + Vite',
    'Client-side React application powered by Vite.',
    'framework',
    ['react-vite'],
  ),
  component('express', 'Express', 'Minimal TypeScript backend API.', 'framework', ['express']),
  component(
    'typescript',
    'TypeScript',
    'Static typing for application source.',
    'language',
    ALL,
    [],
    [],
    [],
    [dep('typescript', '^5.9.2')],
  ),
  component(
    'plain-css',
    'Plain CSS',
    'Local framework-aware CSS without extra runtime packages.',
    'styling',
    WEB,
  ),
  component(
    'tailwind',
    'Tailwind CSS',
    'Utility-first styling compiled locally.',
    'styling',
    WEB,
    [],
    ['plain-css'],
    [],
    [dep('tailwindcss', '^4.1.12'), dep('@tailwindcss/postcss', '^4.1.12')],
    {},
    [generated('postcss.config.mjs', 'Tailwind PostCSS configuration')],
  ),
  component(
    'postgres',
    'PostgreSQL',
    'Relational database configuration with placeholder credentials.',
    'database',
    SERVER,
    [],
    ['sqlite'],
    [],
    [],
    {},
    [generated('.env.example', 'PostgreSQL connection placeholder')],
    [
      environment(
        'DATABASE_URL',
        'PostgreSQL connection URL.',
        true,
        true,
        'postgres://forgeki:forgeki@localhost:5432/forgeki',
        'postgres',
      ),
    ],
  ),
  component(
    'sqlite',
    'SQLite',
    'Local file database configuration without creating a database.',
    'database',
    SERVER,
    [],
    ['postgres'],
    [],
    [],
    {},
    [generated('.env.example', 'SQLite database path')],
    [
      environment(
        'DATABASE_URL',
        'SQLite database path.',
        true,
        false,
        'file:./data/app.db',
        'sqlite',
      ),
    ],
  ),
  component(
    'prisma',
    'Prisma',
    'Typed database client and schema foundation.',
    'orm',
    SERVER,
    [databaseRequirement],
    ['drizzle'],
    [dep('@prisma/client', '^6.14.0')],
    [dep('prisma', '^6.14.0')],
    { 'db:generate': 'prisma generate', 'db:migrate': 'prisma migrate dev' },
    [
      generated('prisma/schema.prisma', 'Prisma schema'),
      generated('src/lib/db.ts', 'Prisma client foundation'),
    ],
  ),
  component(
    'drizzle',
    'Drizzle',
    'Typed SQL schema and migration foundation.',
    'orm',
    SERVER,
    [databaseRequirement],
    ['prisma'],
    [dep('drizzle-orm', '^0.44.5')],
    [dep('drizzle-kit', '^0.31.4')],
    { 'db:generate': 'drizzle-kit generate', 'db:migrate': 'drizzle-kit migrate' },
    [
      generated('drizzle.config.ts', 'Drizzle configuration'),
      generated('src/db/schema.ts', 'Drizzle schema foundation'),
    ],
  ),
  component(
    'vitest',
    'Vitest',
    'Fast framework-aware unit and integration tests.',
    'testing',
    ALL,
    [],
    [],
    [],
    [dep('vitest', '^3.2.4')],
    { test: 'vitest run' },
    [generated('vitest.config.ts', 'Vitest configuration')],
  ),
  component(
    'playwright',
    'Playwright',
    'Browser smoke testing for web applications.',
    'testing',
    WEB,
    [],
    [],
    [],
    [dep('@playwright/test', '^1.55.0')],
    { e2e: 'playwright test' },
    [
      generated('playwright.config.ts', 'Playwright configuration'),
      generated('tests/e2e/smoke.spec.ts', 'Browser smoke test'),
    ],
  ),
  component('git', 'Git', 'Initialize a local source-control repository.', 'tooling', ALL),
  component(
    'docker',
    'Docker',
    'Generate framework-aware container configuration.',
    'tooling',
    ALL,
    [],
    [],
    [],
    [],
    {},
    [
      generated('Dockerfile', 'Container image definition'),
      generated('.dockerignore', 'Container build exclusions'),
    ],
  ),
  component(
    'github-actions',
    'GitHub Actions',
    'Generate a deterministic CI workflow.',
    'tooling',
    ALL,
    [],
    [],
    [],
    [],
    {},
    [generated('.github/workflows/ci.yml', 'Continuous integration workflow')],
  ),
  component('node', 'Node.js', 'Runtime for generated JavaScript applications.', 'runtime', ALL),
] as const;

const componentMap = new Map(BUILTIN_STACK_COMPONENTS.map((item) => [item.id, item]));

export function isStackFramework(value: unknown): value is StackFramework {
  return value === 'nextjs' || value === 'react-vite' || value === 'express';
}

export function isStackComponentId(value: unknown): value is StackComponentId {
  return typeof value === 'string' && componentMap.has(value as StackComponentId);
}

export function getStackComponent(id: StackComponentId): StackComponent {
  const value = componentMap.get(id);
  if (!value) throw new Error(`Unknown built-in stack component: ${id}`);
  return value;
}

export function validateStack(definition: StackDefinition): StackValidationResult {
  const errors: StackIssue[] = [];
  const warnings: StackIssue[] = [];
  const conflicts: StackConflict[] = [];
  const pluginComponents = definition.pluginComponents ?? [];
  if (
    pluginComponents.some(
      (id) =>
        !/^[a-z0-9][a-z0-9._-]{0,127}$/u.test(id) || id.includes('..') || isStackComponentId(id),
    )
  ) {
    errors.push(
      issue(
        'unknown-plugin-component',
        [],
        'The stack contains an invalid or reserved plugin component id.',
        'Choose a component supplied by a validated installed plugin.',
      ),
    );
  }
  if (new Set(pluginComponents).size !== pluginComponents.length) {
    errors.push(
      issue(
        'duplicate-plugin-component',
        [],
        'The stack contains a duplicate plugin component.',
        'Keep each plugin component only once.',
      ),
    );
  }
  const selected = new Set<StackComponentId>([definition.framework, ...definition.components]);
  if (definition.initializeGit) selected.add('git');
  if (definition.addDocker) selected.add('docker');
  if (definition.addGitHubActions) selected.add('github-actions');

  for (const id of selected) {
    if (!isStackComponentId(id)) {
      errors.push(
        issue(
          'unknown-component',
          [],
          `Unknown stack component "${String(id)}".`,
          'Choose only a component from the built-in ForgeKi registry.',
        ),
      );
      continue;
    }
    const item = getStackComponent(id);
    if (!item.supportedFrameworks.includes(definition.framework)) {
      errors.push(
        issue(
          'unsupported-framework',
          [id, definition.framework],
          `${item.name} is not supported by ${getStackComponent(definition.framework).name}.`,
          `Remove ${item.name} or choose a supported framework.`,
        ),
      );
    }
  }

  const required = new Set<StackComponentId>(['typescript', 'node']);
  for (const id of [...selected]) {
    if (!isStackComponentId(id)) continue;
    for (const requirement of getStackComponent(id).requires) {
      if (
        requirement.kind === 'component' &&
        requirement.componentId &&
        !selected.has(requirement.componentId)
      )
        required.add(requirement.componentId);
      if (
        requirement.kind === 'one-of-category' &&
        requirement.category &&
        ![...selected].some(
          (candidate) =>
            isStackComponentId(candidate) &&
            getStackComponent(candidate).category === requirement.category,
        )
      ) {
        errors.push(
          issue(
            'missing-requirement',
            [id],
            `${getStackComponent(id).name} requires a database.`,
            'Select PostgreSQL or SQLite.',
          ),
        );
      }
    }
  }
  for (const id of required) selected.add(id);

  categoryConflict('framework', 'Only one framework may be selected.');
  categoryConflict('database', 'Only one database may be selected.');
  categoryConflict('orm', 'Only one ORM may be selected.');
  categoryConflict('styling', 'Only one styling option may be selected.');

  if (selected.has('playwright') && definition.framework === 'express')
    errors.push(
      issue(
        'browser-testing-server',
        ['playwright', 'express'],
        'Playwright is not supported for Express-only projects in this phase.',
        'Use Vitest for Express, or choose Next.js or React + Vite.',
      ),
    );
  if (
    definition.framework === 'react-vite' &&
    (selected.has('postgres') ||
      selected.has('sqlite') ||
      selected.has('prisma') ||
      selected.has('drizzle'))
  )
    errors.push(
      issue(
        'frontend-database',
        ['react-vite'],
        'A React + Vite frontend cannot directly configure a server database.',
        'Choose Next.js or Express, or create a separate backend.',
      ),
    );

  const resolvedComponents = [...selected].sort(
    (left, right) => registryIndex(left) - registryIndex(right),
  );
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    requiredComponents: [...required]
      .filter((id) => !definition.components.includes(id))
      .sort((a, b) => registryIndex(a) - registryIndex(b)),
    conflicts,
    resolvedComponents,
  };

  function categoryConflict(category: StackComponentCategory, message: string) {
    const matches = [...selected].filter(
      (id) => isStackComponentId(id) && getStackComponent(id).category === category,
    );
    if (matches.length <= 1) return;
    errors.push(
      issue(`multiple-${category}`, matches, message, `Keep only one ${category} component.`),
    );
    for (let index = 1; index < matches.length; index += 1)
      conflicts.push({ left: matches[0]!, right: matches[index]!, message });
  }
}

const preset = (
  id: string,
  name: string,
  description: string,
  framework: StackFramework,
  components: StackComponentId[],
  templateId?: string,
): StackPreset => ({
  id,
  name,
  description,
  builtIn: true,
  definition: {
    framework,
    components,
    packageManager: 'pnpm',
    initializeGit: true,
    addDocker: components.includes('docker'),
    addGitHubActions: components.includes('github-actions'),
    ...(templateId ? { templateId } : {}),
  },
});

export const BUILTIN_STACK_PRESETS: readonly StackPreset[] = [
  preset(
    'nextjs-starter',
    'Next.js Starter',
    'Next.js, TypeScript, CSS, Vitest, Git, and CI.',
    'nextjs',
    ['typescript', 'plain-css', 'vitest', 'git', 'github-actions'],
  ),
  preset(
    'nextjs-fullstack',
    'Next.js Full Stack',
    'Tailwind, Prisma, PostgreSQL, testing, Docker, and CI.',
    'nextjs',
    [
      'typescript',
      'tailwind',
      'postgres',
      'prisma',
      'vitest',
      'playwright',
      'git',
      'docker',
      'github-actions',
    ],
  ),
  preset(
    'nextjs-dashboard',
    'Next.js Dashboard',
    'Dashboard template with Tailwind, Vitest, Docker, and CI.',
    'nextjs',
    ['typescript', 'tailwind', 'vitest', 'git', 'docker', 'github-actions'],
    'nextjs-dashboard',
  ),
  preset(
    'react-frontend',
    'React Frontend',
    'React + Vite with Tailwind and browser testing.',
    'react-vite',
    ['typescript', 'tailwind', 'vitest', 'playwright', 'git', 'github-actions'],
  ),
  preset(
    'express-api',
    'Express API',
    'Minimal Express API with Vitest, Docker, and CI.',
    'express',
    ['typescript', 'vitest', 'git', 'docker', 'github-actions'],
  ),
  preset(
    'express-postgres-api',
    'Express PostgreSQL API',
    'Express, PostgreSQL, Drizzle, Vitest, Docker, and CI.',
    'express',
    ['typescript', 'postgres', 'drizzle', 'vitest', 'git', 'docker', 'github-actions'],
  ),
] as const;

export function getStackPreset(id: string): StackPreset | undefined {
  return BUILTIN_STACK_PRESETS.find((candidate) => candidate.id === id);
}

function component(
  id: StackComponentId,
  name: string,
  description: string,
  category: StackComponentCategory,
  supportedFrameworks: readonly StackFramework[],
  requires: readonly StackRequirement[] = [],
  conflictsWith: readonly StackComponentId[] = [],
  dependencies: readonly DependencyDefinition[] = [],
  devDependencies: readonly DependencyDefinition[] = [],
  scripts: Readonly<Record<string, string>> = {},
  generatedFiles: readonly GeneratedFileDefinition[] = [],
  environmentVariables: readonly EnvironmentVariableDefinition[] = [],
): StackComponent {
  return {
    id,
    name,
    description,
    category,
    supportedFrameworks,
    requires,
    conflictsWith,
    provides: [],
    dependencies,
    devDependencies,
    scripts,
    generatedFiles,
    environmentVariables,
  };
}

function environment(
  name: string,
  description: string,
  required: boolean,
  secret: boolean,
  exampleValue: string,
  sourceComponent: StackComponentId,
): EnvironmentVariableDefinition {
  return { name, description, required, secret, exampleValue, sourceComponent };
}

function issue(
  code: string,
  componentIds: readonly StackComponentId[],
  message: string,
  resolution: string,
): StackIssue {
  return { code, componentIds, message, resolution };
}

function registryIndex(id: StackComponentId): number {
  return BUILTIN_STACK_COMPONENTS.findIndex((candidate) => candidate.id === id);
}
