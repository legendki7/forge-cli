import chalk from 'chalk';
import type { Command } from 'commander';
import {
  BUILTIN_STACK_PRESETS,
  getStackComponent,
  getStackPreset,
  validateStack,
} from '@forgecli7/core';
import type { CommandContext } from '../context.js';

export function registerStacksCommand(program: Command, context: CommandContext): void {
  const stacks = program
    .command('stacks')
    .description('Inspect trusted built-in ForgeKi stack presets');
  stacks
    .command('list')
    .description('List built-in stack presets')
    .action(() => {
      context.write(
        [
          chalk.bold('Built-in ForgeKi stacks'),
          '',
          ...BUILTIN_STACK_PRESETS.map(
            ({ id, name, description }) => `${chalk.cyan(id)}\n  ${name} — ${description}`,
          ),
        ].join('\n'),
      );
    });
  stacks
    .command('show <preset>')
    .description('Show a built-in stack preset')
    .action((id: string) => {
      const preset = getStackPreset(id);
      if (!preset) {
        context.write(chalk.red(`Unknown built-in stack preset "${id}".`));
        context.setExitCode?.(1);
        return;
      }
      const validation = validateStack(preset.definition);
      context.write(
        [
          chalk.bold(preset.name),
          preset.description,
          '',
          `Framework: ${getStackComponent(preset.definition.framework).name}`,
          `Components: ${validation.resolvedComponents.map((component) => getStackComponent(component).name).join(', ')}`,
          `Package manager: ${preset.definition.packageManager}`,
          `Template: ${preset.definition.templateId ?? 'framework default'}`,
        ].join('\n'),
      );
    });
}
