import { mkdtemp, mkdir, readdir, utimes } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PluginStore } from '@forgecli7/plugins';
import { MarketplaceCache } from './cache.js';
import { createSignedTestMarketplace, TestMarketplaceProvider } from './fixtures/index.js';
import { MarketplaceService, UnconfiguredMarketplaceProvider } from './service.js';

const temporary: string[] = [];
afterEach(async () => {
  const { rm } = await import('node:fs/promises');
  await Promise.all(temporary.splice(0).map((item) => rm(item, { recursive: true, force: true })));
});
async function setup(fixture = createSignedTestMarketplace()) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'forgeki-service-'));
  temporary.push(root);
  const service = new MarketplaceService(
    new TestMarketplaceProvider(fixture),
    [fixture.root],
    new MarketplaceCache(path.join(root, 'cache')),
    new PluginStore(path.join(root, 'plugins')),
    '0.1.0',
    path.join(root, 'quarantine'),
  );
  await service.refresh();
  return { root, service, store: service.store };
}

describe('remote Marketplace service', () => {
  it('reports production provider as honestly unconfigured', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'forgeki-service-'));
    temporary.push(root);
    const service = new MarketplaceService(
      new UnconfiguredMarketplaceProvider(),
      [],
      new MarketplaceCache(path.join(root, 'cache')),
      new PluginStore(path.join(root, 'plugins')),
    );
    await expect(service.status()).resolves.toMatchObject({
      configured: false,
      connectivity: 'unconfigured',
    });
    await expect(service.refresh()).rejects.toThrow(/not configured/u);
  });
  it('refreshes, searches locally, filters, and shows publisher trust', async () => {
    const { service } = await setup();
    expect(
      await service.search({ text: 'zod', framework: 'nextjs', verifiedPublisher: true }),
    ).toHaveLength(1);
    expect((await service.show('community.zod')).publisherStatus).toBe('verified');
  });
  it('requires confirmation and installs through cleaned quarantine', async () => {
    const { root, service, store } = await setup();
    const review = await service.prepareInstall('community.editorconfig');
    expect(review.digestVerified).toBe(true);
    expect(review.signatureVerified).toBe(true);
    await expect(service.install('community.editorconfig')).rejects.toThrow(/confirmation/u);
    const installed = await service.install('community.editorconfig', true);
    expect(installed.metadata.sourceType).toBe('remote');
    expect(installed.metadata.signatureStatus).toBe('verified');
    expect((await readdir(path.join(root, 'quarantine'))).length).toBe(0);
    expect(await store.inspect('community.editorconfig')).toBeDefined();
  });
  it('cleans stale quarantine entries without touching unrelated or fresh entries', async () => {
    const { root, service } = await setup();
    const quarantine = path.join(root, 'quarantine');
    const stale = path.join(quarantine, 'package-00000000-0000-0000-0000-000000000000');
    const fresh = path.join(quarantine, 'package-11111111-1111-1111-1111-111111111111');
    const unrelated = path.join(quarantine, 'keep-me');
    await Promise.all([
      mkdir(stale, { recursive: true }),
      mkdir(fresh, { recursive: true }),
      mkdir(unrelated, { recursive: true }),
    ]);
    await utimes(stale, new Date(0), new Date(0));
    await service.cleanupQuarantine(Date.now(), 60_000);
    expect(await readdir(quarantine)).toEqual(
      expect.arrayContaining(['keep-me', path.basename(fresh)]),
    );
    expect(await readdir(quarantine)).not.toContain(path.basename(stale));
  });
  it('detects an update, prevents downgrade, and preserves installed version on failure', async () => {
    const initial = await setup();
    await initial.service.install('community.editorconfig', true);
    expect(await initial.service.updates()).toHaveLength(0);
    const corruptFixture = createSignedTestMarketplace({
      versionOverrides: { 'community.editorconfig': '0.2.0' },
    });
    corruptFixture.packages.set('community.editorconfig', Buffer.from('corrupt'));
    const corruptService = new MarketplaceService(
      new TestMarketplaceProvider(corruptFixture),
      [corruptFixture.root],
      initial.service.cache,
      initial.store,
      '0.2.0',
      path.join(initial.root, 'quarantine'),
    );
    await corruptService.refresh();
    await expect(corruptService.update('community.editorconfig', true)).rejects.toThrow(/digest/u);
    expect((await initial.store.inspect('community.editorconfig'))?.manifest.version).toBe('0.1.0');
    const updatedFixture = createSignedTestMarketplace({
      versionOverrides: { 'community.editorconfig': '0.2.0' },
    });
    const updateService = new MarketplaceService(
      new TestMarketplaceProvider(updatedFixture),
      [updatedFixture.root],
      initial.service.cache,
      initial.store,
      '0.2.0',
      path.join(initial.root, 'quarantine'),
    );
    await updateService.refresh();
    expect((await updateService.updates())[0]?.updateAvailable).toBe(true);
    const updated = await updateService.update('community.editorconfig', true);
    expect(updated.manifest.version).toBe('0.2.0');
    const oldFixture = createSignedTestMarketplace();
    const oldService = new MarketplaceService(
      new TestMarketplaceProvider(oldFixture),
      [oldFixture.root],
      initial.service.cache,
      initial.store,
      '0.2.0',
      path.join(initial.root, 'quarantine'),
    );
    await oldService.refresh();
    await expect(oldService.update('community.editorconfig', true)).rejects.toThrow(/downgrade/u);
    expect((await initial.store.inspect('community.editorconfig'))?.manifest.version).toBe('0.2.0');
  });
  it('blocks incompatible and revoked updates', async () => {
    const initial = await setup();
    await initial.service.install('community.editorconfig', true);
    const incompatible = createSignedTestMarketplace({
      versionOverrides: { 'community.editorconfig': '0.2.0' },
      minimumForgeKiVersions: { 'community.editorconfig': '99.0.0' },
    });
    const incompatibleService = new MarketplaceService(
      new TestMarketplaceProvider(incompatible),
      [incompatible.root],
      initial.service.cache,
      initial.store,
      '0.1.0',
      path.join(initial.root, 'quarantine'),
    );
    await incompatibleService.refresh();
    await expect(incompatibleService.update('community.editorconfig', true)).rejects.toThrow(
      /newer ForgeKi/u,
    );

    const revoked = createSignedTestMarketplace({
      versionOverrides: { 'community.editorconfig': '0.2.0' },
      revoked: 'community.editorconfig@0.2.0',
    });
    const revokedService = new MarketplaceService(
      new TestMarketplaceProvider(revoked),
      [revoked.root],
      initial.service.cache,
      initial.store,
      '0.2.0',
      path.join(initial.root, 'quarantine'),
    );
    await revokedService.refresh();
    await expect(revokedService.update('community.editorconfig', true)).rejects.toThrow(/revoked/u);
  });
  it('blocks new installs when verified revocation metadata is stale', async () => {
    const { service } = await setup();
    const snapshot = await service.snapshot();
    await service.cache.write({ ...snapshot, verifiedAt: '2020-01-01T00:00:00.000Z' });
    await expect(service.prepareInstall('community.editorconfig')).rejects.toThrow(
      /revocation metadata is stale/iu,
    );
    await expect(service.search({ text: 'editorconfig' })).resolves.toHaveLength(1);
  });
  it('warns and requires separate confirmation for permission expansion', async () => {
    const initial = await setup();
    await initial.service.install('community.editorconfig', true);
    const fixture = createSignedTestMarketplace({
      versionOverrides: { 'community.editorconfig': '0.2.0' },
      permissionAdditions: { 'community.editorconfig': ['project:add-scripts'] },
    });
    const service = new MarketplaceService(
      new TestMarketplaceProvider(fixture),
      [fixture.root],
      initial.service.cache,
      initial.store,
      '0.2.0',
      path.join(initial.root, 'quarantine'),
    );
    await service.refresh();
    await expect(service.update('community.editorconfig', true)).rejects.toThrow(
      /additional permissions/u,
    );
    await expect(service.update('community.editorconfig', true, true)).resolves.toMatchObject({
      manifest: { version: '0.2.0' },
    });
  });
  it('disables revoked installed plugins and excludes them from generation', async () => {
    const initial = await setup();
    await initial.service.install('community.editorconfig', true);
    const revoked = createSignedTestMarketplace({ revoked: 'community.editorconfig@0.1.0' });
    const service = new MarketplaceService(
      new TestMarketplaceProvider(revoked),
      [revoked.root],
      initial.service.cache,
      initial.store,
      '0.1.0',
      path.join(initial.root, 'quarantine'),
    );
    await service.refresh();
    expect((await initial.store.inspect('community.editorconfig'))?.disabledReason).toMatch(
      /Revoked/u,
    );
    expect(await initial.store.loadPlanSources()).toHaveLength(0);
  });
  it('blocks wrong digest, invalid signatures, and revoked publishers safely', async () => {
    const fixture = createSignedTestMarketplace();
    const entry = (
      fixture.documents.index.document as { plugins: Array<{ id: string; packageSha256: string }> }
    ).plugins[0]!;
    fixture.packages.set(entry.id, new Uint8Array([1, 2, 3]));
    const { service } = await setup(fixture);
    await expect(service.prepareInstall(entry.id)).rejects.toThrow(/digest/u);
  });
});
