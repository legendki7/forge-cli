import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { StackDefinition } from '@forgecli7/core';
import { PluginStore } from '@forgecli7/plugins';
import { createGenerationPlan, executeGenerationPlan } from '@forgecli7/templates';
import { MarketplaceCache, MarketplaceService } from '@forgecli7/marketplace';
import {
  TestMarketplaceProvider,
  createSignedTestMarketplace,
} from '../packages/marketplace/src/fixtures/index.js';

const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((item) => rm(item, { recursive: true, force: true })));
});

function service(
  root: string,
  store: PluginStore,
  fixture: ReturnType<typeof createSignedTestMarketplace>,
) {
  return new MarketplaceService(
    new TestMarketplaceProvider(fixture),
    [fixture.root],
    new MarketplaceCache(path.join(root, 'cache')),
    store,
    '0.3.0',
    path.join(root, 'quarantine'),
  );
}

describe('native Marketplace pipeline smoke', () => {
  it('refreshes, installs, generates, updates, revokes, disables, and removes safely', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'forgeki-native-marketplace-'));
    temporary.push(root);
    const store = new PluginStore(path.join(root, 'plugins'));
    const initial = service(root, store, createSignedTestMarketplace());

    await expect(initial.refresh()).resolves.toMatchObject({ source: 'test-fixture' });
    await expect(initial.show('community.zod')).resolves.toMatchObject({
      signatureStatus: 'verified',
      publisherStatus: 'verified',
    });
    const installed = await initial.install('community.zod', true);
    expect(installed.integrity).toBe('valid');
    expect(installed.metadata.packageSha256).toMatch(/^[a-f0-9]{64}$/u);

    const stack: StackDefinition = {
      framework: 'express',
      components: ['vitest'],
      pluginComponents: ['zod'],
      packageManager: 'pnpm',
      initializeGit: false,
      addDocker: false,
      addGitHubActions: false,
    };
    const plan = await createGenerationPlan(stack, {
      projectName: 'native-marketplace-project',
      destinationDirectory: root,
      declarativePlugins: await store.loadPlanSources(),
    });
    expect(plan.plugins).toContainEqual(
      expect.objectContaining({ id: 'community.zod', source: 'community' }),
    );
    const generated = await executeGenerationPlan(plan);
    await expect(
      readFile(path.join(generated.projectDirectory, 'src', 'lib', 'validation.ts'), 'utf8'),
    ).resolves.toContain("from 'zod'");

    const updateFixture = createSignedTestMarketplace({
      versionOverrides: { 'community.zod': '0.2.0' },
    });
    const update = service(root, store, updateFixture);
    await update.refresh();
    await expect(update.updates()).resolves.toContainEqual(
      expect.objectContaining({ id: 'community.zod', updateAvailable: true }),
    );
    await expect(update.update('community.zod', true)).resolves.toMatchObject({
      manifest: { version: '0.2.0' },
      integrity: 'valid',
    });

    const revoked = service(
      root,
      store,
      createSignedTestMarketplace({
        versionOverrides: { 'community.zod': '0.2.0' },
        revoked: 'community.zod@0.2.0',
      }),
    );
    await revoked.refresh();
    expect((await store.inspect('community.zod'))?.disabledReason).toMatch(/Revoked/u);
    expect(await store.loadPlanSources()).toHaveLength(0);
    await store.remove('community.zod');
    await expect(store.inspect('community.zod')).resolves.toBeUndefined();
  });
});
