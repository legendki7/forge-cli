import path from 'node:path';
import chalk from 'chalk';
import type { Command } from 'commander';
import {
  getStackPreset,
  isStackFramework,
  packageManagerCommand,
  validateStack,
  validateProjectName,
  type StackComponentId,
  type StackDefinition,
  type SupportedPackageManager,
} from '@forgecli7/core';
import type { PluginRegistry } from '@forgecli7/plugins';
import { createProject, CreateProjectError, type ProcessExecutor } from '@forgecli7/templates';
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
  preset?: string;
  styling?: string;
  database?: string;
  orm?: string;
  testing?: string;
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
    .description('Scaffold a supported TypeScript project')
    .option('-i, --interactive', 'prompt for project configuration')
    .option('--framework <framework>', 'project framework', 'nextjs')
    .option('--package-manager <manager>', 'pnpm, npm, yarn, or bun', 'pnpm')
    .option('--no-git', 'skip Git repository initialization')
    .option('--docker', 'add Docker configuration')
    .option('--no-docker', 'skip Docker configuration')
    .option('--github-actions', 'add a GitHub Actions CI workflow')
    .option('--no-github-actions', 'skip GitHub Actions CI')
    .option('--preset <preset>', 'trusted built-in stack preset')
    .option('--styling <styling>', 'plain-css or tailwind')
    .option('--database <database>', 'postgres, sqlite, or none')
    .option('--orm <orm>', 'prisma, drizzle, or none')
    .option('--testing <tools>', 'comma-separated vitest and playwright')
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
        '  forge create web --preset nextjs-fullstack',
        '  forge create api --framework express --database postgres --orm drizzle --testing vitest',
      ].join('\n'),
    )
    .action(
      async (projectName: string | undefined, options: CreateCommandOptions, command: Command) => {
        try {
          if (!isStackFramework(options.framework))
            throw new Error('Use --framework nextjs, react-vite, or express.');
          if (projectName) assertValidProjectName(projectName);

          const interactive = !projectName || options.interactive === true;
          const configuration = interactive
            ? await resolveInteractively(projectName, options, command, context, dependencies)
            : resolveNonInteractively(projectName, options);
          if (!configuration) return;

          const stack = resolveStackDefinition(options, configuration.packageManager);

          const result = await createProject({
            projectName: configuration.projectName,
            destinationDirectory: context.cwd,
            framework: stack?.framework ?? 'nextjs',
            packageManager: configuration.packageManager,
            initializeGit: configuration.initializeGit,
            addDocker: configuration.addDocker,
            addGitHubActions: configuration.addGitHubActions,
            ...(stack
              ? {
                  stack,
                  ...(stack.templateId?.startsWith('nextjs-')
                    ? {
                        templateId: stack.templateId as Parameters<
                          typeof createProject
                        >[0]['templateId'],
                      }
                    : {}),
                }
              : {}),
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
          context.write(chalk.red(`ForgeKi could not create the project: ${message}`));
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

function resolveStackDefinition(
  options: CreateCommandOptions,
  packageManager: SupportedPackageManager,
): StackDefinition | undefined {
  const stackRequested = Boolean(
    options.preset ||
    options.framework !== 'nextjs' ||
    options.styling ||
    options.database ||
    options.orm ||
    options.testing,
  );
  if (!stackRequested) return undefined;
  const source = options.preset ? getStackPreset(options.preset) : undefined;
  if (options.preset && !source)
    throw new Error(`Unknown built-in stack preset "${options.preset}".`);
  const framework = source?.definition.framework ?? options.framework;
  if (!isStackFramework(framework)) throw new Error(`Unsupported framework "${framework}".`);
  const components = new Set<StackComponentId>(source?.definition.components ?? []);
  if (!source) components.add('typescript');
  replaceCategory(components, ['plain-css', 'tailwind'], options.styling, 'styling');
  replaceCategory(components, ['postgres', 'sqlite'], options.database, 'database');
  replaceCategory(components, ['prisma', 'drizzle'], options.orm, 'ORM');
  if (options.testing) {
    components.delete('vitest');
    components.delete('playwright');
    for (const id of options.testing.split(',').map((value) => value.trim())) {
      if (id !== 'vitest' && id !== 'playwright')
        throw new Error(`Unsupported testing component "${id}".`);
      components.add(id);
    }
  }
  setBooleanComponent(components, 'git', options.git);
  setBooleanComponent(
    components,
    'docker',
    options.docker ?? source?.definition.addDocker ?? false,
  );
  setBooleanComponent(
    components,
    'github-actions',
    options.githubActions ?? source?.definition.addGitHubActions ?? false,
  );
  const definition: StackDefinition = {
    framework,
    components: [...components],
    packageManager,
    initializeGit: options.git,
    addDocker: components.has('docker'),
    addGitHubActions: components.has('github-actions'),
    ...(source?.definition.templateId ? { templateId: source.definition.templateId } : {}),
  };
  const validation = validateStack(definition);
  if (!validation.valid)
    throw new Error(
      validation.errors.map(({ message, resolution }) => `${message} ${resolution}`).join(' '),
    );
  return definition;
}

function replaceCategory(
  components: Set<StackComponentId>,
  values: readonly StackComponentId[],
  selected: string | undefined,
  label: string,
) {
  if (!selected) return;
  values.forEach((value) => components.delete(value));
  if (selected === 'none') return;
  if (!values.includes(selected as StackComponentId))
    throw new Error(`Unsupported ${label} component "${selected}".`);
  components.add(selected as StackComponentId);
}

function setBooleanComponent(
  components: Set<StackComponentId>,
  id: StackComponentId,
  enabled: boolean,
) {
  if (enabled) components.add(id);
  else components.delete(id);
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
    chalk.green(`✓ Generated ${result.framework} project`),
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
      chalk.bold('ForgeKi'),
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
