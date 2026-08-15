import { Command } from 'commander';
import { loadPlugins, type PluginRegistry } from '@forgecli7/plugins';
import { registerAddCommand } from './commands/add.js';
import { registerCheckCommand } from './commands/check.js';
import { registerCreateCommand, type CreateCommandDependencies } from './commands/create.js';
import { registerStacksCommand } from './commands/stacks.js';
import { registerPluginCommands } from './commands/plugins.js';
import { registerWorkspaceCommands } from './commands/workspaces.js';
import { registerDeploymentCommands } from './commands/deployment.js';
import { createDefaultContext, type CommandContext } from './context.js';
import { readCliPackageMetadata } from './package-metadata.js';

export function createProgram(
  context: CommandContext = createDefaultContext(),
  plugins: PluginRegistry = loadPlugins(),
  createDependencies: CreateCommandDependencies = {},
  version: string = readCliPackageMetadata().version,
): Command {
  const program = new Command();

  program
    .name('forge')
    .description('Scaffold and configure development projects')
    .version(version)
    .showHelpAfterError();

  program.addHelpText(
    'after',
    '\nExamples:\n  forge create\n  forge create my-app --no-git\n  forge add docker\n  forge check',
  );

  registerCreateCommand(program, context, plugins, createDependencies);
  registerAddCommand(program, context, plugins);
  registerCheckCommand(program, context);
  registerStacksCommand(program, context);
  registerPluginCommands(program, context);
  registerWorkspaceCommands(program, context);
  registerDeploymentCommands(program, context);

  return program;
}
