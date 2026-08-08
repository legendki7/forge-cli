import path from 'node:path';
import type { Command } from 'commander';
import {
  BuiltInCatalogProvider,
  BundledCommunityCatalogProvider,
  LocalInstalledCatalogProvider,
  PluginStore,
  composePluginCatalog,
  createPluginStarter,
} from '@forgecli7/plugins';
import type { PluginSafetyReport } from '@forgecli7/plugin-sdk';
import type { CommandContext } from '../context.js';

export function registerPluginCommands(program: Command, context: CommandContext): void {
  const plugins = program.command('plugins').description('Manage restricted declarative plugins');
  plugins
    .command('list')
    .description('List built-in, bundled, and locally installed plugins')
    .action(async () =>
      run(context, async (store) => {
        const catalog = await composePluginCatalog([
          new BuiltInCatalogProvider(),
          new BundledCommunityCatalogProvider(store),
          new LocalInstalledCatalogProvider(store),
        ]);
        context.write(
          [
            'ForgeKi Plugin Platform',
            'Community catalog preview — remote marketplace downloads are not enabled yet.',
            '',
            ...catalog.map(
              (entry) =>
                `${entry.id}  ${entry.version}  ${entry.builtIn ? 'Built-in · Trusted' : entry.installed ? 'Community · Installed · Restricted' : 'Bundled community example · Not installed'}`,
            ),
          ].join('\n'),
        );
      }),
    );
  plugins
    .command('inspect <plugin-id>')
    .description('Inspect plugin metadata, permissions, and contributions')
    .action(async (id: string) =>
      run(context, async (store) => {
        const entry = (
          await composePluginCatalog([
            new BuiltInCatalogProvider(),
            new BundledCommunityCatalogProvider(store),
            new LocalInstalledCatalogProvider(store),
          ])
        ).find((candidate) => candidate.id === id);
        if (!entry) throw new Error(`Unknown plugin "${id}".`);
        const manifest = entry.manifest;
        context.write(
          [
            `${entry.name} (${entry.id})`,
            `${entry.publisher} · ${entry.version} · ${entry.category}`,
            entry.description,
            `Status: ${entry.builtIn ? 'Built-in · Trusted · Ships with ForgeKi' : `Community · Declarative · Restricted · ${entry.installed ? 'Installed' : 'Not installed'}`}`,
            `Frameworks: ${entry.supportedFrameworks.join(', ')}`,
            `Permissions: ${entry.permissions.join(', ') || 'None'}`,
            ...(manifest
              ? [
                  `Generated files: ${manifest.contributions.generatedFiles?.map(({ path }) => path).join(', ') || 'None'}`,
                  `Dependencies: ${dependencyNames(manifest.contributions.dependencies).join(', ') || 'None'}`,
                  `Scripts: ${Object.keys(manifest.contributions.scripts ?? {}).join(', ') || 'None'}`,
                  `Environment variables: ${manifest.contributions.environmentVariables?.map(({ name }) => name).join(', ') || 'None'}`,
                  `Scanner rules: ${manifest.contributions.scannerRules?.length ?? 0}`,
                  'Cannot: execute code, run shell commands, access the network, or access credentials.',
                ]
              : []),
            ...(entry.warning ? [`Warning: ${entry.warning}`] : []),
          ].join('\n'),
        );
      }),
    );
  plugins
    .command('validate <path>')
    .description('Validate a local plugin without installing it')
    .action(async (source: string) =>
      run(context, async (store) => {
        const inspected = await store.validate(path.resolve(context.cwd, source));
        context.write(formatSafetyReport(inspected.report));
        if (inspected.report.result === 'blocked') context.setExitCode?.(1);
      }),
    );
  plugins
    .command('install <path>')
    .description('Validate and copy a local declarative plugin into ForgeKi storage')
    .action(async (source: string) =>
      run(context, async (store) => {
        const directory = path.resolve(context.cwd, source);
        const inspected = await store.validate(directory);
        context.write(formatSafetyReport(inspected.report));
        if (inspected.report.result === 'blocked') {
          context.setExitCode?.(1);
          return;
        }
        const installed = await store.install(directory);
        context.write(
          `Installed ${installed.manifest.id} ${installed.manifest.version} as restricted declarative data. No plugin code was executed.`,
        );
      }),
    );
  plugins
    .command('remove <plugin-id>')
    .description('Remove a locally installed community plugin')
    .action(async (id: string) =>
      run(context, async (store) => {
        await store.remove(id);
        context.write(`Removed ${id}. Existing generated projects were not modified.`);
      }),
    );

  program
    .command('plugin')
    .description('Plugin developer workflow')
    .command('create <name>')
    .description('Create a restricted declarative plugin starter')
    .action(async (name: string) =>
      run(context, async () => {
        const destination = await createPluginStarter(context.cwd, name);
        context.write(
          `Created declarative plugin project at ${destination}. Validate it with forge plugins validate .`,
        );
      }),
    );
}

async function run(context: CommandContext, operation: (store: PluginStore) => Promise<void>) {
  try {
    await operation(new PluginStore(context.pluginStorageRoot));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Plugin operation failed.';
    context.write(`ForgeKi plugin operation failed: ${message}`);
    context.setExitCode?.(1);
  }
}

function formatSafetyReport(report: PluginSafetyReport): string {
  return [
    'ForgeKi Plugin Safety Report',
    `Result: ${report.result === 'safe' ? 'Safe to install' : report.result === 'warnings' ? 'Install with warnings' : 'Blocked'}`,
    `Manifest valid: ${report.manifestValid ? 'yes' : 'no'}`,
    `ForgeKi compatible: ${report.forgekiCompatible ? 'yes' : 'no'}`,
    `Permissions: ${report.permissions.join(', ') || 'None'}`,
    `Generated files: ${report.generatedFiles}`,
    `Dependency additions: ${report.dependencies}`,
    `Script additions: ${report.scripts}`,
    `Environment variables: ${report.environmentVariables}`,
    `Scanner rules: ${report.scannerRules}`,
    ...report.errors.map(({ message }) => `Blocked: ${message}`),
    ...report.warnings.map(({ message }) => `Warning: ${message}`),
    'No shell access · No network access · No credential access · No arbitrary code execution',
  ].join('\n');
}

function dependencyNames(
  value:
    readonly { name: string; version: string }[] | Readonly<Record<string, string>> | undefined,
) {
  return Array.isArray(value) ? value.map(({ name }) => name) : Object.keys(value ?? {});
}
