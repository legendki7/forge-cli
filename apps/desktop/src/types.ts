import type {
  DetectedStackComponent,
  Framework,
  ProjectLanguage,
  StackDefinition,
  StackFramework,
  SupportedPackageManager,
} from '@forgecli7/core';
import type {
  BuiltinPluginCatalogEntry,
  BuiltinPluginId,
  PluginCatalogEntry,
} from '@forgecli7/plugins';
import type { ForgeKiPluginManifest, PluginSafetyReport } from '@forgecli7/plugin-sdk';
import type { ProjectGenerationPlan, TemplateId } from '@forgecli7/templates';
import type { CustomWorkspacePreset, ForgeWorkspace } from '@forgecli7/workspaces/model';
import type {
  WorkspaceGenerationPlan,
  WorkspaceGenerationResult,
} from '@forgecli7/workspaces/generation';
import type { WorkspaceScanResult } from '@forgecli7/workspaces/scanner';
import type {
  DeploymentPlanOptions,
  DeploymentProfile,
  DeploymentScanResult,
  DeploymentTargetId,
  EnvironmentProfileId,
} from '@forgecli7/deployments';
import type {
  ApplicationUpdateCheck,
  MarketplaceSearchOptions,
  MarketplaceStatus,
  PluginInstallReview,
  RemotePluginView,
  UpdateChannel,
} from '@forgecli7/marketplace/browser';

export type PackageManager = SupportedPackageManager;
export type NavigationPage =
  | 'home'
  | 'create'
  | 'templates'
  | 'stack-builder'
  | 'workspace-builder'
  | 'environments'
  | 'deployment'
  | 'scan'
  | 'plugins'
  | 'security'
  | 'tools'
  | 'activity'
  | 'about'
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
  allowLocalCommunityPlugins: boolean;
  showExperimentalBundledPlugins: boolean;
  defaultEnvironmentView: EnvironmentProfileId;
  preferredDeploymentTarget: DeploymentTargetId;
  defaultDockerProductionProfile: boolean;
  defaultKubernetesReplicas: number;
  includeDeploymentMetadata: boolean;
  showAdvancedDeploymentOptions: boolean;
  remoteMarketplaceEnabled: boolean;
  automaticallyCheckMarketplace: boolean;
  automaticallyCheckUpdates: boolean;
  updateChannel: UpdateChannel;
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
  | 'stack-validation-failed'
  | 'plugin-validated'
  | 'plugin-installed'
  | 'plugin-installation-blocked'
  | 'plugin-removed'
  | 'plugin-integrity-failure'
  | 'plugin-used'
  | 'plugin-development-created'
  | 'marketplace-refreshed'
  | 'remote-plugin-updated'
  | 'plugin-revoked'
  | 'update-checked'
  | 'workspace-configured'
  | 'workspace-generated'
  | 'workspace-scanned'
  | 'environment-profile-reviewed'
  | 'deployment-readiness-checked'
  | 'deployment-plan-generated'
  | 'deployment-files-exported'
  | 'deployment-export-blocked'
  | 'deployment-drift-detected';
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
  schemaVersion: 3;
  preferences: DesktopPreferences;
  recentProjects: RecentProject[];
  activity: ActivityEntry[];
  customStackPresets: CustomStackPreset[];
  lastStack?: StackDefinition;
  recentWorkspaces: RecentWorkspace[];
  customWorkspacePresets: CustomWorkspacePreset[];
  lastWorkspace?: ForgeWorkspace;
}

export interface RecentWorkspace {
  name: string;
  path: string;
  serviceCount: number;
  lastActivityAt: string;
  activityType: 'created' | 'scanned';
  frameworks: string[];
  database?: string;
  infrastructure: string[];
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
  pluginEvidence?: Array<{ pluginId: string; componentId: string; evidence: string[] }>;
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
  listMarketplacePlugins(): Promise<PluginCatalogEntry[]>;
  validateCommunityPlugin(path: string): Promise<{
    manifest?: ForgeKiPluginManifest;
    report: PluginSafetyReport;
    files: string[];
    bytes: number;
  }>;
  installCommunityPlugin(path: string): Promise<PluginCatalogEntry>;
  installBundledPlugin(id: string): Promise<PluginCatalogEntry>;
  removeCommunityPlugin(id: string): Promise<void>;
  createPluginProject(parent: string, name: string): Promise<{ directory: string }>;
  checkDeveloperTools(): Promise<DeveloperToolsReport>;
  loadDesktopState(): Promise<unknown>;
  saveDesktopState(state: PersistedDesktopState): Promise<void>;
  openProjectFolder(path: string): Promise<void>;
  copyProjectPath(path: string): Promise<void>;
  planWorkspace?(
    definition: ForgeWorkspace,
    destinationDirectory: string,
  ): Promise<WorkspaceGenerationPlan>;
  createWorkspace?(plan: WorkspaceGenerationPlan): Promise<WorkspaceGenerationResult>;
  scanWorkspace?(path: string): Promise<WorkspaceScanResult>;
  copyText?(text: string): Promise<void>;
  scanDeployment?(path: string): Promise<DeploymentScanResult>;
  planDeployment?(
    path: string,
    environment: EnvironmentProfileId,
    target: DeploymentTargetId,
    options?: DeploymentPlanOptions,
  ): Promise<DeploymentProfile>;
  exportDeployment?(
    path: string,
    destination: string,
    plan: DeploymentProfile,
    options?: DeploymentPlanOptions,
  ): Promise<{ destination: string; createdFiles: string[]; fingerprint: string }>;
  marketplaceStatus?(): Promise<MarketplaceStatus>;
  refreshMarketplace?(): Promise<{ pluginCount: number; verifiedAt: string }>;
  clearMarketplaceCache?(): Promise<void>;
  searchMarketplace?(options?: MarketplaceSearchOptions): Promise<RemotePluginView[]>;
  showMarketplacePlugin?(id: string): Promise<RemotePluginView>;
  reviewRemotePlugin?(id: string): Promise<PluginInstallReview>;
  installRemotePlugin?(id: string, confirmed: boolean): Promise<PluginCatalogEntry>;
  listRemotePluginUpdates?(): Promise<RemotePluginView[]>;
  updateRemotePlugin?(
    id: string,
    confirmed: boolean,
    confirmPermissions?: boolean,
  ): Promise<PluginCatalogEntry>;
  checkApplicationUpdate?(channel: UpdateChannel): Promise<ApplicationUpdateCheck>;
}

export interface StackPlanRequest {
  projectName: string;
  destinationDirectory: string;
  stack: StackDefinition;
  templateId?: string;
}
