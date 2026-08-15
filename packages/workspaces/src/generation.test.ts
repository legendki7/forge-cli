import { mkdir, mkdtemp, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { getWorkspacePreset } from './model.js';
import { createWorkspaceGenerationPlan, executeWorkspaceGenerationPlan } from './generation.js';

const temporary: string[] = [];
afterEach(async () =>
  Promise.all(
    temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  ),
);

describe('workspace generation', () => {
  it('creates an atomic deterministic SaaS monorepo without installing dependencies', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'forgeki-workspace-'));
    temporary.push(root);
    const definition = getWorkspacePreset('saas-foundation')!.definition;
    const plan = await createWorkspaceGenerationPlan(definition, { destinationDirectory: root });
    const commands: string[] = [];
    const result = await executeWorkspaceGenerationPlan(plan, {
      run: async (command, args) => {
        commands.push([command, ...args].join(' '));
        return { exitCode: 0 };
      },
    });
    expect(commands).toEqual(['git init']);
    expect(result.createdFiles).toContain('docker-compose.yml');
    expect(result.createdFiles).toContain('forgeki.workspace.json');
    await expect(
      readFile(path.join(result.workspaceDirectory, 'apps/web/package.json'), 'utf8'),
    ).resolves.toContain('@workspace/web');
    await expect(
      readFile(path.join(result.workspaceDirectory, '.github/workflows/ci.yml'), 'utf8'),
    ).resolves.toContain('pnpm build');
    await expect(executeWorkspaceGenerationPlan(plan)).rejects.toThrow(/already exists/u);
  });

  it('produces byte-identical plans for the same definition', async () => {
    const definition = getWorkspacePreset('full-stack-postgres')!.definition;
    const one = await createWorkspaceGenerationPlan(definition, {
      destinationDirectory: 'C:/safe',
    });
    const two = await createWorkspaceGenerationPlan(definition, {
      destinationDirectory: 'C:/safe',
    });
    expect(two).toEqual(one);
  });

  it('refuses a symbolic-link destination before writing', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'forgeki-workspace-link-'));
    temporary.push(root);
    const actual = path.join(root, 'actual');
    const linked = path.join(root, 'linked');
    await mkdir(actual);
    await symlink(actual, linked, process.platform === 'win32' ? 'junction' : 'dir');
    const plan = await createWorkspaceGenerationPlan(
      getWorkspacePreset('full-stack-starter')!.definition,
      { destinationDirectory: linked },
    );
    await expect(executeWorkspaceGenerationPlan(plan)).rejects.toThrow(/symbolic link/u);
  });
});
