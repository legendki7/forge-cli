import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  auditExportMaps,
  auditPackageMetadata,
  classifyOccurrence,
  packageDirectories,
  scanRepositoryMarkers,
  withTemporaryDirectory,
} from '../scripts/release-audit.mjs';
import { createPackedInstallArgs } from '../scripts/packed-validation.mjs';
import { verificationCommands } from '../scripts/release-verify.mjs';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('release candidate audit utilities', () => {
  it('detects blocking identity placeholders and classifies allowed documentation', async () => {
    const root = await fixtureRoot();
    await writeText(path.join(root, 'package.json'), '{"repository":"YOUR_GITHUB_USERNAME"}');
    await writeText(
      path.join(root, 'docs/releasing.md'),
      'Replace YOUR_GITHUB_USERNAME before release.',
    );

    const findings = scanRepositoryMarkers(root);
    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: 'package.json',
          classification: 'must be replaced before release',
        }),
        expect.objectContaining({
          file: 'docs/releasing.md',
          classification: 'intentional documentation example',
        }),
      ]),
    );
    expect(classifyOccurrence('tests/fixture.ts', 'Windows user directory')).toBe('test fixture');
  });

  it('detects a package-scope inconsistency', async () => {
    const root = await packageFixture();
    const target = path.join(root, packageDirectories[0], 'package.json');
    const metadata = JSON.parse(await readText(target));
    metadata.name = '@another-scope/core';
    await writeText(target, JSON.stringify(metadata));
    expect(auditPackageMetadata(root).errors.join('\n')).toContain('inconsistent package scope');
  });

  it('detects inconsistent public package metadata', async () => {
    const root = await packageFixture();
    const target = path.join(root, packageDirectories[1], 'package.json');
    const metadata = JSON.parse(await readText(target));
    metadata.homepage = 'https://invalid.test/project';
    await writeText(target, JSON.stringify(metadata));
    expect(auditPackageMetadata(root).errors.join('\n')).toContain('homepage does not match');
  });

  it('validates export maps against built runtime and declaration files', async () => {
    const root = await packageFixture();
    expect(auditExportMaps(root)).toEqual([]);
    await rm(path.join(root, packageDirectories[2], 'dist/index.d.ts'));
    expect(auditExportMaps(root).join('\n')).toContain('export target is missing');
  });

  it('cleans temporary directories after success and failure', async () => {
    const remove = vi.fn();
    const dependencies = { create: () => 'temporary-release-directory', remove };
    await expect(withTemporaryDirectory('unused-', async () => 'ok', dependencies)).resolves.toBe(
      'ok',
    );
    expect(remove).toHaveBeenCalledWith('temporary-release-directory');

    remove.mockClear();
    await expect(
      withTemporaryDirectory(
        'unused-',
        async () => Promise.reject(new Error('failure')),
        dependencies,
      ),
    ).rejects.toThrow('failure');
    expect(remove).toHaveBeenCalledWith('temporary-release-directory');
  });

  it('contains no publication command or global npm mutation', () => {
    expect(verificationCommands.flat().join(' ')).not.toMatch(/publish|tag|push/u);
    const installArgs = createPackedInstallArgs('isolated-prefix', ['cli.tgz']);
    expect(installArgs).not.toContain('--global');
    expect(installArgs).not.toContain('config');
    expect(installArgs).toContain('--prefix');
  });
});

async function fixtureRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'forgecli-release-audit-test-'));
  temporaryDirectories.push(root);
  return root;
}

async function packageFixture(): Promise<string> {
  const root = await fixtureRoot();
  const repository = 'git+https://github.test/owner/forge-cli.git';
  const homepage = 'https://github.test/owner/forge-cli#readme';
  const bugs = 'https://github.test/owner/forge-cli/issues';
  await writeText(
    path.join(root, 'package.json'),
    JSON.stringify({
      repository: { url: repository },
      homepage,
      bugs: { url: bugs },
      license: 'MIT',
    }),
  );
  for (const [index, directory] of packageDirectories.entries()) {
    const name = directory === 'packages/cli' ? '@forgecli7/cli' : `@forgecli7/package-${index}`;
    const metadata = {
      name,
      version: '0.1.0',
      author: 'ForgeKi contributors',
      license: 'MIT',
      type: 'module',
      repository: { url: repository },
      homepage,
      bugs: { url: bugs },
      main: './dist/index.js',
      types: './dist/index.d.ts',
      exports: { '.': { import: './dist/index.js', types: './dist/index.d.ts' } },
      ...(directory === 'packages/cli' ? { bin: { forge: './dist/index.js' } } : {}),
    };
    await writeText(path.join(root, directory, 'package.json'), JSON.stringify(metadata));
    await writeText(path.join(root, directory, 'dist/index.js'), 'export {};\n');
    await writeText(path.join(root, directory, 'dist/index.d.ts'), 'export {};\n');
  }
  return root;
}

async function writeText(file: string, content: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content, 'utf8');
}

async function readText(file: string): Promise<string> {
  return readFile(file, 'utf8');
}
