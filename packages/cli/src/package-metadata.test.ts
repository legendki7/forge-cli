import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readCliPackageMetadata } from './package-metadata.js';
import { createProgram } from './program.js';

describe('CLI package metadata', () => {
  it('uses package metadata as the version command source', async () => {
    const metadata = readCliPackageMetadata();
    const output: string[] = [];
    const program = createProgram(undefined, undefined, {}, metadata.version);
    program.configureOutput({ writeOut: (text) => output.push(text) });
    program.exitOverride();

    await expect(program.parseAsync(['node', 'forge', '--version'])).rejects.toMatchObject({
      code: 'commander.version',
      exitCode: 0,
    });
    expect(output.join('').trim()).toBe(metadata.version);
  });

  it('aligns the root and CLI Node.js engine policies', async () => {
    const root = JSON.parse(await readFile(path.resolve('package.json'), 'utf8'));
    const cli = readCliPackageMetadata();
    expect(cli.engines.node).toBe(root.engines.node);
  });

  it('maps forge to a shebang-enabled compiled entry point', async () => {
    const packageJson = JSON.parse(
      await readFile(path.resolve('packages/cli/package.json'), 'utf8'),
    );
    const config = await readFile(path.resolve('packages/cli/tsup.config.ts'), 'utf8');
    expect(packageJson.bin).toEqual({ forge: './dist/index.js' });
    expect(config).toContain("js: '#!/usr/bin/env node'");
  });
});
