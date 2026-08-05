import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { detectProject } from './project-detection.js';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function fixture(files: Record<string, string> = {}): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'forge-detection-'));
  directories.push(directory);
  for (const [file, content] of Object.entries(files)) {
    const destination = path.join(directory, file);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, content);
  }
  return directory;
}

function packageJson(value: object): string {
  return JSON.stringify(value);
}

describe('detectProject', () => {
  it('detects Next.js with pnpm and TypeScript metadata', async () => {
    const directory = await fixture({
      'package.json': packageJson({
        name: 'next-app',
        scripts: { build: 'next build', start: 'next start' },
        dependencies: { next: '^15.0.0', react: '^19.0.0' },
        devDependencies: { typescript: '^5.0.0' },
      }),
      'pnpm-lock.yaml': 'lockfileVersion: 9',
      'tsconfig.json': '{}',
      'next.config.ts': 'export default {}',
    });

    await expect(detectProject(directory)).resolves.toMatchObject({
      projectName: 'next-app',
      framework: 'nextjs',
      packageManager: 'pnpm',
      language: 'typescript',
      scripts: { build: 'next build', start: 'next start' },
    });
  });

  it('detects React with Vite, npm, and JavaScript', async () => {
    const directory = await fixture({
      'package.json': packageJson({ dependencies: { react: '^19', vite: '^7' } }),
      'package-lock.json': '{}',
      'vite.config.js': 'export default {}',
      'src/main.jsx': 'export default null;',
    });

    await expect(detectProject(directory)).resolves.toMatchObject({
      framework: 'react-vite',
      packageManager: 'npm',
      language: 'javascript',
    });
  });

  it('detects Express with yarn', async () => {
    const directory = await fixture({
      'package.json': packageJson({ dependencies: { express: '^5' } }),
      'yarn.lock': '',
    });

    await expect(detectProject(directory)).resolves.toMatchObject({
      framework: 'express',
      packageManager: 'yarn',
      language: 'javascript',
    });
  });

  it('detects a generic Node.js project', async () => {
    const directory = await fixture({ 'package.json': packageJson({ name: 'plain-node' }) });

    await expect(detectProject(directory)).resolves.toMatchObject({
      framework: 'node',
      packageManager: 'unknown',
      language: 'javascript',
    });
  });

  it('detects TypeScript from source files', async () => {
    const directory = await fixture({
      'package.json': packageJson({}),
      'src/index.ts': 'export {};',
    });

    expect((await detectProject(directory)).language).toBe('typescript');
  });

  it('handles a missing package.json', async () => {
    const result = await detectProject(await fixture({ 'index.js': 'console.log("hello")' }));

    expect(result.framework).toBe('unknown');
    expect(result.language).toBe('javascript');
    expect(result.warnings).toContain('No package.json was found.');
  });

  it('handles malformed package.json without throwing', async () => {
    const result = await detectProject(await fixture({ 'package.json': '{broken' }));

    expect(result.framework).toBe('unknown');
    expect(result.warnings).toContain('package.json is malformed and could not be parsed.');
  });

  it('warns about multiple lockfiles and uses documented priority', async () => {
    const directory = await fixture({
      'package.json': packageJson({}),
      'pnpm-lock.yaml': '',
      'package-lock.json': '{}',
      'yarn.lock': '',
    });
    const result = await detectProject(directory);

    expect(result.packageManager).toBe('pnpm');
    expect(
      result.warnings.some((warning) => warning.includes('Multiple package-manager lockfiles')),
    ).toBe(true);
  });

  it('returns unknown for an empty directory', async () => {
    await expect(detectProject(await fixture())).resolves.toMatchObject({
      framework: 'unknown',
      packageManager: 'unknown',
      language: 'unknown',
    });
  });

  it('detects package manager metadata before installation', async () => {
    const directory = await fixture({
      'package.json': packageJson({ name: 'new-app', packageManager: 'yarn@4.9.2' }),
    });

    await expect(detectProject(directory)).resolves.toMatchObject({ packageManager: 'yarn' });
  });

  it('prefers a conflicting lockfile and returns a warning', async () => {
    const directory = await fixture({
      'package.json': packageJson({ packageManager: 'bun@1.2.20' }),
      'package-lock.json': '{}',
    });
    const result = await detectProject(directory);

    expect(result.packageManager).toBe('npm');
    expect(result.warnings.some((warning) => warning.includes('declares bun'))).toBe(true);
  });
});
