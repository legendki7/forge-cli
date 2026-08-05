import chalk from 'chalk';
import type { Command } from 'commander';
import type { PluginRegistry } from '@forgecli/plugins';
import type { CommandContext } from '../context.js';

export function registerAddCommand(
  program: Command,
  context: CommandContext,
  plugins: PluginRegistry,
): void {
  program
    .command('add [feature]')
    .description('Add a feature or integration to the current project')
    .addHelpText(
      'after',
      '\nExamples:\n  forge add\n  forge add docker\n  forge add github-actions',
    )
    .action(async (feature?: string) => {
      if (!feature) {
        const available = plugins.list().map((plugin) => plugin.id);
        context.write(
          chalk.yellow(`Specify a feature to add. Available plugins: ${available.join(', ')}`),
        );
        context.setExitCode?.(1);
        return;
      }

      const plugin = plugins.get(feature);
      if (!plugin) {
        context.write(chalk.red(`Unknown feature "${feature}". Run forge add to list plugins.`));
        context.setExitCode?.(1);
        return;
      }

      const pluginContext = { cwd: context.cwd };
      const detection = await plugin.detect(pluginContext);

      if (detection.detected) {
        context.write(chalk.green(detection.message));
        return;
      }

      if (detection.state === 'partial') context.write(chalk.yellow(detection.message));

      const result = await plugin.apply(pluginContext);
      const format =
        result.status === 'applied'
          ? chalk.green
          : result.status === 'unsupported'
            ? chalk.red
            : chalk.yellow;
      context.write(format(result.message));
      if (result.status === 'unsupported') context.setExitCode?.(1);
    });
}
