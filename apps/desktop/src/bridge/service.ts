import path from 'node:path';
import { detectProject, validateProjectName, type SupportedPackageManager } from '@forgecli7/core';
import { loadPlugins } from '@forgecli7/plugins';
import { createProject, CreateProjectError } from '@forgecli7/templates';
import type {
  DesktopCreateRequest,
  DesktopCreateResult,
  ProgressEvent,
  ProgressStepId,
} from '../types';

export interface WorkerEnvelope {
  operationId: string;
  request: unknown;
}

export type WorkerMessage =
  | { type: 'progress'; payload: ProgressEvent }
  | { type: 'result'; payload: DesktopCreateResult }
  | { type: 'error'; payload: { code: string; message: string; details?: string } };

const requestKeys = new Set([
  'projectName',
  'destinationDirectory',
  'framework',
  'packageManager',
  'initializeGit',
  'addDocker',
  'addGitHubActions',
]);

export async function handleWorkerEnvelope(
  envelope: WorkerEnvelope,
  send: (message: WorkerMessage) => void,
): Promise<void> {
  let currentStep: ProgressStepId = 'validate';
  const progress = (step: ProgressStepId, state: ProgressEvent['state'], message: string) => {
    if (state === 'running') currentStep = step;
    send({
      type: 'progress',
      payload: { operationId: envelope.operationId, step, state, message },
    });
  };

  try {
    const request = validateRequest(envelope.request);
    progress('validate', 'running', 'Checking project configuration');
    progress('validate', 'succeeded', 'Project configuration is valid');
    progress('prepare', 'running', 'Checking the selected destination');
    progress('scaffold', 'running', 'Writing the Next.js project safely');

    const result = await createProject({ ...request, plugins: loadPlugins().list() });
    progress('prepare', 'succeeded', 'Destination passed safety checks');
    progress('scaffold', 'succeeded', 'Next.js project files were created');
    if (request.initializeGit) {
      progress('git', 'running', 'Checking Git initialization');
      progress(
        'git',
        result.gitInitialized ? 'succeeded' : 'warning',
        result.gitInitialized ? 'Git repository initialized' : gitWarning(result.warnings),
      );
    } else progress('git', 'skipped', 'Git was not requested');
    if (request.addDocker) {
      progress('docker', 'running', 'Checking Docker plugin output');
      reportPlugin(progress, result, 'docker', 'Docker');
    } else progress('docker', 'skipped', 'Docker was not requested');
    if (request.addGitHubActions) {
      progress('github-actions', 'running', 'Checking GitHub Actions plugin output');
      reportPlugin(progress, result, 'github-actions', 'GitHub Actions');
    } else progress('github-actions', 'skipped', 'GitHub Actions was not requested');
    progress('finish', 'running', 'Verifying the generated project');
    const detection = await detectProject(result.projectDirectory);
    if (detection.framework !== 'nextjs') {
      throw new CreateProjectError(
        'SCAFFOLD_FAILED',
        'The generated Next.js project could not be verified.',
      );
    }
    progress('finish', 'succeeded', 'Project creation finished');
    send({
      type: 'result',
      payload: {
        projectName: request.projectName,
        projectDirectory: result.projectDirectory,
        framework: 'nextjs',
        packageManager: request.packageManager,
        initializedFeatures: [
          ...(result.gitInitialized ? ['Git'] : []),
          ...(result.appliedPlugins.includes('docker') ? ['Docker'] : []),
          ...(result.appliedPlugins.includes('github-actions') ? ['GitHub Actions'] : []),
        ],
        warnings: result.warnings,
      },
    });
  } catch (error) {
    progress(currentStep, 'failed', `${stepLabel(currentStep)} failed`);
    send({ type: 'error', payload: publicError(error) });
  }
}

export function validateRequest(value: unknown): DesktopCreateRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalidPayload();
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => !requestKeys.has(key))) invalidPayload();
  const projectName = typeof input.projectName === 'string' ? input.projectName.trim() : '';
  const validation = validateProjectName(projectName);
  if (!validation.valid)
    throw new CreateProjectError(
      'INVALID_PROJECT_NAME',
      validation.message ?? 'Invalid project name.',
    );
  if (
    typeof input.destinationDirectory !== 'string' ||
    !path.isAbsolute(input.destinationDirectory) ||
    input.destinationDirectory.includes('\0')
  ) {
    throw new CreateProjectError(
      'UNSAFE_DESTINATION',
      'A selected absolute destination is required.',
    );
  }
  if (input.framework !== 'nextjs')
    throw new CreateProjectError('UNSUPPORTED_FRAMEWORK', 'Only Next.js is supported.');
  if (!isPackageManager(input.packageManager)) invalidPayload();
  const initializeGit = readBoolean(input, 'initializeGit');
  const addDocker = readBoolean(input, 'addDocker');
  const addGitHubActions = readBoolean(input, 'addGitHubActions');
  return {
    projectName,
    destinationDirectory: input.destinationDirectory,
    framework: 'nextjs',
    packageManager: input.packageManager,
    initializeGit,
    addDocker,
    addGitHubActions,
  };
}

function reportPlugin(
  progress: (step: ProgressStepId, state: ProgressEvent['state'], message: string) => void,
  result: Awaited<ReturnType<typeof createProject>>,
  id: 'docker' | 'github-actions',
  label: string,
) {
  const applied = result.appliedPlugins.includes(id);
  progress(
    id,
    applied ? 'succeeded' : 'warning',
    applied ? `${label} configuration added` : `${label} was not added; see warnings`,
  );
}

function publicError(error: unknown): { code: string; message: string; details?: string } {
  if (error instanceof CreateProjectError) return { code: error.code, message: error.message };
  const message = error instanceof Error ? error.message : 'Unexpected project creation error.';
  return {
    code: 'UNEXPECTED_ERROR',
    message: 'Project creation failed unexpectedly.',
    details: sanitize(message),
  };
}

function sanitize(message: string): string {
  return message
    .replace(/[A-Z]:\\Users\\[^\\\s]+/giu, '%USERPROFILE%')
    .replace(/\/Users\/[^/\s]+/gu, '~')
    .replace(/(?:npm|ghp)_[A-Za-z0-9_-]+/gu, '[redacted]')
    .slice(0, 1000);
}

function gitWarning(warnings: string[]): string {
  return (
    warnings.find((warning) => warning.startsWith('Git was not initialized')) ??
    'Git was not initialized'
  );
}

function stepLabel(step: ProgressStepId): string {
  const labels: Record<ProgressStepId, string> = {
    validate: 'Configuration validation',
    prepare: 'Destination preparation',
    scaffold: 'Project scaffolding',
    git: 'Git initialization',
    docker: 'Docker configuration',
    'github-actions': 'GitHub Actions configuration',
    finish: 'Project verification',
  };
  return labels[step];
}

function isPackageManager(value: unknown): value is SupportedPackageManager {
  return value === 'pnpm' || value === 'npm' || value === 'yarn' || value === 'bun';
}

function invalidPayload(): never {
  throw new Error('Invalid desktop bridge payload.');
}

function readBoolean(input: Record<string, unknown>, key: string): boolean {
  const value = input[key];
  if (typeof value !== 'boolean') invalidPayload();
  return value;
}
