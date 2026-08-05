import chalk from 'chalk';
import type { Command } from 'commander';
import {
  detectProject,
  type Framework,
  type PackageManager,
  type ProjectLanguage,
} from '@forgecli/core';
import type { CommandContext } from '../context.js';

const frameworkLabels: Record<Framework, string> = {
  nextjs: 'Next.js',
  'react-vite': 'React with Vite',
  express: 'Express',
  node: 'Node.js',
  unknown: 'Unknown',
};

const languageLabels: Record<ProjectLanguage, string> = {
  typescript: 'TypeScript',
  javascript: 'JavaScript',
  unknown: 'Unknown',
};

const packageManagerLabels: Record<PackageManager, string> = {
  pnpm: 'pnpm',
  npm: 'npm',
  yarn: 'yarn',
  bun: 'bun',
  unknown: 'Unknown',
};

export function registerCheckCommand(program: Command, context: CommandContext): void {
  program
    .command('check')
    .description('Inspect the current project and report its configuration')
    .addHelpText('after', '\nExample:\n  forge check')
    .action(async () => {
      const result = await detectProject(context.cwd);
      const project =
        result.projectName ?? (result.framework === 'unknown' ? 'Not detected' : 'Unnamed');
      const lines = [
        chalk.bold('ForgeCLI project report'),
        '',
        `Project: ${project}`,
        `Framework: ${frameworkLabels[result.framework]}`,
        `Language: ${languageLabels[result.language]}`,
        `Package manager: ${packageManagerLabels[result.packageManager]}`,
      ];

      if (result.detectedFiles.length > 0) {
        lines.push(
          '',
          'Detected:',
          ...result.detectedFiles.map((file) => chalk.green(`✓ ${file}`)),
        );
      }

      if (result.warnings.length > 0) {
        lines.push(
          '',
          'Warnings:',
          ...result.warnings.map((warning) => chalk.yellow(`! ${warning}`)),
        );
      }

      if (result.framework === 'unknown') {
        lines.push(
          '',
          chalk.yellow('No supported Node.js project was detected in this directory.'),
        );
      }

      context.write(lines.join('\n'));
    });
}
