import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { dockerPlugin } from './index.js';

let cwd: string;

beforeEach(async () => {
  cwd = await mkdtemp(path.join(tmpdir(), 'forge-docker-'));
});

afterEach(async () => {
  await rm(cwd, { recursive: true, force: true });
});

async function configureProject(
  dependencies: Record<string, string>,
  scripts: Record<string, string>,
  lockfile: string,
): Promise<void> {
  await writeFile(path.join(cwd, 'package.json'), JSON.stringify({ dependencies, scripts }));
  await writeFile(path.join(cwd, lockfile), '');
}

describe('dockerPlugin', () => {
  it.each([
    {
      name: 'Next.js with pnpm',
      dependencies: { next: '^15' },
      scripts: { build: 'next build', start: 'next start' },
      lockfile: 'pnpm-lock.yaml',
      expected: ['pnpm install --frozen-lockfile', 'pnpm run build', 'pnpm run start'],
    },
    {
      name: 'React with Vite and npm',
      dependencies: { react: '^19', vite: '^7' },
      scripts: { build: 'vite build', preview: 'vite preview' },
      lockfile: 'package-lock.json',
      expected: ['npm ci', 'npm run build', 'npm run preview -- --host 0.0.0.0'],
    },
    {
      name: 'Express with yarn',
      dependencies: { express: '^5' },
      scripts: { start: 'node index.js' },
      lockfile: 'yarn.lock',
      expected: ['yarn install --frozen-lockfile', 'yarn start'],
    },
  ])(
    'generates framework-aware output for $name',
    async ({ dependencies, scripts, lockfile, expected }) => {
      await configureProject(dependencies, scripts, lockfile);

      expect((await dockerPlugin.apply({ cwd })).status).toBe('applied');
      const output = await readFile(path.join(cwd, 'Dockerfile'), 'utf8');
      for (const value of expected) expect(output).toContain(value);
    },
  );

  it('is idempotent and never overwrites existing files', async () => {
    await configureProject({}, { start: 'node index.js' }, 'package-lock.json');
    await writeFile(path.join(cwd, 'Dockerfile'), 'custom dockerfile');
    const firstResult = await dockerPlugin.apply({ cwd });
    const secondResult = await dockerPlugin.apply({ cwd });

    await expect(readFile(path.join(cwd, 'Dockerfile'), 'utf8')).resolves.toBe('custom dockerfile');
    expect(firstResult).toMatchObject({
      status: 'applied',
      createdFiles: ['.dockerignore'],
      skippedFiles: ['Dockerfile'],
    });
    expect(secondResult).toMatchObject({ status: 'skipped', createdFiles: [] });
  });

  it('returns unsupported without creating files for an unknown project', async () => {
    const result = await dockerPlugin.apply({ cwd });

    expect(result.status).toBe('unsupported');
    await expect(readFile(path.join(cwd, 'Dockerfile'), 'utf8')).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });
});
