import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Command } from 'commander';
import { afterEach, describe, expect, it } from 'vitest';
import { createProgram } from '../packages/cli/src/program.js';
import type { CreatePromptAdapter } from '../packages/cli/src/prompts.js';
import { loadPlugins } from '../packages/plugins/src/index.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function projectFixture(): Promise<string> {
  const cwd = await mkdtemp(path.join(tmpdir(), 'forge-cli-'));
  temporaryDirectories.push(cwd);
  await writeFile(
    path.join(cwd, 'package.json'),
    JSON.stringify({
      name: 'fixture-app',
      scripts: { build: 'next build', start: 'next start' },
      dependencies: { next: '^15' },
      devDependencies: { typescript: '^5' },
    }),
  );
  await writeFile(path.join(cwd, 'pnpm-lock.yaml'), 'lockfileVersion: 9');
  await writeFile(path.join(cwd, 'tsconfig.json'), '{}');
  return cwd;
}

function fakePrompts(answers: {
  input?: string[];
  select?: string[];
  confirm?: boolean[];
  calls?: string[];
}): CreatePromptAdapter {
  return {
    async input(options) {
      answers.calls?.push(options.message);
      return answers.input?.shift() ?? '';
    },
    async select<T>(options) {
      answers.calls?.push(options.message);
      return (answers.select?.shift() ?? options.default) as T;
    },
    async confirm(options) {
      answers.calls?.push(options.message);
      return answers.confirm?.shift() ?? options.default;
    },
  };
}

function renderedHelp(command: Command): string {
  const output: string[] = [];
  command.configureOutput({ writeOut: (text) => output.push(text) });
  command.outputHelp();
  return output.join('');
}

describe('ForgeKi program', () => {
  it('registers the initial commands', () => {
    const program = createProgram({ cwd: '/workspace', write: () => undefined });
    expect(program.commands.map((command) => command.name())).toEqual([
      'create',
      'add',
      'check',
      'stacks',
    ]);
  });

  it('provides accurate, example-driven help for every command', () => {
    const program = createProgram({ cwd: '/workspace', write: () => undefined });
    const create = program.commands.find((command) => command.name() === 'create');
    const add = program.commands.find((command) => command.name() === 'add');
    const check = program.commands.find((command) => command.name() === 'check');

    expect(renderedHelp(program)).toContain('forge create my-app --no-git');
    expect(renderedHelp(create!)).toContain('Defaults: Next.js, pnpm, Git enabled');
    expect(renderedHelp(create!)).toContain('--interactive');
    expect(renderedHelp(add!)).toContain('forge add github-actions');
    expect(renderedHelp(check!)).toContain('forge check');
    expect(renderedHelp(program)).not.toContain('placeholder');
  });

  it('returns a failure code for an unknown plugin', async () => {
    let exitCode = 0;
    const output: string[] = [];
    await createProgram({
      cwd: '/workspace',
      write: (message) => output.push(message),
      setExitCode: (code) => (exitCode = code),
    }).parseAsync(['add', 'missing-plugin'], { from: 'user' });
    expect(exitCode).toBe(1);
    expect(output).toEqual(['Unknown feature "missing-plugin". Run forge add to list plugins.']);
  });

  it('creates a project non-interactively with useful next steps', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'forge-create-cli-'));
    temporaryDirectories.push(cwd);
    const output: string[] = [];
    const program = createProgram({ cwd, write: (message) => output.push(message) });

    await program.parseAsync(['create', 'demo-app', '--no-git'], { from: 'user' });

    expect(output[0]).toContain('Project created successfully.');
    expect(output[0]).toContain('cd demo-app');
    expect(output[0]).toContain('pnpm dev');
    await expect(readFile(path.join(cwd, 'demo-app', 'package.json'), 'utf8')).resolves.toContain(
      'next dev',
    );
  });

  it('starts the wizard when the project name is omitted', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'forge-create-wizard-'));
    temporaryDirectories.push(cwd);
    const output: string[] = [];
    const calls: string[] = [];
    const promptAdapter = fakePrompts({
      input: ['wizard-app'],
      select: ['npm'],
      confirm: [false, true, true, true],
      calls,
    });

    await createProgram({ cwd, write: (message) => output.push(message) }, loadPlugins(), {
      promptAdapter,
    }).parseAsync(['create'], { from: 'user' });

    expect(calls[0]).toBe('Project name:');
    expect(output[0]).toContain('Package manager: npm');
    await expect(readFile(path.join(cwd, 'wizard-app', 'Dockerfile'), 'utf8')).resolves.toContain(
      'npm install',
    );
    await expect(
      readFile(path.join(cwd, 'wizard-app', '.github', 'workflows', 'ci.yml'), 'utf8'),
    ).resolves.toContain('npm run build');
  });

  it('keeps a named create command non-interactive unless requested', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'forge-create-no-prompt-'));
    temporaryDirectories.push(cwd);
    const promptAdapter: CreatePromptAdapter = {
      input: async () => {
        throw new Error('unexpected prompt');
      },
      select: async () => {
        throw new Error('unexpected prompt');
      },
      confirm: async () => {
        throw new Error('unexpected prompt');
      },
    };

    await createProgram({ cwd, write: () => undefined }, loadPlugins(), {
      promptAdapter,
    }).parseAsync(['create', 'scripted-app', '--no-git'], { from: 'user' });

    await expect(
      readFile(path.join(cwd, 'scripted-app', 'package.json'), 'utf8'),
    ).resolves.toContain('scripted-app');
  });

  it('prompts only for unspecified values in interactive mode', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'forge-create-partial-'));
    temporaryDirectories.push(cwd);
    const calls: string[] = [];
    const promptAdapter = fakePrompts({ confirm: [true], calls });

    await createProgram({ cwd, write: () => undefined }, loadPlugins(), {
      promptAdapter,
    }).parseAsync(
      [
        'create',
        'explicit-app',
        '--interactive',
        '--package-manager',
        'bun',
        '--no-git',
        '--no-docker',
        '--no-github-actions',
      ],
      { from: 'user' },
    );

    expect(calls).toEqual(['Create this project?']);
    await expect(
      readFile(path.join(cwd, 'explicit-app', 'package.json'), 'utf8'),
    ).resolves.toContain('bun@');
  });

  it('cancels without creating files and keeps exit code zero', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'forge-create-cancel-'));
    temporaryDirectories.push(cwd);
    let exitCode = 0;

    await createProgram(
      { cwd, write: () => undefined, setExitCode: (code) => (exitCode = code) },
      loadPlugins(),
      { promptAdapter: fakePrompts({ confirm: [false] }) },
    ).parseAsync(
      ['create', 'cancelled-app', '-i', '--no-git', '--no-docker', '--no-github-actions'],
      { from: 'user' },
    );

    expect(exitCode).toBe(0);
    await expect(readFile(path.join(cwd, 'cancelled-app', 'package.json'))).rejects.toThrow();
  });

  it('fails cleanly instead of hanging when prompts are unavailable', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'forge-create-non-tty-'));
    temporaryDirectories.push(cwd);
    const output: string[] = [];
    let exitCode = 0;

    await createProgram(
      { cwd, write: (message) => output.push(message), setExitCode: (code) => (exitCode = code) },
      loadPlugins(),
      { isInteractiveTerminal: () => false },
    ).parseAsync(['create'], { from: 'user' });

    expect(exitCode).toBe(1);
    expect(output[0]).toContain('forge create my-app');
  });

  it('maps prompt interruption to a conventional nonzero exit code', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'forge-create-interrupt-'));
    temporaryDirectories.push(cwd);
    let exitCode = 0;
    const interruption = new Error('force closed');
    interruption.name = 'ExitPromptError';

    await createProgram(
      { cwd, write: () => undefined, setExitCode: (code) => (exitCode = code) },
      loadPlugins(),
      { promptAdapter: { ...fakePrompts({}), input: async () => Promise.reject(interruption) } },
    ).parseAsync(['create'], { from: 'user' });

    expect(exitCode).toBe(130);
  });

  it('rejects unsafe project names and sets a failure exit code', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'forge-create-invalid-'));
    temporaryDirectories.push(cwd);
    const output: string[] = [];
    let exitCode = 0;

    await createProgram({
      cwd,
      write: (message) => output.push(message),
      setExitCode: (code) => {
        exitCode = code;
      },
    }).parseAsync(['create', '../outside', '--no-git'], { from: 'user' });

    expect(exitCode).toBe(1);
    expect(output[0]).toContain('could not create');
  });

  it('rejects an explicit unsafe name before starting interactive prompts', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'forge-create-invalid-interactive-'));
    temporaryDirectories.push(cwd);
    const calls: string[] = [];
    let exitCode = 0;

    await createProgram(
      { cwd, write: () => undefined, setExitCode: (code) => (exitCode = code) },
      loadPlugins(),
      { promptAdapter: fakePrompts({ calls }) },
    ).parseAsync(['create', '../outside', '--interactive'], { from: 'user' });

    expect(exitCode).toBe(1);
    expect(calls).toEqual([]);
  });

  it('orchestrates Docker and GitHub Actions while creating', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'forge-create-plugins-'));
    temporaryDirectories.push(cwd);
    const output: string[] = [];

    await createProgram({ cwd, write: (message) => output.push(message) }).parseAsync(
      ['create', 'full-app', '--no-git', '--docker', '--github-actions'],
      { from: 'user' },
    );

    await expect(readFile(path.join(cwd, 'full-app', 'Dockerfile'), 'utf8')).resolves.toContain(
      'pnpm install --no-frozen-lockfile',
    );
    await expect(
      readFile(path.join(cwd, 'full-app', '.github', 'workflows', 'ci.yml'), 'utf8'),
    ).resolves.toContain('pnpm run typecheck');
    expect(output[0]).toContain('✓ Added Docker configuration');
    expect(output[0]).toContain('✓ Added GitHub Actions workflow');
  });

  it('prints a readable project report from forge check', async () => {
    const cwd = await projectFixture();
    const output: string[] = [];
    const program = createProgram({ cwd, write: (message) => output.push(message) });

    await program.parseAsync(['check'], { from: 'user' });

    expect(output[0]).toContain('ForgeKi project report');
    expect(output[0]).toContain('Project: fixture-app');
    expect(output[0]).toContain('Framework: Next.js');
    expect(output[0]).toContain('Language: TypeScript');
    expect(output[0]).toContain('Package manager: pnpm');
  });

  it('loads and repeatedly applies the Docker plugin without changing files', async () => {
    const cwd = await projectFixture();
    const firstOutput: string[] = [];
    await createProgram({ cwd, write: (message) => firstOutput.push(message) }).parseAsync(
      ['add', 'docker'],
      { from: 'user' },
    );
    const firstDockerfile = await readFile(path.join(cwd, 'Dockerfile'), 'utf8');

    const secondOutput: string[] = [];
    await createProgram({ cwd, write: (message) => secondOutput.push(message) }).parseAsync(
      ['add', 'docker'],
      { from: 'user' },
    );

    await expect(readFile(path.join(cwd, 'Dockerfile'), 'utf8')).resolves.toBe(firstDockerfile);
    await expect(readFile(path.join(cwd, '.dockerignore'), 'utf8')).resolves.toContain(
      'node_modules',
    );
    expect(firstOutput[0]).toContain('Docker configuration created');
    expect(secondOutput[0]).toContain('Docker is already configured');
  });

  it('loads the GitHub Actions plugin with case-insensitive resolution', async () => {
    const cwd = await projectFixture();
    const output: string[] = [];

    await createProgram({ cwd, write: (message) => output.push(message) }).parseAsync(
      ['add', 'GITHUB-ACTIONS'],
      { from: 'user' },
    );

    await expect(
      readFile(path.join(cwd, '.github', 'workflows', 'ci.yml'), 'utf8'),
    ).resolves.toContain('pnpm run build');
    expect(output[0]).toContain('GitHub Actions workflow created');
  });

  it('lists and shows trusted built-in stack presets', async () => {
    const output: string[] = [];
    const program = createProgram({ cwd: '/workspace', write: (message) => output.push(message) });
    await program.parseAsync(['stacks', 'list'], { from: 'user' });
    await program.parseAsync(['stacks', 'show', 'nextjs-fullstack'], { from: 'user' });
    expect(output[0]).toContain('nextjs-fullstack');
    expect(output[1]).toContain('Next.js Full Stack');
    expect(output[1]).toContain('Prisma');
  });

  it('creates from a built-in preset without breaking non-interactive automation', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'forge-stack-preset-'));
    temporaryDirectories.push(cwd);
    await createProgram({ cwd, write: () => undefined }).parseAsync(
      ['create', 'fullstack', '--preset', 'nextjs-fullstack', '--no-git'],
      { from: 'user' },
    );
    await expect(
      readFile(path.join(cwd, 'fullstack', 'prisma', 'schema.prisma'), 'utf8'),
    ).resolves.toContain('provider = "postgresql"');
    await expect(readFile(path.join(cwd, 'fullstack', 'Dockerfile'), 'utf8')).resolves.toContain(
      'node:20-alpine',
    );
  });

  it('creates an explicit Express SQLite and Drizzle stack', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'forge-stack-express-'));
    temporaryDirectories.push(cwd);
    await createProgram({ cwd, write: () => undefined }).parseAsync(
      [
        'create',
        'api',
        '--framework',
        'express',
        '--database',
        'sqlite',
        '--orm',
        'drizzle',
        '--testing',
        'vitest',
        '--no-git',
      ],
      { from: 'user' },
    );
    await expect(
      readFile(path.join(cwd, 'api', 'src', 'routes', 'health.ts'), 'utf8'),
    ).resolves.toContain("status: 'ok'");
    await expect(readFile(path.join(cwd, 'api', 'drizzle.config.ts'), 'utf8')).resolves.toContain(
      "dialect: 'sqlite'",
    );
  });

  it('rejects incompatible explicit stacks with readable guidance', async () => {
    const output: string[] = [];
    let exitCode = 0;
    await createProgram({
      cwd: '/workspace',
      write: (message) => output.push(message),
      setExitCode: (value) => (exitCode = value),
    }).parseAsync(['create', 'bad', '--framework', 'react-vite', '--database', 'postgres'], {
      from: 'user',
    });
    expect(exitCode).toBe(1);
    expect(output[0]).toContain('cannot directly configure a server database');
  });
});
