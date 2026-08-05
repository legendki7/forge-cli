import type { SupportedPackageManager } from '@forgecli7/core';

export type PackageManager = SupportedPackageManager;

export interface DesktopCreateRequest {
  projectName: string;
  destinationDirectory: string;
  framework: 'nextjs';
  packageManager: PackageManager;
  initializeGit: boolean;
  addDocker: boolean;
  addGitHubActions: boolean;
}

export type ProgressStepId =
  'validate' | 'prepare' | 'scaffold' | 'git' | 'docker' | 'github-actions' | 'finish';

export type ProgressState = 'waiting' | 'running' | 'succeeded' | 'skipped' | 'warning' | 'failed';

export interface ProgressEvent {
  operationId: string;
  step: ProgressStepId;
  state: ProgressState;
  message: string;
}

export interface DesktopCreateResult {
  projectName: string;
  projectDirectory: string;
  framework: 'nextjs';
  packageManager: PackageManager;
  initializedFeatures: string[];
  warnings: string[];
}

export interface DesktopBridge {
  selectDestination(): Promise<string | null>;
  createProject(
    request: DesktopCreateRequest,
    onProgress: (event: ProgressEvent) => void,
  ): Promise<DesktopCreateResult>;
  openProjectFolder(path: string): Promise<void>;
  copyProjectPath(path: string): Promise<void>;
}
