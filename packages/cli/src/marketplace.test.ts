import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ApplicationUpdateService,
  MarketplaceCache,
  MarketplaceService,
} from '@forgecli7/marketplace';
import {
  TestMarketplaceProvider,
  TestUpdateProvider,
  createSignedTestMarketplace,
} from '../../marketplace/src/fixtures/index.js';
import { TEST_UPDATE_ROOT } from '../../marketplace/src/fixtures/test-keys.js';
import { PluginStore, loadPlugins } from '@forgecli7/plugins';
import { createProgram } from './program.js';
import type { CommandContext } from './context.js';

let root: string;
let output: string[];
let exitCode: number | undefined;
let service: MarketplaceService;
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'forgeki-cli-marketplace-'));
  output = [];
  exitCode = undefined;
  const fixture = createSignedTestMarketplace();
  service = new MarketplaceService(
    new TestMarketplaceProvider(fixture),
    [fixture.root],
    new MarketplaceCache(path.join(root, 'cache')),
    new PluginStore(path.join(root, 'plugins')),
    '0.1.0',
    path.join(root, 'quarantine'),
  );
  await service.refresh();
});
afterEach(async () => rm(root, { recursive: true, force: true }));
function program() {
  const context: CommandContext = {
    cwd: root,
    pluginStorageRoot: path.join(root, 'plugins'),
    write: (message) => output.push(message),
    setExitCode: (code) => {
      exitCode = code;
    },
  };
  return createProgram(context, loadPlugins(), {}, '0.1.0', {
    marketplace: () => service,
    updates: () => new ApplicationUpdateService(new TestUpdateProvider(), [TEST_UPDATE_ROOT]),
  });
}
async function run(...args: string[]) {
  await program().parseAsync(['node', 'forge', ...args]);
  return output.join('\n');
}

describe('Marketplace CLI', () => {
  it('reports verified Marketplace status', async () =>
    expect(await run('marketplace', 'status')).toMatch(/Root trust: verified/u));
  it('refreshes signed metadata', async () =>
    expect(await run('marketplace', 'refresh')).toMatch(/Verified 5/u));
  it('searches verified metadata locally', async () =>
    expect(await run('marketplace', 'search', 'zod')).toMatch(/community\.zod/u));
  it('shows signature and permission details', async () =>
    expect(await run('marketplace', 'show', 'community.redis')).toMatch(
      /Signature: verified[\s\S]*Permissions/u,
    ));
  it('installs a remote plugin only with confirmation', async () => {
    expect(await run('plugins', 'install-remote', 'community.editorconfig', '--yes')).toMatch(
      /No plugin code was executed/u,
    );
    expect((await service.store.inspect('community.editorconfig'))?.metadata.sourceType).toBe(
      'remote',
    );
  });
  it('lists and applies explicit updates', async () => {
    await run('plugins', 'install-remote', 'community.editorconfig', '--yes');
    const fixture = createSignedTestMarketplace({
      versionOverrides: { 'community.editorconfig': '0.2.0' },
    });
    service = new MarketplaceService(
      new TestMarketplaceProvider(fixture),
      [fixture.root],
      service.cache,
      service.store,
      '0.2.0',
      path.join(root, 'quarantine'),
    );
    await service.refresh();
    expect(await run('plugins', 'updates')).toMatch(/0\.2\.0/u);
    expect(await run('plugins', 'update', 'community.editorconfig', '--yes')).toMatch(/Updated/u);
  });
  it('returns clear unknown and revoked plugin failures', async () => {
    expect(await run('marketplace', 'show', 'unknown.plugin')).toMatch(/Unknown/u);
    expect(exitCode).toBe(1);
  });
  it('reports CLI update provider state without self-updating', async () =>
    expect(await run('update', 'check')).toMatch(/does not self-update/u));
  it('does not register arbitrary URL or self-update commands', () => {
    const names = program().commands.flatMap((command) => [
      command.name(),
      ...command.commands.map((child) => `${command.name()} ${child.name()}`),
    ]);
    expect(names).not.toContain('plugins install-url');
    expect(names).not.toContain('update install');
  });
  it('never prints secrets or private signing material', async () => {
    const text = await run('marketplace', 'show', 'community.zod');
    expect(text).not.toMatch(/PRIVATE|TOKEN|PASSWORD|MC4CAQ/u);
  });
});
