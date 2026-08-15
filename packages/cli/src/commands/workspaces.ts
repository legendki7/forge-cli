import { readFile } from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk';
import type { Command } from 'commander';
import {
  BUILTIN_WORKSPACE_PRESETS,
  MAX_WORKSPACE_BYTES,
  asciiWorkspaceArchitecture,
  createWorkspaceConnection,
  createWorkspaceService,
  createWorkspaceGenerationPlan,
  executeWorkspaceGenerationPlan,
  getWorkspacePreset,
  parseWorkspaceDefinition,
  scanWorkspace,
  serializeWorkspace,
  validateWorkspace,
  type ForgeWorkspace,
} from '@forgecli7/workspaces';
import type { CommandContext } from '../context.js';

interface WorkspaceCreateOptions {
  preset?: string;
  config?: string;
  destination?: string;
  git: boolean;
  docker?: boolean;
  githubActions?: boolean;
  frontend?: string;
  api?: string;
  database?: string;
  cache?: string;
  sharedTypes?: boolean;
  packageManager?: string;
}

export function registerWorkspaceCommands(program: Command, context: CommandContext): void {
  const workspaces = program
    .command('workspaces')
    .description('Inspect built-in workspace presets');
  workspaces
    .command('presets')
    .description('List built-in workspace presets')
    .action(() => {
      context.write(
        [
          chalk.bold('Built-in ForgeKi workspace presets'),
          '',
          ...BUILTIN_WORKSPACE_PRESETS.map(
            ({ id, name, description }) => `${chalk.cyan(id)}\n  ${name} - ${description}`,
          ),
        ].join('\n'),
      );
    });
  workspaces
    .command('show <preset>')
    .description('Show a workspace preset')
    .action((id: string) => {
      const preset = getWorkspacePreset(id);
      if (!preset) return fail(context, `Unknown workspace preset "${id}".`);
      context.write(
        `${chalk.bold(preset.name)}\n${preset.description}\n\n${asciiWorkspaceArchitecture(preset.definition)}\n\n${serializeWorkspace(preset.definition)}`,
      );
    });

  const workspace = program
    .command('workspace')
    .description('Create, inspect, and validate multi-service workspaces');
  workspace
    .command('create [name]')
    .description('Create a deterministic multi-service workspace')
    .option('--preset <id>', 'Built-in preset', 'full-stack-starter')
    .option('--config <path>', 'Workspace JSON configuration')
    .option('--destination <path>', 'Parent output directory')
    .option('--frontend <type>', 'nextjs, react-vite, or none')
    .option('--api <type>', 'express or none')
    .option('--database <type>', 'postgres, sqlite, or none')
    .option('--cache <type>', 'redis or none')
    .option('--shared-types', 'add a shared TypeScript package')
    .option('--package-manager <manager>', 'pnpm, npm, yarn, or bun')
    .option('--no-git', 'Do not initialize Git')
    .option('--docker', 'Generate Docker assets')
    .option('--no-docker', 'Do not generate Docker assets')
    .option('--github-actions', 'Generate GitHub Actions')
    .option('--no-github-actions', 'Do not generate GitHub Actions')
    .addHelpText(
      'after',
      '\nExamples:\n  forge workspace create my-workspace\n  forge workspace create --config forgeki.workspace.json --no-git',
    )
    .action(async (name: string | undefined, options: WorkspaceCreateOptions) => {
      try {
        if (options.config && !options.destination)
          throw new Error('--destination is required when using --config.');
        const definition = options.config
          ? await readWorkspaceConfig(path.resolve(context.cwd, options.config))
          : hasExplicitArchitecture(options)
            ? definitionFromOptions(name, options)
            : definitionFromPreset(options.preset ?? 'full-stack-starter', name);
        const workspaceDefinition: ForgeWorkspace = {
          ...definition,
          ...(name ? { id: name, name } : {}),
          packageManager: parsePackageManager(options.packageManager ?? definition.packageManager),
          tooling: {
            initializeGit: options.git,
            docker: options.docker ?? definition.tooling.docker,
            githubActions: options.githubActions ?? definition.tooling.githubActions,
          },
        };
        const destination = path.resolve(context.cwd, options.destination ?? '.');
        const plan = await createWorkspaceGenerationPlan(workspaceDefinition, {
          destinationDirectory: destination,
        });
        const result = await executeWorkspaceGenerationPlan(plan);
        context.write(
          `${chalk.green('Workspace created successfully.')}\n${result.workspaceDirectory}\n${result.serviceCount} services, ${result.createdFiles.length} files\n\n${asciiWorkspaceArchitecture(plan.workspace)}`,
        );
      } catch (error) {
        fail(context, errorMessage(error));
      }
    });

  workspace
    .command('check [directory]')
    .description('Scan a workspace without changing it')
    .action(async (directory = '.') => {
      try {
        const result = await scanWorkspace(path.resolve(context.cwd, directory));
        context.write(
          `${chalk.bold(`Workspace: ${result.name}`)}\nSource: ${result.source}\nServices: ${result.definition.services.length}\nConnections: ${result.definition.connections.length}\n${result.evidence.map(({ state, detail }) => `[${state}] ${detail}`).join('\n')}${result.warnings.length ? `\nWarnings:\n${result.warnings.join('\n')}` : ''}`,
        );
      } catch (error) {
        fail(context, errorMessage(error));
      }
    });

  workspace
    .command('validate <config>')
    .description('Validate a workspace JSON configuration')
    .action(async (config: string) => {
      try {
        const result = validateWorkspace(
          await readWorkspaceConfig(path.resolve(context.cwd, config)),
        );
        if (!result.valid)
          return fail(
            context,
            result.errors
              .map(({ path: issuePath, message }) => `${issuePath}: ${message}`)
              .join('\n'),
          );
        context.write(
          chalk.green(`Workspace configuration is valid (${result.ports.length} planned ports).`),
        );
      } catch (error) {
        fail(context, errorMessage(error));
      }
    });
}

async function readWorkspaceConfig(file: string): Promise<ForgeWorkspace> {
  const text = await readFile(file, 'utf8');
  if (Buffer.byteLength(text) > MAX_WORKSPACE_BYTES)
    throw new Error(`Workspace configuration exceeds ${MAX_WORKSPACE_BYTES} bytes.`);
  return parseWorkspaceDefinition(JSON.parse(text) as unknown);
}

function definitionFromPreset(id: string, name?: string): ForgeWorkspace {
  const preset = getWorkspacePreset(id);
  if (!preset) throw new Error(`Unknown workspace preset "${id}".`);
  return parseWorkspaceDefinition({ ...preset.definition, ...(name ? { id: name, name } : {}) });
}

function hasExplicitArchitecture(options: WorkspaceCreateOptions): boolean {
  return Boolean(
    options.frontend || options.api || options.database || options.cache || options.sharedTypes,
  );
}

function definitionFromOptions(
  name: string | undefined,
  options: WorkspaceCreateOptions,
): ForgeWorkspace {
  if (!name) throw new Error('A workspace name is required with explicit service options.');
  const frontend = readChoice(
    options.frontend ?? 'react-vite',
    ['nextjs', 'react-vite', 'none'],
    'frontend',
  );
  const api = readChoice(options.api ?? 'express', ['express', 'none'], 'API');
  const database = readChoice(
    options.database ?? 'none',
    ['postgres', 'sqlite', 'none'],
    'database',
  );
  const cache = readChoice(options.cache ?? 'none', ['redis', 'none'], 'cache');
  const services = [
    frontend !== 'none'
      ? createWorkspaceService(frontend, 'web', { components: ['plain-css', 'vitest'] })
      : undefined,
    api !== 'none'
      ? createWorkspaceService('express', 'api', { components: ['vitest'] })
      : undefined,
    database !== 'none' ? createWorkspaceService(database, database) : undefined,
    cache !== 'none' ? createWorkspaceService('redis', 'cache') : undefined,
    options.sharedTypes ? createWorkspaceService('shared-types', 'shared') : undefined,
  ].filter((service) => service !== undefined);
  const byType = (type: ForgeWorkspace['services'][number]['type']) =>
    services.find((service) => service.type === type);
  const web = byType('web');
  const apiService = byType('api');
  const db = byType('database');
  const cacheService = byType('infrastructure');
  const shared = byType('shared-package');
  const connections = [
    web && apiService ? createWorkspaceConnection(web.id, apiService.id, 'HTTP') : undefined,
    (apiService ?? (frontend === 'nextjs' ? web : undefined)) && db
      ? createWorkspaceConnection((apiService ?? web)!.id, db.id, 'DATABASE')
      : undefined,
    (apiService ?? (frontend === 'nextjs' ? web : undefined)) && cacheService
      ? createWorkspaceConnection((apiService ?? web)!.id, cacheService.id, 'CACHE')
      : undefined,
    web && shared ? createWorkspaceConnection(web.id, shared.id, 'SHARED_PACKAGE') : undefined,
    apiService && shared
      ? createWorkspaceConnection(apiService.id, shared.id, 'SHARED_PACKAGE')
      : undefined,
  ].filter((connection) => connection !== undefined);
  return {
    schemaVersion: 1,
    id: name,
    name,
    packageManager: parsePackageManager(options.packageManager ?? 'pnpm'),
    services,
    connections,
    tooling: {
      initializeGit: options.git,
      docker: options.docker ?? false,
      githubActions: options.githubActions ?? false,
    },
  };
}

function parsePackageManager(value: string): ForgeWorkspace['packageManager'] {
  if (value === 'pnpm' || value === 'npm' || value === 'yarn' || value === 'bun') return value;
  throw new Error(`Unsupported package manager "${value}".`);
}

function readChoice<const T extends string>(
  value: string,
  choices: readonly T[],
  label: string,
): T {
  if (choices.includes(value as T)) return value as T;
  throw new Error(`Unsupported ${label} "${value}".`);
}

function fail(context: CommandContext, message: string): void {
  context.write(chalk.red(message));
  context.setExitCode?.(1);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Workspace operation failed.';
}
