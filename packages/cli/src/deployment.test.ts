import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createProgram } from './program.js';

const temporary: string[] = [];
afterEach(async () => {
  const { rm } = await import('node:fs/promises');
  await Promise.all(
    temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'forgeki-cli-deploy-'));
  temporary.push(root);
  await writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({
      name: 'web',
      packageManager: 'pnpm@10.15.0',
      scripts: { build: 'vite build', start: 'vite preview' },
      dependencies: { react: '^19.0.0' },
      devDependencies: { vite: '^7.0.0' },
    }),
  );
  await writeFile(
    path.join(root, '.env.production.example'),
    'VITE_API_URL=https://example.invalid\nDATABASE_URL=do-not-print\n',
  );
  return root;
}

async function run(cwd: string, args: string[]) {
  const output: string[] = [];
  let exitCode = 0;
  const program = createProgram({
    cwd,
    write: (value) => output.push(value),
    setExitCode: (value) => {
      exitCode = value;
    },
  });
  program.exitOverride();
  await program.parseAsync(['node', 'forge', ...args]);
  return { output: output.join('\n'), exitCode };
}

describe('deployment CLI', () => {
  it('lists environment profiles and targets without a deploy command', async () => {
    const root = await fixture();
    expect((await run(root, ['environments', 'list'])).output).toMatch(
      /local[\s\S]*staging[\s\S]*production/u,
    );
    const targets = (await run(root, ['deployment', 'targets', '.'])).output;
    expect(targets).toContain('static-export');
    const commands = createProgram().commands.map((command) => command.name());
    expect(commands).not.toContain('deploy');
  });

  it('checks and previews a safe production static plan without printing local values', async () => {
    const root = await fixture();
    const check = await run(root, [
      'deployment',
      'check',
      '.',
      '--env',
      'production',
      '--target',
      'static',
    ]);
    expect(check.output).toContain('Ready');
    const preview = await run(root, [
      'deployment',
      'plan',
      '.',
      '--env',
      'production',
      '--target',
      'static',
    ]);
    expect(preview.output).toContain('deployment/static.json');
    expect(preview.output).not.toContain('do-not-print');
    expect(preview.output).not.toContain('https://example.invalid');
  });

  it('exports with explicit confirmation and refuses overwrite', async () => {
    const root = await fixture();
    const output = path.join(root, 'bundle');
    const first = await run(root, [
      'deployment',
      'export',
      '.',
      '--env',
      'production',
      '--target',
      'static',
      '--output',
      output,
      '--yes',
    ]);
    expect(first.exitCode).toBe(0);
    expect(first.output).toContain('did not deploy anything');
    expect(await readFile(path.join(output, 'DEPLOYMENT.md'), 'utf8')).toContain(
      'generated deployment configuration only',
    );
    const second = await run(root, [
      'deployment',
      'export',
      '.',
      '--env',
      'production',
      '--target',
      'static',
      '--output',
      output,
      '--yes',
    ]);
    expect(second.exitCode).toBe(1);
    expect(second.output).toContain('Export blocked');
  });
});
