import type {
  DetectedStackComponent,
  Framework,
  ProjectLanguage,
  StackDefinition,
  StackFramework,
  SupportedPackageManager,
} from '@forgecli7/core';
import type { BuiltinPluginCatalogEntry, BuiltinPluginId } from '@forgecli7/plugins';
import type { ProjectGenerationPlan, TemplateId } from '@forgecli7/templates';

export type PackageManager = SupportedPackageManager;
export type NavigationPage =
  | 'home'
  | 'create'
  | 'templates'
  | 'stack-builder'
  | 'scan'
  | 'plugins'
  | 'tools'
  | 'activity'
  | 'settings';
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
  defaultFramework: StackFramework;
  defaultStyling: 'plain-css' | 'tailwind';
  defaultTesting: 'none' | 'vitest' | 'playwright';
  rememberLastStack: boolean;
  confirmRequiredComponents: boolean;
}

export type ActivityType =
  | 'project-created'
  | 'project-scanned'
  | 'docker-added'
  | 'github-actions-added'
  | 'folder-opened'
  | 'creation-failed'
  | 'plugin-warning'
  | 'stack-configured'
  | 'preset-loaded'
  | 'preset-saved'
  | 'stack-generated'
  | 'stack-validation-failed';
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
  schemaVersion: 2;
  preferences: DesktopPreferences;
  recentProjects: RecentProject[];
  activity: ActivityEntry[];
  customStackPresets: CustomStackPreset[];
  lastStack?: StackDefinition;
}

export interface CustomStackPreset {
  schemaVersion: 1;
  id: string;
  name: string;
  description: string;
  definition: StackDefinition;
  createdAt: string;
  updatedAt: string;
}

export interface DesktopCreateRequest {
  projectName: string;
  destinationDirectory: string;
  framework: StackFramework;
  templateId: TemplateId | StackFramework;
  packageManager: PackageManager;
  initializeGit: boolean;
  addDocker: boolean;
  addGitHubActions: boolean;
  stack?: StackDefinition;
  generationPlan?: ProjectGenerationPlan;
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
  framework: StackFramework;
  templateId: string;
  packageManager: PackageManager;
  initializedFeatures: string[];
  warnings: string[];
  generationPlan?: ProjectGenerationPlan;
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
  stackComponents?: DetectedStackComponent[];
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
  planStack(request: StackPlanRequest): Promise<ProjectGenerationPlan>;
  createStack(
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

export interface StackPlanRequest {
  projectName: string;
  destinationDirectory: string;
  stack: StackDefinition;
  templateId?: string;
}
