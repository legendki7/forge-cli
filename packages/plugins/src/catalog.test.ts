import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { applyBuiltinPlugin, inspectBuiltinPlugins, isBuiltinPluginId } from './catalog';

const temporary: string[] = [];
afterEach(async () =>
  Promise.all(temporary.splice(0).map((root) => rm(root, { recursive: true, force: true }))),
);

async function project() {
  const root = await mkdtemp(path.join(tmpdir(), 'forgeki-catalog-'));
  temporary.push(root);
  await writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'app', scripts: { test: 'vitest' }, dependencies: { next: '15.4.6' } }),
  );
  await writeFile(path.join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n');
  return root;
}

describe('trusted built-in plugin catalog', () => {
  it('contains only the two allowlisted built-ins with package versions and files', async () => {
    const catalog = await inspectBuiltinPlugins();
    expect(catalog.map(({ id }) => id)).toEqual(['docker', 'github-actions']);
    expect(catalog.every(({ version }) => version === '0.1.0')).toBe(true);
    expect(catalog.every(({ builtIn }) => builtIn)).toBe(true);
    expect(isBuiltinPluginId('third-party-package')).toBe(false);
  });

  it('reports available, partial, and installed states without overwriting files', async () => {
    const root = await project();
    expect((await inspectBuiltinPlugins(root)).find(({ id }) => id === 'docker')?.status).toBe(
      'available',
    );
    await writeFile(path.join(root, 'Dockerfile'), 'custom\n');
    expect((await inspectBuiltinPlugins(root)).find(({ id }) => id === 'docker')?.status).toBe(
      'partial',
    );
    const result = await applyBuiltinPlugin(root, 'docker');
    expect(result.createdFiles).toEqual(['.dockerignore']);
    expect(result.skippedFiles).toEqual(['Dockerfile']);
    expect((await inspectBuiltinPlugins(root)).find(({ id }) => id === 'docker')?.status).toBe(
      'installed',
    );
  });

  it('marks unrecognized projects unsupported', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'forgeki-catalog-unknown-'));
    temporary.push(root);
    expect(
      (await inspectBuiltinPlugins(root)).every(({ status }) => status === 'unsupported'),
    ).toBe(true);
  });
});
