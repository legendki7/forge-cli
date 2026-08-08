import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { afterEach, describe, expect, it } from 'vitest';
import { serializePluginManifest, type ForgeKiPluginManifest } from '@forgecli7/plugin-sdk';
import {
  BUNDLED_COMMUNITY_PLUGINS,
  BuiltInCatalogProvider,
  BundledCommunityCatalogProvider,
  LocalInstalledCatalogProvider,
  PluginStore,
  composePluginCatalog,
  createPluginStarter,
  evaluatePluginScannerRules,
} from './community.js';

const roots: string[] = [];
afterEach(async () =>
  Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))),
);
async function temp() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'forgeki-plugin-'));
  roots.push(root);
  return root;
}
async function fixture(root: string, mutate?: (manifest: ForgeKiPluginManifest) => void) {
  const source = path.join(root, 'source');
  await mkdir(source);
  const manifest = structuredClone(BUNDLED_COMMUNITY_PLUGINS[0]!);
  mutate?.(manifest);
  await writeFile(path.join(source, 'forgeki.plugin.json'), serializePluginManifest(manifest));
  return source;
}

describe('restricted community plugin storage', () => {
  it('installs atomically, upgrades, lists, verifies, and removes a valid plugin', async () => {
    const root = await temp();
    const store = new PluginStore(path.join(root, 'installed'));
    const source = await fixture(root);
    const first = await store.install(source, { installedAt: '2026-01-01T00:00:00.000Z' });
    expect(first.integrity).toBe('valid');
    expect((await store.list()).map(({ manifest }) => manifest.id)).toEqual([
      'community.editorconfig',
    ]);
    const second = await store.install(source, { installedAt: '2026-01-02T00:00:00.000Z' });
    expect(second.metadata.installedAt).toBe('2026-01-02T00:00:00.000Z');
    await store.remove('community.editorconfig');
    expect(await store.list()).toEqual([]);
  });
  it('blocks unsafe paths and lifecycle scripts without installing', async () => {
    const root = await temp();
    const store = new PluginStore(path.join(root, 'installed'));
    const source = await fixture(root);
    const manifest = JSON.parse(
      await readFile(path.join(source, 'forgeki.plugin.json'), 'utf8'),
    ) as ForgeKiPluginManifest;
    manifest.contributions.generatedFiles = [{ path: '../evil.txt', content: 'bad' }];
    await writeFile(path.join(source, 'forgeki.plugin.json'), JSON.stringify(manifest));
    expect((await store.validate(source)).report.result).toBe('blocked');
    await expect(store.install(source)).rejects.toThrow();
    expect(await store.list()).toEqual([]);
  });
  it('rejects symlink template sources', async () => {
    const root = await temp();
    const store = new PluginStore(path.join(root, 'installed'));
    const source = await fixture(root, (manifest) => {
      manifest.contributions.generatedFiles = [{ path: 'safe.txt', source: 'templates/link.txt' }];
    });
    await mkdir(path.join(source, 'templates'));
    await writeFile(path.join(root, 'outside.txt'), 'outside');
    try {
      await symlink(path.join(root, 'outside.txt'), path.join(source, 'templates', 'link.txt'));
    } catch {
      return;
    }
    expect((await store.validate(source)).report.result).toBe('blocked');
  });
  it('detects modified and missing installed content and disables it', async () => {
    const root = await temp();
    const store = new PluginStore(path.join(root, 'installed'));
    const source = await fixture(root, (manifest) => {
      manifest.contributions.generatedFiles = [{ path: 'safe.txt', source: 'templates/safe.txt' }];
    });
    await mkdir(path.join(source, 'templates'));
    await writeFile(path.join(source, 'templates', 'safe.txt'), 'safe');
    const installed = await store.install(source);
    await writeFile(path.join(installed.directory, 'files', 'templates', 'safe.txt'), 'changed');
    await expect(store.inspect(installed.manifest.id)).resolves.toMatchObject({
      integrity: 'corrupted',
    });
  });
  it('composes built-in, bundled, and installed providers without trust confusion', async () => {
    const root = await temp();
    const store = new PluginStore(path.join(root, 'installed'));
    await store.installBundled('community.editorconfig');
    const catalog = await composePluginCatalog([
      new BuiltInCatalogProvider(),
      new BundledCommunityCatalogProvider(store),
      new LocalInstalledCatalogProvider(store),
    ]);
    expect(catalog.find(({ id }) => id === 'forgeki.docker')).toMatchObject({
      trusted: true,
      builtIn: true,
    });
    expect(catalog.find(({ id }) => id === 'community.editorconfig')).toMatchObject({
      trusted: false,
      declarative: true,
      installed: true,
    });
  });
  it('creates and validates a safe developer starter', async () => {
    const root = await temp();
    const project = await createPluginStarter(root, 'My Plugin');
    const report = await new PluginStore(path.join(root, 'installed')).validate(project);
    expect(report.report.result).toBe('safe');
  });
  it('evaluates bounded scanner evidence without executing content', async () => {
    const root = await temp();
    const store = new PluginStore(path.join(root, 'installed'));
    const plugin = await store.installBundled('community.editorconfig');
    const project = path.join(root, 'project');
    await mkdir(project);
    await writeFile(path.join(project, '.editorconfig'), 'root = true');
    await expect(
      evaluatePluginScannerRules(plugin, {
        directory: project,
        dependencies: {},
        devDependencies: {},
        scripts: {},
      }),
    ).resolves.toEqual([
      {
        pluginId: 'community.editorconfig',
        componentId: 'editorconfig',
        evidence: ['file:.editorconfig'],
      },
    ]);
  });
});
