import { describe, expect, it } from 'vitest';
import {
  BUILTIN_STACK_COMPONENTS,
  BUILTIN_STACK_PRESETS,
  getStackPreset,
  validateStack,
  type StackDefinition,
} from './stacks';

const stack = (
  framework: StackDefinition['framework'],
  components: StackDefinition['components'],
): StackDefinition => ({
  framework,
  components,
  packageManager: 'pnpm',
  initializeGit: false,
  addDocker: false,
  addGitHubActions: false,
});

describe('built-in stack component registry', () => {
  it('has unique IDs, valid categories, and framework references', () => {
    const ids = BUILTIN_STACK_COMPONENTS.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(
      BUILTIN_STACK_COMPONENTS.every(
        ({ category, supportedFrameworks }) =>
          [
            'framework',
            'language',
            'styling',
            'database',
            'orm',
            'testing',
            'tooling',
            'runtime',
          ].includes(category) && supportedFrameworks.length > 0,
      ),
    ).toBe(true);
  });

  it('contains only safe dependency names and unique declared file ownership', () => {
    for (const component of BUILTIN_STACK_COMPONENTS) {
      for (const dependency of [...component.dependencies, ...component.devDependencies]) {
        expect(dependency.name).toMatch(/^@?[a-z0-9][a-z0-9._/-]*$/u);
      }
      expect(new Set(component.generatedFiles.map(({ path }) => path)).size).toBe(
        component.generatedFiles.length,
      );
    }
  });

  it('provides six deterministic built-in presets', () => {
    expect(BUILTIN_STACK_PRESETS.map(({ id }) => id)).toEqual([
      'nextjs-starter',
      'nextjs-fullstack',
      'nextjs-dashboard',
      'react-frontend',
      'express-api',
      'express-postgres-api',
    ]);
    expect(getStackPreset('nextjs-fullstack')).toBeDefined();
  });
});

describe('stack compatibility engine', () => {
  it.each([
    ['nextjs', ['tailwind', 'postgres', 'prisma', 'vitest', 'playwright']],
    ['react-vite', ['tailwind', 'vitest', 'playwright']],
    ['express', ['sqlite', 'drizzle', 'vitest']],
  ] as const)('accepts a valid %s stack', (framework, components) => {
    expect(validateStack(stack(framework, components)).valid).toBe(true);
  });

  it.each(['prisma', 'drizzle'] as const)('%s requires a database', (orm) => {
    const result = validateStack(stack('nextjs', [orm]));
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatchObject({ code: 'missing-requirement' });
    expect(result.errors[0]?.message).toContain('requires a database');
  });

  it('rejects multiple ORMs and databases with readable conflicts', () => {
    const result = validateStack(stack('nextjs', ['postgres', 'sqlite', 'prisma', 'drizzle']));
    expect(result.errors.map(({ code }) => code)).toEqual(
      expect.arrayContaining(['multiple-database', 'multiple-orm']),
    );
    expect(result.conflicts).toHaveLength(2);
  });

  it('rejects direct databases in React/Vite', () => {
    const result = validateStack(stack('react-vite', ['postgres']));
    expect(result.valid).toBe(false);
    expect(result.errors.map(({ code }) => code)).toContain('frontend-database');
  });

  it('rejects Playwright for Express and permits Tailwind only for web frameworks', () => {
    expect(validateStack(stack('express', ['playwright'])).valid).toBe(false);
    expect(validateStack(stack('nextjs', ['tailwind'])).valid).toBe(true);
    expect(validateStack(stack('express', ['tailwind'])).valid).toBe(false);
  });

  it('adds fixed requirements visibly and resolves deterministically', () => {
    const definition = stack('nextjs', ['vitest']);
    const first = validateStack(definition);
    const second = validateStack(definition);
    expect(first).toEqual(second);
    expect(first.requiredComponents).toEqual(['typescript', 'node']);
    expect(first.resolvedComponents).toEqual(['nextjs', 'typescript', 'vitest', 'node']);
  });
});
