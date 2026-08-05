import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { detectProject, type ForgePlugin, type SupportedPackageManager } from '@forgecli/core';
import {
  createProject,
  CreateProjectError,
  type CreateProjectOptions,
  type ProcessExecutor,
} from './scaffold.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function root(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'forge-scaffold-'));
  roots.push(directory);
  return directory;
}

function executor(exitCode = 0): ProcessExecutor & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    run: async (command, args, cwd) => {
      calls.push(`${command} ${args.join(' ')} @ ${cwd}`);
      return { exitCode };
    },
  };
}

function options(
  destinationDirectory: string,
  overrides: Partial<CreateProjectOptions> = {},
): CreateProjectOptions {
  return {
    projectName: 'demo-app',
    destinationDirectory,
    framework: 'nextjs',
    packageManager: 'pnpm',
    initializeGit: false,
    addDocker: false,
    addGitHubActions: false,
    ...overrides,
  };
}

describe('createProject', () => {
  it.each(['pnpm', 'npm', 'yarn', 'bun'] as const)(
    'creates a deterministic %s Next.js project detected before installation',
    async (packageManager: SupportedPackageManager) => {
      const parent = await root();
      const result = await createProject(options(parent, { packageManager }));
      const manifest = JSON.parse(
        await readFile(path.join(result.projectDirectory, 'package.json'), 'utf8'),
      ) as {
        packageManager: string;
        scripts: Record<string, string>;
        dependencies: Record<string, string>;
      };
      const detection = await detectProject(result.projectDirectory);

      expect(manifest.packageManager.startsWith(`${packageManager}@`)).toBe(true);
      expect(manifest.scripts).toMatchObject({
        dev: 'next dev',
        build: 'next build',
        typecheck: 'tsc --noEmit',
      });
      expect(manifest.dependencies).toHaveProperty('next');
      expect(detection).toMatchObject({
        framework: 'nextjs',
        language: 'typescript',
        packageManager,
      });
      expect(result.createdFiles).toContain('src/app/page.tsx');
      expect(await readdir(result.projectDirectory)).not.toContain('node_modules');
    },
  );

  it('allows an existing empty destination and initializes Git through the executor', async () => {
    const parent = await root();
    await mkdir(path.join(parent, 'demo-app'));
    const processExecutor = executor();
    const result = await createProject(options(parent, { initializeGit: true, processExecutor }));

    expect(result.gitInitialized).toBe(true);
    expect(processExecutor.calls).toHaveLength(1);
    expect(processExecutor.calls[0]).toContain('git init');
  });

  it('rejects an existing non-empty destination without overwriting', async () => {
    const parent = await root();
    const destination = path.join(parent, 'demo-app');
    await mkdir(destination);
    await writeFile(path.join(destination, 'owned.txt'), 'keep me');

    await expect(createProject(options(parent))).rejects.toMatchObject({
      code: 'DESTINATION_NOT_EMPTY',
    });
    await expect(readFile(path.join(destination, 'owned.txt'), 'utf8')).resolves.toBe('keep me');
  });

  it('rejects symbolic-link destinations', async () => {
    const parent = await root();
    const target = await root();
    await symlink(target, path.join(parent, 'demo-app'), 'junction');

    await expect(createProject(options(parent))).rejects.toMatchObject({
      code: 'UNSAFE_DESTINATION',
    });
  });

  it('allows only one concurrent creation and leaves a complete project', async () => {
    const parent = await root();
    const results = await Promise.allSettled([
      createProject(options(parent)),
      createProject(options(parent)),
    ]);

    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(({ status }) => status === 'rejected')).toHaveLength(1);
    await expect(
      readFile(path.join(parent, 'demo-app', 'package.json'), 'utf8'),
    ).resolves.toContain('demo-app');
  });

  it('warns when Git is unavailable and preserves the project', async () => {
    const parent = await root();
    const result = await createProject(
      options(parent, { initializeGit: true, processExecutor: executor(1) }),
    );

    expect(result.gitInitialized).toBe(false);
    expect(result.warnings[0]).toContain('Git was not initialized');
    await expect(
      readFile(path.join(result.projectDirectory, 'package.json'), 'utf8'),
    ).resolves.toBeTruthy();
  });

  it('applies requested plugins in Docker then GitHub Actions order', async () => {
    const parent = await root();
    const order: string[] = [];
    const plugin = (id: string, file: string): ForgePlugin => ({
      id,
      name: id,
      description: id,
      detect: async () => ({ detected: false, message: '', files: [] }),
      apply: async ({ cwd }) => {
        order.push(id);
        await writeFile(path.join(cwd, file), `${id}\n`);
        return { status: 'applied', message: id, createdFiles: [file], skippedFiles: [] };
      },
    });
    const result = await createProject(
      options(parent, {
        addDocker: true,
        addGitHubActions: true,
        plugins: [plugin('github-actions', 'actions.txt'), plugin('docker', 'docker.txt')],
      }),
    );

    expect(order).toEqual(['docker', 'github-actions']);
    expect(result.appliedPlugins).toEqual(['docker', 'github-actions']);
  });

  it('preserves the base project and reports plugin failure', async () => {
    const parent = await root();
    const failing: ForgePlugin = {
      id: 'docker',
      name: 'Docker',
      description: 'fails',
      detect: async () => ({ detected: false, message: '', files: [] }),
      apply: async () => {
        throw new Error('simulated failure');
      },
    };
    const result = await createProject(options(parent, { addDocker: true, plugins: [failing] }));

    expect(result.warnings[0]).toContain('simulated failure');
    await expect(
      readFile(path.join(result.projectDirectory, 'package.json'), 'utf8'),
    ).resolves.toBeTruthy();
  });

  it('rejects invalid names before creating files', async () => {
    const parent = await root();
    await expect(
      createProject(options(parent, { projectName: '../outside' })),
    ).rejects.toBeInstanceOf(CreateProjectError);
    expect(await readdir(parent)).toEqual([]);
  });

  it('generates stable text without absolute paths or timestamps', async () => {
    const parent = await root();
    const result = await createProject(options(parent));
    for (const file of result.createdFiles.filter((file) => file !== 'public/.gitkeep')) {
      const content = await readFile(path.join(result.projectDirectory, file), 'utf8');
      expect(content.endsWith('\n')).toBe(true);
      expect(content).not.toContain(parent);
      expect(content).not.toMatch(/20\d\d-\d\d-\d\dT/);
    }
  });
});
