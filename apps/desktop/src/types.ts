import type { Framework, ProjectLanguage, SupportedPackageManager } from '@forgecli7/core';
import type { BuiltinPluginCatalogEntry, BuiltinPluginId } from '@forgecli7/plugins';
import type { TemplateId } from '@forgecli7/templates';

export type PackageManager = SupportedPackageManager;
export type NavigationPage =
  'home' | 'create' | 'templates' | 'scan' | 'plugins' | 'tools' | 'activity' | 'settings';
export type ThemePreference = 'system' | 'light' | 'dark';
export type UserMode = 'beginner' | 'advanced';

export interface DesktopPreferences {
  theme: ThemePreference;
  sidebarCollapsed: boolean;
  defaultPackageManager: PackageManager;
  defaultDestination: string;
  initializeGit: boolean;
  addDocker: boolean;
  addGitHubActions: boolean;
  mode: UserMode;
  dismissedRecommendations: string[];
}

export type ActivityType =
  | 'project-created'
  | 'project-scanned'
  | 'docker-added'
  | 'github-actions-added'
  | 'folder-opened'
  | 'creation-failed'
  | 'plugin-warning';
export type ActivityResult = 'success' | 'warning' | 'failed';

export interface ActivityEntry {
  id: string;
  type: ActivityType;
  projectName?: string;
  projectPath?: string;
  timestamp: string;
  result: ActivityResult;
  message: string;
}

export interface RecentProject {
  name: string;
  path: string;
  framework: Framework;
  packageManager: string;
  lastActivityAt: string;
  activityType: 'created' | 'scanned';
}

export interface PersistedDesktopState {
  schemaVersion: 1;
  preferences: DesktopPreferences;
  recentProjects: RecentProject[];
  activity: ActivityEntry[];
}

export interface DesktopCreateRequest {
  projectName: string;
  destinationDirectory: string;
  framework: 'nextjs';
  templateId: TemplateId;
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
  templateId: TemplateId;
  packageManager: PackageManager;
  initializedFeatures: string[];
  warnings: string[];
}

export interface ProjectRecommendation {
  id: string;
  severity: 'info' | 'warning';
  message: string;
  pluginId?: BuiltinPluginId;
}

export interface DesktopProjectScan {
  directory: string;
  projectName: string;
  framework: Framework;
  packageManager: string;
  language: ProjectLanguage;
  scripts: Record<string, string>;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  detectedFiles: string[];
  warnings: string[];
  plugins: BuiltinPluginCatalogEntry[];
  recommendations: ProjectRecommendation[];
}

export type DeveloperToolId =
  'node' | 'npm' | 'pnpm' | 'yarn' | 'bun' | 'git' | 'docker' | 'vscode' | 'rust' | 'cargo';
export type DeveloperToolStatus = 'installed' | 'not-detected' | 'unavailable' | 'check-failed';

export interface DeveloperToolResult {
  id: DeveloperToolId;
  name: string;
  status: DeveloperToolStatus;
  version?: string;
  required: boolean;
  purpose: string;
}

export interface DeveloperToolsReport {
  tools: DeveloperToolResult[];
  summary: string[];
  checkedAt: string;
}

export interface PluginApplyRequest {
  projectDirectory: string;
  pluginId: BuiltinPluginId;
}

export interface PluginApplyResponse {
  status: 'applied' | 'skipped' | 'unsupported';
  message: string;
  createdFiles: readonly string[];
  skippedFiles: readonly string[];
  scan: DesktopProjectScan;
}

export interface DesktopBridge {
  selectDestination(): Promise<string | null>;
  createProject(
    request: DesktopCreateRequest,
    onProgress: (event: ProgressEvent) => void,
  ): Promise<DesktopCreateResult>;
  scanProject(path: string): Promise<DesktopProjectScan>;
  inspectBuiltinPlugins(path?: string): Promise<BuiltinPluginCatalogEntry[]>;
  applyBuiltinPlugin(request: PluginApplyRequest): Promise<PluginApplyResponse>;
  checkDeveloperTools(): Promise<DeveloperToolsReport>;
  loadDesktopState(): Promise<unknown>;
  saveDesktopState(state: PersistedDesktopState): Promise<void>;
  openProjectFolder(path: string): Promise<void>;
  copyProjectPath(path: string): Promise<void>;
}
