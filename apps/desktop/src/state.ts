import { validateProjectName } from '@forgecli7/core/project-name';
import type { DesktopCreateRequest, PackageManager, ProgressEvent, ProgressStepId } from './types';

export interface FormState {
  projectName: string;
  destinationDirectory: string;
  packageManager: PackageManager;
  initializeGit: boolean;
  addDocker: boolean;
  addGitHubActions: boolean;
}

export const initialFormState: FormState = {
  projectName: '',
  destinationDirectory: '',
  packageManager: 'pnpm',
  initializeGit: true,
  addDocker: false,
  addGitHubActions: false,
};

export const progressLabels: Record<ProgressStepId, string> = {
  validate: 'Validating project',
  prepare: 'Preparing destination',
  scaffold: 'Creating Next.js project',
  git: 'Initializing Git',
  docker: 'Adding Docker',
  'github-actions': 'Adding GitHub Actions',
  finish: 'Finishing',
};

export function validateForm(form: FormState): { projectName?: string; destination?: string } {
  const normalized = form.projectName.trim();
  const validation = validateProjectName(normalized);
  return {
    ...(!validation.valid
      ? { projectName: validation.message ?? 'Enter a valid project name.' }
      : {}),
    ...(!form.destinationDirectory ? { destination: 'Select a project location.' } : {}),
  };
}

export function createRequest(form: FormState): DesktopCreateRequest {
  return {
    projectName: form.projectName.trim(),
    destinationDirectory: form.destinationDirectory,
    framework: 'nextjs',
    packageManager: form.packageManager,
    initializeGit: form.initializeGit,
    addDocker: form.addDocker,
    addGitHubActions: form.addGitHubActions,
  };
}

export function initialProgress(form: FormState): ProgressEvent[] {
  return (Object.keys(progressLabels) as ProgressStepId[]).map((step) => ({
    operationId: '',
    step,
    state:
      (step === 'git' && !form.initializeGit) ||
      (step === 'docker' && !form.addDocker) ||
      (step === 'github-actions' && !form.addGitHubActions)
        ? 'skipped'
        : 'waiting',
    message: progressLabels[step],
  }));
}

export function mergeProgress(events: ProgressEvent[], event: ProgressEvent): ProgressEvent[] {
  return events.map((candidate) => (candidate.step === event.step ? event : candidate));
}

export function installCommand(manager: PackageManager): string {
  return `${manager} install`;
}

export function devCommand(manager: PackageManager): string {
  return manager === 'npm' ? 'npm run dev' : `${manager} dev`;
}

export function sanitizeTechnicalDetails(value: unknown): string {
  const message = value instanceof Error ? value.message : String(value);
  return message
    .replace(/[A-Z]:\\Users\\[^\\\s]+/giu, '%USERPROFILE%')
    .replace(/\/Users\/[^/\s]+/gu, '~')
    .replace(/(?:npm|ghp)_[A-Za-z0-9_-]+/gu, '[redacted]')
    .slice(0, 1000);
}
