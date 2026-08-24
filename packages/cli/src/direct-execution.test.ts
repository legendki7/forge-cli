import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { isDirectExecution } from './direct-execution.js';

const root = path.resolve(import.meta.dirname, '../../..');
const entrypoint = path.join(root, 'packages/cli/dist/index.js');
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('CLI direct execution', () => {
  it('recognizes a normal real-path invocation', () => {
    expect(isDirectExecution(pathToFileURL(entrypoint).href, entrypoint)).toBe(true);
  });

  it('is safe when the argv entry is missing', () => {
    expect(isDirectExecution(pathToFileURL(entrypoint).href, undefined)).toBe(false);
  });

  it('executes the built CLI entrypoint directly', () => {
    const result = invokeNode([entrypoint, '--version']);
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('0.1.0');
  }, 30_000);

  it('does not execute when imported by another module', async () => {
    const directory = await createTemporaryDirectory();
    const importer = path.join(directory, 'import-cli.mjs');
    await writeFile(importer, `await import(${JSON.stringify(pathToFileURL(entrypoint).href)});\n`);

    const result = invokeNode([importer]);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
  });

  it.runIf(process.platform !== 'win32')(
    'executes through a filesystem symlink',
    async () => {
      const directory = await createTemporaryDirectory();
      const linkedEntrypoint = path.join(directory, 'forge');
      await symlink(entrypoint, linkedEntrypoint, 'file');

      expect(isDirectExecution(pathToFileURL(entrypoint).href, linkedEntrypoint)).toBe(true);
      const result = invokeNode([linkedEntrypoint, '--version']);
      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe('0.1.0');
    },
    30_000,
  );
});

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'forgeki-cli-entrypoint-'));
  temporaryDirectories.push(directory);
  return directory;
}

function invokeNode(args: string[]) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, FORCE_COLOR: '0' },
    shell: false,
  });

  if (result.status !== 0) {
    throw new Error(
      [
        'CLI subprocess failed.',
        `Executable: ${process.execPath}`,
        `Arguments: ${JSON.stringify(args)}`,
        `Cwd: ${root}`,
        `Status: ${String(result.status)}`,
        `Signal: ${String(result.signal)}`,
        `Spawn error: ${result.error ? `${result.error.name}: ${result.error.message}` : '<none>'}`,
        `Stdout:\n${result.stdout || '<empty>'}`,
        `Stderr:\n${result.stderr || '<empty>'}`,
      ].join('\n'),
    );
  }

  return result;
}
