import path from 'node:path';
import chalk from 'chalk';
import type { Command } from 'commander';
import {
  packageManagerCommand,
  validateProjectName,
  type SupportedPackageManager,
} from '@forgecli/core';
import type { PluginRegistry } from '@forgecli/plugins';
import { createProject, CreateProjectError, type ProcessExecutor } from '@forgecli/templates';
import type { CommandContext } from '../context.js';
import { runCreateWizard, type ResolvedCreateConfiguration } from '../create-wizard.js';
import {
  createInquirerPromptAdapter,
  isPromptInterruption,
  type CreatePromptAdapter,
} from '../prompts.js';

interface CreateCommandOptions {
  framework: string;
  packageManager: string;
  git: boolean;
  docker?: boolean;
  githubActions?: boolean;
  interactive?: boolean;
}

export interface CreateCommandDependencies {
  promptAdapter?: CreatePromptAdapter;
  processExecutor?: ProcessExecutor;
  isInteractiveTerminal?: () => boolean;
}

export function registerCreateCommand(
  program: Command,
  context: CommandContext,
  plugins: PluginRegistry,
  dependencies: CreateCommandDependencies = {},
): void {
  program
    .command('create [project-name]')
    .description('Scaffold a Next.js TypeScript project')
    .option('-i, --interactive', 'prompt for project configuration')
    .option('--framework <framework>', 'project framework', 'nextjs')
    .option('--package-manager <manager>', 'pnpm, npm, yarn, or bun', 'pnpm')
    .option('--no-git', 'skip Git repository initialization')
    .option('--docker', 'add Docker configuration')
    .option('--no-docker', 'skip Docker configuration')
    .option('--github-actions', 'add a GitHub Actions CI workflow')
    .option('--no-github-actions', 'skip GitHub Actions CI')
    .addHelpText(
      'after',
      [
        '',
        'Defaults: Next.js, pnpm, Git enabled, Docker and GitHub Actions disabled.',
        'Omit the project name or use --interactive to start the setup wizard.',
        '',
        'Examples:',
        '  forge create',
        '  forge create my-app --no-git',
        '  forge create my-app --package-manager npm --docker',
      ].join('\n'),
    )
    .action(
      async (projectName: string | undefined, options: CreateCommandOptions, command: Command) => {
        try {
          if (options.framework !== 'nextjs')
            throw new Error('Only --framework nextjs is supported.');
          if (projectName) assertValidProjectName(projectName);

          const interactive = !projectName || options.interactive === true;
          const configuration = interactive
            ? await resolveInteractively(projectName, options, command, context, dependencies)
            : resolveNonInteractively(projectName, options);
          if (!configuration) return;

          const result = await createProject({
            projectName: configuration.projectName,
            destinationDirectory: context.cwd,
            framework: 'nextjs',
            packageManager: configuration.packageManager,
            initializeGit: configuration.initializeGit,
            addDocker: configuration.addDocker,
            addGitHubActions: configuration.addGitHubActions,
            plugins: plugins.list(),
            processExecutor: dependencies.processExecutor,
          });
          writeSuccess(context, configuration, result);
        } catch (error) {
          if (isPromptInterruption(error)) {
            context.write(chalk.yellow('Project creation interrupted.'));
            context.setExitCode?.(130);
            return;
          }
          const message =
            error instanceof CreateProjectError || error instanceof Error
              ? error.message
              : 'Project creation failed.';
          context.write(chalk.red(`ForgeCLI could not create the project: ${message}`));
          context.setExitCode?.(1);
        }
      },
    );
}

async function resolveInteractively(
  projectName: string | undefined,
  options: CreateCommandOptions,
  command: Command,
  context: CommandContext,
  dependencies: CreateCommandDependencies,
): Promise<ResolvedCreateConfiguration | undefined> {
  const terminalAvailable =
    dependencies.isInteractiveTerminal?.() ?? Boolean(process.stdin.isTTY && process.stdout.isTTY);
  if (!dependencies.promptAdapter && !terminalAvailable) {
    throw new Error(
      projectName
        ? 'Interactive input is unavailable. Run the command without --interactive.'
        : 'Interactive input is unavailable. Provide a project name: forge create my-app',
    );
  }

  const explicit = (name: string) => command.getOptionValueSource(name) === 'cli';
  const result = await runCreateWizard(
    {
      projectName,
      packageManager: explicit('packageManager')
        ? parsePackageManager(options.packageManager)
        : undefined,
      initializeGit: explicit('git') ? options.git : undefined,
      addDocker: explicit('docker') ? options.docker : undefined,
      addGitHubActions: explicit('githubActions') ? options.githubActions : undefined,
    },
    dependencies.promptAdapter ?? createInquirerPromptAdapter(),
    (summary) => context.write(summary),
  );
  if (!result.confirmed) {
    context.write('Project creation cancelled.');
    return undefined;
  }
  return result.configuration;
}

function resolveNonInteractively(
  projectName: string,
  options: CreateCommandOptions,
): ResolvedCreateConfiguration {
  return {
    projectName,
    framework: 'nextjs',
    packageManager: parsePackageManager(options.packageManager),
    initializeGit: options.git,
    addDocker: options.docker ?? false,
    addGitHubActions: options.githubActions ?? false,
  };
}

function assertValidProjectName(projectName: string): void {
  const validation = validateProjectName(projectName);
  if (!validation.valid) throw new Error(validation.message ?? 'Invalid project name.');
}

function writeSuccess(
  context: CommandContext,
  configuration: ResolvedCreateConfiguration,
  result: Awaited<ReturnType<typeof createProject>>,
): void {
  const { packageManager } = configuration;
  const steps = [
    chalk.green('✓ Validated project name'),
    chalk.green('✓ Generated Next.js project'),
    chalk.green(`✓ Configured ${packageManager}`),
  ];
  if (configuration.initializeGit) {
    steps.push(
      result.gitInitialized
        ? chalk.green('✓ Initialized Git')
        : chalk.yellow('! Git initialization was skipped'),
    );
  }
  if (configuration.addDocker)
    steps.push(pluginLine(result.appliedPlugins, 'docker', 'Docker configuration'));
  if (configuration.addGitHubActions)
    steps.push(pluginLine(result.appliedPlugins, 'github-actions', 'GitHub Actions workflow'));
  steps.push(...result.warnings.map((warning) => chalk.yellow(`! ${warning}`)));

  context.write(
    [
      chalk.bold('ForgeCLI'),
      '',
      `Creating ${configuration.projectName}...`,
      ...steps,
      '',
      chalk.green.bold('Project created successfully.'),
      '',
      'Next steps:',
      `  cd ${path.basename(result.projectDirectory)}`,
      `  ${packageManager === 'npm' ? 'npm install' : `${packageManager} install`}`,
      `  ${packageManagerCommand(packageManager, 'dev')}`,
    ].join('\n'),
  );
}

function parsePackageManager(value: string): SupportedPackageManager {
  if (value === 'pnpm' || value === 'npm' || value === 'yarn' || value === 'bun') return value;
  throw new Error(`Unsupported package manager "${value}". Use pnpm, npm, yarn, or bun.`);
}

function pluginLine(applied: readonly string[], id: string, label: string): string {
  return applied.includes(id)
    ? chalk.green(`✓ Added ${label}`)
    : chalk.yellow(`! ${label} was not added`);
}
