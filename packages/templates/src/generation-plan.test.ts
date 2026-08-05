import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { getStackPreset, type StackDefinition } from '@forgecli7/core';
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
});
