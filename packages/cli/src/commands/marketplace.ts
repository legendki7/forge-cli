import type { Command } from 'commander';
import {
  ApplicationUpdateService,
  MarketplaceCache,
  MarketplaceService,
  UnconfiguredMarketplaceProvider,
  UnconfiguredUpdateProvider,
  defaultMarketplaceCacheRoot,
  type UpdateChannel,
} from '@forgecli7/marketplace';
import { PluginStore, defaultPluginStorageRoot } from '@forgecli7/plugins';
import type { CommandContext } from '../context.js';

export interface MarketplaceCommandDependencies {
  marketplace(context: CommandContext): MarketplaceService;
  updates(): ApplicationUpdateService;
}

export function defaultMarketplaceDependencies(): MarketplaceCommandDependencies {
  return {
    marketplace(context) {
      const pluginRoot = context.pluginStorageRoot ?? defaultPluginStorageRoot();
      return new MarketplaceService(
        new UnconfiguredMarketplaceProvider(),
        [],
        new MarketplaceCache(defaultMarketplaceCacheRoot()),
        new PluginStore(pluginRoot),
      );
    },
    updates: () => new ApplicationUpdateService(new UnconfiguredUpdateProvider(), []),
  };
}

export function registerMarketplaceCommands(
  program: Command,
  context: CommandContext,
  dependencies: MarketplaceCommandDependencies,
): void {
  const marketplace = program
    .command('marketplace')
    .description('Inspect the trusted remote Marketplace');
  marketplace
    .command('status')
    .description('Show provider, cache, root-trust, and revocation status')
    .action(() =>
      run(context, async () => {
        const status = await dependencies.marketplace(context).status();
        context.write(
          [
            'ForgeKi Marketplace',
            `Provider: ${status.configured ? 'Configured' : 'Not configured'}`,
            `Connectivity: ${status.connectivity}`,
            `Catalog: ${status.freshness}`,
            `Root trust: ${status.rootTrust}`,
            `Revocations: ${status.revocations}`,
            status.message,
          ].join('\n'),
        );
      }),
    );
  marketplace
    .command('refresh')
    .description('Refresh and verify signed Marketplace metadata')
    .action(() =>
      run(context, async () => {
        const snapshot = await dependencies.marketplace(context).refresh();
        context.write(
          `Verified ${snapshot.index.plugins.length} Marketplace plugins. Revocation metadata: verified.`,
        );
      }),
    );
  marketplace
    .command('search <query>')
    .description('Search the locally verified Marketplace index')
    .option('--category <category>')
    .option('--framework <framework>')
    .option('--publisher <publisher>')
    .option('--installed')
    .option('--compatible')
    .option('--verified-publisher')
    .action((query: string, options: Record<string, unknown>) =>
      run(context, async () => {
        const entries = await dependencies.marketplace(context).search({
          text: query,
          ...(typeof options.category === 'string' ? { category: options.category } : {}),
          ...(typeof options.framework === 'string' ? { framework: options.framework } : {}),
          ...(typeof options.publisher === 'string' ? { publisher: options.publisher } : {}),
          ...(options.installed ? { installed: true } : {}),
          ...(options.compatible ? { compatible: true } : {}),
          ...(options.verifiedPublisher ? { verifiedPublisher: true } : {}),
        });
        context.write(
          entries.length
            ? entries
                .map(
                  (entry) =>
                    `${entry.id}  ${entry.version}  ${entry.publisherName} · ${entry.publisherStatus} · Signature verified${entry.installed ? ' · Installed' : ''}${entry.updateAvailable ? ' · Update available' : ''}`,
                )
                .join('\n')
            : 'No verified Marketplace plugins matched.',
        );
      }),
    );
  marketplace
    .command('show <plugin-id>')
    .description('Show verified Marketplace plugin metadata')
    .action((id: string) =>
      run(context, async () => {
        const entry = await dependencies.marketplace(context).show(id);
        context.write(
          [
            `${entry.name} (${entry.id})`,
            `Publisher: ${entry.publisherName} · ${entry.publisherStatus}`,
            `Version: ${entry.version}`,
            'Signature: verified',
            `Package SHA-256: ${entry.packageSha256}`,
            `Compatibility: ${entry.compatible ? 'compatible' : 'incompatible'}`,
            `Permissions: ${entry.permissions.join(', ') || 'None'}`,
            `Files: ${entry.packageFiles.join(', ')}`,
            'Community plugins remain declarative and cannot execute arbitrary code.',
          ].join('\n'),
        );
      }),
    );

  program
    .command('update')
    .description('Inspect trusted ForgeKi release metadata')
    .command('check')
    .description('Check for a ForgeKi CLI update without self-updating')
    .option('--channel <channel>', 'stable or beta', 'beta')
    .action((options: { channel: string }) =>
      run(context, async () => {
        if (!['stable', 'beta'].includes(options.channel))
          throw new Error('Update channel must be stable or beta.');
        const result = await dependencies
          .updates()
          .check('0.1.0', options.channel as UpdateChannel);
        context.write(
          [
            `ForgeKi CLI update check`,
            `Channel: ${result.channel}`,
            `Current: ${result.currentVersion}`,
            `State: ${result.state}`,
            `Signature: ${result.signatureStatus}`,
            result.message,
            'ForgeKi CLI does not self-update.',
          ].join('\n'),
        );
      }),
    );
}

async function run(context: CommandContext, operation: () => Promise<void>) {
  try {
    await operation();
  } catch (error) {
    context.write(
      `ForgeKi Marketplace operation failed: ${error instanceof Error ? error.message : 'Operation failed.'}`,
    );
    context.setExitCode?.(1);
  }
}
