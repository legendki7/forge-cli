import { spawn } from 'node:child_process';
import {
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  realpath,
  rename,
  rm,
  rmdir,
  unlink,
} from 'node:fs/promises';
import path from 'node:path';
import {
  createFileSafely,
  validateProjectName,
  type ForgePlugin,
  type SupportedPackageManager,
} from '@forgecli7/core';
import { renderNextjsTemplate } from './nextjs/template.js';

export interface ProcessResult {
  exitCode: number;
  error?: string;
}

export interface ProcessExecutor {
  run(command: string, args: readonly string[], cwd: string): Promise<ProcessResult>;
}

export interface CreateProjectOptions {
  projectName: string;
  destinationDirectory: string;
  framework: 'nextjs';
  packageManager: SupportedPackageManager;
  initializeGit: boolean;
  addDocker: boolean;
  addGitHubActions: boolean;
  plugins?: readonly ForgePlugin[];
  processExecutor?: ProcessExecutor;
}

export interface CreateProjectResult {
  projectDirectory: string;
  createdFiles: string[];
  appliedPlugins: string[];
  warnings: string[];
  gitInitialized: boolean;
}

export type CreateProjectErrorCode =
  | 'INVALID_PROJECT_NAME'
  | 'UNSAFE_DESTINATION'
  | 'DESTINATION_NOT_EMPTY'
  | 'DESTINATION_BUSY'
  | 'UNSUPPORTED_FRAMEWORK'
  | 'SCAFFOLD_FAILED';

export class CreateProjectError extends Error {
  constructor(
    readonly code: CreateProjectErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'CreateProjectError';
  }
}

export const defaultProcessExecutor: ProcessExecutor = {
  run(command, args, cwd) {
    return new Promise((resolve) => {
      const child = spawn(command, [...args], { cwd, stdio: 'ignore', shell: false });
      child.once('error', (error) => resolve({ exitCode: 1, error: error.message }));
      child.once('exit', (code) => resolve({ exitCode: code ?? 1 }));
    });
  },
};

export async function createProject(options: CreateProjectOptions): Promise<CreateProjectResult> {
  const validation = validateProjectName(options.projectName);
  if (!validation.valid) {
    throw new CreateProjectError(
      'INVALID_PROJECT_NAME',
      validation.message ?? 'Invalid project name.',
    );
  }
  if (options.framework !== 'nextjs') {
    throw new CreateProjectError(
      'UNSUPPORTED_FRAMEWORK',
      'Only the nextjs framework is supported.',
    );
  }

  const parent = await realpath(options.destinationDirectory).catch(() => {
    throw new CreateProjectError(
      'UNSAFE_DESTINATION',
      'Destination parent directory does not exist.',
    );
  });
  const destination = path.resolve(parent, options.projectName);
  if (path.dirname(destination) !== parent) {
    throw new CreateProjectError(
      'UNSAFE_DESTINATION',
      'Project destination must stay inside the current directory.',
    );
  }

  const destinationState = await inspectDestination(destination);
  const templateFiles = renderNextjsTemplate(options.projectName, options.packageManager);
  const warnings: string[] = [];
  const appliedPlugins: string[] = [];
  let gitInitialized = false;

  if (!destinationState.exists) {
    const staging = await mkdtemp(path.join(parent, `.forgecli-${options.projectName}-`));
    try {
      const createdFiles = await writeTemplate(staging, templateFiles);
      const git = await initializeGit(staging, options, warnings);
      gitInitialized = git;
      await applyRequestedPlugins(staging, options, createdFiles, appliedPlugins, warnings);
      await rename(staging, destination).catch(() => {
        throw new CreateProjectError(
          'DESTINATION_BUSY',
          `Could not finalize ${options.projectName}; the destination may have been created concurrently.`,
        );
      });
      return {
        projectDirectory: destination,
        createdFiles,
        appliedPlugins,
        warnings,
        gitInitialized,
      };
    } catch (error) {
      await rm(staging, { recursive: true, force: true });
      throw normalizeError(error);
    }
  }

  const lockPath = path.join(destination, '.forgecli-create.lock');
  if (!(await createFileSafely(lockPath, 'ForgeKi scaffolding in progress\n'))) {
    throw new CreateProjectError(
      'DESTINATION_BUSY',
      'Another scaffold operation is using this destination.',
    );
  }
  const createdFiles: string[] = [];
  const createdDirectories: string[] = [];
  try {
    await writeTemplate(destination, templateFiles, createdFiles, createdDirectories);
  } catch (error) {
    await cleanupTracked(destination, createdFiles, createdDirectories);
    throw normalizeError(error);
  } finally {
    await unlink(lockPath).catch(() => undefined);
  }
  gitInitialized = await initializeGit(destination, options, warnings);
  await applyRequestedPlugins(destination, options, createdFiles, appliedPlugins, warnings);
  return { projectDirectory: destination, createdFiles, appliedPlugins, warnings, gitInitialized };
}

async function inspectDestination(destination: string): Promise<{ exists: boolean }> {
  try {
    const stats = await lstat(destination);
    if (stats.isSymbolicLink()) {
      throw new CreateProjectError(
        'UNSAFE_DESTINATION',
        'Symbolic-link destinations are not allowed.',
      );
    }
    if (!stats.isDirectory()) {
      throw new CreateProjectError(
        'UNSAFE_DESTINATION',
        'Destination exists and is not a directory.',
      );
    }
    if ((await readdir(destination)).length > 0) {
      throw new CreateProjectError('DESTINATION_NOT_EMPTY', 'Destination directory is not empty.');
    }
    return { exists: true };
  } catch (error) {
    if (isMissing(error)) return { exists: false };
    throw error;
  }
}

async function writeTemplate(
  root: string,
  files: readonly { path: string; content: string }[],
  createdFiles: string[] = [],
  createdDirectories: string[] = [],
): Promise<string[]> {
  for (const file of files) {
    const destination = path.join(root, file.path);
    const directory = path.dirname(destination);
    await ensureDirectories(root, directory, createdDirectories);
    if (!(await createFileSafely(destination, file.content))) {
      throw new CreateProjectError(
        'SCAFFOLD_FAILED',
        `Refusing to overwrite existing file: ${file.path}`,
      );
    }
    createdFiles.push(file.path);
  }
  return createdFiles;
}

async function ensureDirectories(root: string, target: string, created: string[]): Promise<void> {
  const relative = path.relative(root, target);
  if (!relative) return;
  let current = root;
  for (const segment of relative.split(path.sep)) {
    current = path.join(current, segment);
    try {
      const stats = await lstat(current);
      if (stats.isSymbolicLink() || !stats.isDirectory()) {
        throw new CreateProjectError(
          'UNSAFE_DESTINATION',
          'Template path contains an unsafe filesystem entry.',
        );
      }
    } catch (error) {
      if (!isMissing(error)) throw error;
      await mkdir(current);
      created.push(path.relative(root, current));
    }
  }
}

async function initializeGit(
  directory: string,
  options: CreateProjectOptions,
  warnings: string[],
): Promise<boolean> {
  if (!options.initializeGit) return false;
  let result: ProcessResult;
  try {
    result = await (options.processExecutor ?? defaultProcessExecutor).run(
      'git',
      ['init'],
      directory,
    );
  } catch (error) {
    warnings.push(`Git was not initialized: ${errorMessage(error)}`);
    return false;
  }
  if (result.exitCode === 0) return true;
  warnings.push(`Git was not initialized${result.error ? `: ${result.error}` : '.'}`);
  return false;
}

async function applyRequestedPlugins(
  directory: string,
  options: CreateProjectOptions,
  createdFiles: string[],
  appliedPlugins: string[],
  warnings: string[],
): Promise<void> {
  const requested = [
    ...(options.addDocker ? ['docker'] : []),
    ...(options.addGitHubActions ? ['github-actions'] : []),
  ];
  for (const id of requested) {
    const plugin = options.plugins?.find((candidate) => candidate.id === id);
    if (!plugin) {
      warnings.push(`Plugin ${id} is not available; the base project was preserved.`);
      continue;
    }
    try {
      const result = await plugin.apply({ cwd: directory });
      if (result.status === 'applied') {
        appliedPlugins.push(id);
        createdFiles.push(...result.createdFiles);
      } else {
        warnings.push(`${plugin.name}: ${result.message}`);
      }
    } catch (error) {
      warnings.push(
        `${plugin.name} failed: ${errorMessage(error)}. The base project was preserved.`,
      );
    }
  }
}

async function cleanupTracked(
  root: string,
  files: readonly string[],
  directories: readonly string[],
) {
  for (const file of [...files].reverse())
    await unlink(path.join(root, file)).catch(() => undefined);
  for (const directory of [...directories].reverse()) {
    await rmdir(path.join(root, directory)).catch(() => undefined);
  }
}

function normalizeError(error: unknown): CreateProjectError {
  return error instanceof CreateProjectError
    ? error
    : new CreateProjectError(
        'SCAFFOLD_FAILED',
        `Project scaffolding failed: ${errorMessage(error)}`,
      );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isMissing(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
