import { describe, expect, it } from 'vitest';
import { formatCreateSummary, runCreateWizard } from './create-wizard.js';
import type {
  ConfirmPromptOptions,
  CreatePromptAdapter,
  InputPromptOptions,
  SelectPromptOptions,
} from './prompts.js';

class FakePrompts implements CreatePromptAdapter {
  readonly calls: string[] = [];

  constructor(
    private readonly inputAnswers: string[] = [],
    private readonly selectAnswers: unknown[] = [],
    private readonly confirmAnswers: boolean[] = [],
  ) {}

  async input(options: InputPromptOptions): Promise<string> {
    this.calls.push(options.message);
    const answer = this.inputAnswers.shift() ?? '';
    const validation = options.validate?.(answer);
    if (validation !== undefined && validation !== true) throw new Error(validation);
    return answer;
  }

  async select<T>(options: SelectPromptOptions<T>): Promise<T> {
    this.calls.push(options.message);
    return (this.selectAnswers.shift() ?? options.default) as T;
  }

  async confirm(options: ConfirmPromptOptions): Promise<boolean> {
    this.calls.push(options.message);
    return this.confirmAnswers.shift() ?? options.default;
  }
}

describe('create wizard', () => {
  it('prompts in order, trims the name, and uses the default choices', async () => {
    const prompts = new FakePrompts(['  demo-app  '], [], [true, false, false, true]);
    const summaries: string[] = [];

    const result = await runCreateWizard({}, prompts, (summary) => summaries.push(summary));

    expect(result).toEqual({
      confirmed: true,
      configuration: {
        projectName: 'demo-app',
        framework: 'nextjs',
        packageManager: 'pnpm',
        initializeGit: true,
        addDocker: false,
        addGitHubActions: false,
      },
    });
    expect(prompts.calls).toEqual([
      'Project name:',
      'Package manager:',
      'Initialize a Git repository?',
      'Add Docker configuration?',
      'Add GitHub Actions CI?',
      'Create this project?',
    ]);
    expect(summaries[0]).toContain('Framework: Next.js');
  });

  it.each(['npm', 'yarn', 'bun'] as const)('supports %s', async (packageManager) => {
    const prompts = new FakePrompts(['app'], [packageManager], [false, false, false, true]);
    const result = await runCreateWizard({}, prompts, () => undefined);
    expect(result.configuration.packageManager).toBe(packageManager);
  });

  it('skips prompts for supplied values except confirmation', async () => {
    const prompts = new FakePrompts([], [], [true]);
    const result = await runCreateWizard(
      {
        projectName: 'configured-app',
        packageManager: 'npm',
        initializeGit: false,
        addDocker: true,
        addGitHubActions: true,
      },
      prompts,
      () => undefined,
    );

    expect(prompts.calls).toEqual(['Create this project?']);
    expect(result.configuration.addDocker).toBe(true);
  });

  it('rejects invalid project names through the shared validator', async () => {
    const prompts = new FakePrompts(['../outside']);
    await expect(runCreateWizard({}, prompts, () => undefined)).rejects.toThrow();
  });

  it('returns an unconfirmed result without changing the configuration', async () => {
    const prompts = new FakePrompts([], [], [false]);
    const result = await runCreateWizard(
      {
        projectName: 'cancelled-app',
        packageManager: 'pnpm',
        initializeGit: false,
        addDocker: false,
        addGitHubActions: false,
      },
      prompts,
      () => undefined,
    );
    expect(result.confirmed).toBe(false);
  });

  it('formats every selected feature in a stable summary', () => {
    expect(
      formatCreateSummary({
        projectName: 'full-app',
        framework: 'nextjs',
        packageManager: 'yarn',
        initializeGit: true,
        addDocker: true,
        addGitHubActions: false,
      }),
    ).toBe(
      [
        'Project configuration',
        '',
        'Name: full-app',
        'Framework: Next.js',
        'Package manager: Yarn',
        'Git: Yes',
        'Docker: Yes',
        'GitHub Actions: No',
      ].join('\n'),
    );
  });
});
