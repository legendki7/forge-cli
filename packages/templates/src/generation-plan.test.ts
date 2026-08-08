import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { getStackPreset, type StackDefinition } from '@forgecli7/core';
import { defineForgeKiPlugin } from '@forgecli7/plugin-sdk';
import {
  createGenerationPlan,
  executeGenerationPlan,
  GenerationPlanError,
  validateExecutablePlan,
} from './generation-plan';

const definition = (
  framework: StackDefinition['framework'],
  components: StackDefinition['components'],
): StackDefinition => ({
  framework,
  components,
  packageManager: 'pnpm',
  initializeGit: false,
  addDocker: components.includes('docker'),
  addGitHubActions: components.includes('github-actions'),
});
const input = { projectName: 'planned-app', destinationDirectory: 'C:/projects' };

describe('generation plans', () => {
  it('is deterministic and contains no timestamps, machine paths, lockfiles, or secrets', async () => {
    const stack = getStackPreset('nextjs-fullstack')!.definition;
    const first = await createGenerationPlan(stack, input);
    const second = await createGenerationPlan(stack, input);
    expect(first).toEqual(second);
    const encoded = JSON.stringify(first.files);
    expect(encoded).not.toMatch(/Users[\\/]|20\d\d-\d\d-\d\dT/u);
    expect(first.files.some(({ path }) => /lock|node_modules/u.test(path))).toBe(false);
    expect(first.environmentVariables).toContainEqual(
      expect.objectContaining({ name: 'DATABASE_URL', secret: true }),
    );
    expect(first.files.find(({ path }) => path === '.env.example')?.content).toContain(
      'forgeki:forgeki',
    );
  });

  it('builds a complete Next.js full-stack plan', async () => {
    const plan = await createGenerationPlan(getStackPreset('nextjs-fullstack')!.definition, input);
    expect(plan.files.map(({ path }) => path)).toEqual(
      expect.arrayContaining([
        'prisma/schema.prisma',
        '.env.example',
        'docker-compose.yml',
        'vitest.config.ts',
        'playwright.config.ts',
        'Dockerfile',
        '.github/workflows/ci.yml',
      ]),
    );
    expect(plan.scripts).toMatchObject({ test: 'vitest run', e2e: 'playwright test' });
  });

  it.each([
    ['react-vite', ['plain-css', 'vitest'], ['src/App.tsx', 'src/App.test.tsx', 'vite.config.ts']],
    [
      'react-vite',
      ['tailwind', 'vitest', 'playwright', 'docker'],
      ['postcss.config.mjs', 'Dockerfile'],
    ],
    ['express', ['vitest'], ['src/app.ts', 'src/routes/health.ts', 'tests/health.test.ts']],
    ['express', ['sqlite', 'drizzle', 'vitest'], ['drizzle.config.ts', 'src/db/schema.ts']],
    [
      'express',
      ['postgres', 'prisma', 'vitest', 'docker'],
      ['prisma/schema.prisma', 'docker-compose.yml'],
    ],
  ] as const)('generates a deterministic %s variation', async (framework, components, paths) => {
    const plan = await createGenerationPlan(definition(framework, components), input);
    expect(plan.files.map(({ path }) => path)).toEqual(expect.arrayContaining([...paths]));
    expect(await createGenerationPlan(definition(framework, components), input)).toEqual(plan);
  });

  it('generates a valid Express health route and safe port handling', async () => {
    const plan = await createGenerationPlan(definition('express', ['vitest']), input);
    expect(plan.files.find(({ path }) => path === 'src/routes/health.ts')?.content).toContain(
      "status: 'ok'",
    );
    expect(plan.files.find(({ path }) => path === 'src/index.ts')?.content).toContain(
      'Number.isSafeInteger',
    );
    expect(plan.files.find(({ path }) => path === 'tests/health.test.ts')?.content).toContain(
      "toEqual({ status: 'ok' })",
    );
  });

  it('rejects compatibility errors before planning', async () => {
    await expect(
      createGenerationPlan(definition('react-vite', ['postgres']), input),
    ).rejects.toMatchObject({ code: 'INVALID_STACK' });
  });

  it('rejects tampered file paths, duplicate files, and preview/execution mismatches', async () => {
    const plan = await createGenerationPlan(definition('express', ['vitest']), input);
    const tampered = structuredClone(plan);
    tampered.files[0]!.path = '../outside.txt';
    expect(() => validateExecutablePlan(tampered)).toThrow(GenerationPlanError);
    const duplicate = structuredClone(plan);
    duplicate.files.push({ ...duplicate.files[0]! });
    expect(() => validateExecutablePlan(duplicate)).toThrow(/Duplicate generated file/u);
  });

  it('executes the exact reviewed plan atomically without installing dependencies', async () => {
    const parent = await mkdtemp(path.join(os.tmpdir(), 'forgeki-plan-'));
    try {
      const stack = definition('react-vite', ['tailwind', 'vitest']);
      const plan = await createGenerationPlan(stack, {
        projectName: 'vite-app',
        destinationDirectory: parent,
      });
      const result = await executeGenerationPlan(plan);
      expect(result.createdFiles).toEqual(plan.files.map(({ path: filePath }) => filePath));
      expect(await readFile(path.join(result.projectDirectory, 'package.json'), 'utf8')).toContain(
        '"vite"',
      );
      expect(result.createdFiles).not.toContain('pnpm-lock.yaml');
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it('merges validated declarative plugin contributions with source attribution', async () => {
    const plugin = defineForgeKiPlugin({
      manifestVersion: 1,
      id: 'community.example',
      name: 'Example',
      version: '0.1.0',
      description: 'Adds a deterministic example.',
      author: 'Test publisher',
      license: 'MIT',
      compatibility: { forgeki: '>=0.3.0' },
      supportedFrameworks: ['express'],
      permissions: [
        'project:generate-files',
        'project:add-dependencies',
        'project:add-scripts',
        'project:add-env-schema',
        'project:add-stack-components',
      ],
      contributions: {
        stackComponents: [
          {
            id: 'example',
            name: 'Example',
            description: 'Example component.',
            category: 'tooling',
            supportedFrameworks: ['express'],
          },
        ],
        generatedFiles: [
          {
            path: 'src/example.txt',
            content: '{{project.name}} {{project.framework}} {{project.packageManager}}',
            condition: { component: 'example' },
          },
        ],
        dependencies: { zod: '^4.0.0' },
        scripts: { validate: 'zod-check' },
        environmentVariables: [
          {
            name: 'EXAMPLE_URL',
            description: 'Example URL.',
            required: false,
            secret: false,
            exampleValue: 'http://localhost:3000',
          },
        ],
      },
    });
    const stack = {
      ...definition('express', ['vitest']),
      pluginComponents: ['example'],
    };
    const plan = await createGenerationPlan(stack, {
      ...input,
      declarativePlugins: [{ manifest: plugin }],
    });
    expect(plan.files.find(({ path }) => path === 'src/example.txt')).toEqual({
      path: 'src/example.txt',
      content: 'planned-app express pnpm\n',
      owner: 'plugin:community.example',
    });
    expect(plan.dependencies).toContainEqual({
      name: 'zod',
      version: '^4.0.0',
      sourceComponent: 'plugin:community.example',
    });
    expect(plan.plugins.at(-1)).toMatchObject({
      id: 'community.example',
      source: 'community',
      files: expect.arrayContaining(['.env.example', 'src/example.txt']),
    });
    expect(() => validateExecutablePlan(plan)).not.toThrow();
  });

  it('rejects missing, duplicate, colliding, and incompatible plugin contributions', async () => {
    const base = defineForgeKiPlugin({
      manifestVersion: 1,
      id: 'community.collision',
      name: 'Collision',
      version: '0.1.0',
      description: 'Collision fixture.',
      author: 'Tests',
      license: 'MIT',
      compatibility: { forgeki: '>=0.3.0' },
      supportedFrameworks: ['express'],
      permissions: ['project:generate-files', 'project:add-stack-components'],
      contributions: {
        stackComponents: [
          {
            id: 'collision',
            name: 'Collision',
            description: 'Collision fixture.',
            category: 'tooling',
            supportedFrameworks: ['express'],
          },
        ],
        generatedFiles: [
          { path: 'package.json', content: 'not allowed', condition: { component: 'collision' } },
        ],
      },
    });
    const stack = { ...definition('express', ['vitest']), pluginComponents: ['collision'] };
    await expect(
      createGenerationPlan(stack, { ...input, declarativePlugins: [{ manifest: base }] }),
    ).rejects.toMatchObject({ code: 'FILE_COLLISION' });
    await expect(
      createGenerationPlan(
        { ...definition('express', ['vitest']), pluginComponents: ['missing'] },
        { ...input, declarativePlugins: [] },
      ),
    ).rejects.toMatchObject({ code: 'INVALID_STACK' });
  });
});
