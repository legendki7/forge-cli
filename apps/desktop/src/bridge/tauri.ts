import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type {
  DesktopBridge,
  DesktopCreateResult,
  DesktopProjectScan,
  DeveloperToolsReport,
  PersistedDesktopState,
  PluginApplyResponse,
  ProgressEvent,
  StackPlanRequest,
} from '../types';
import type { ProjectGenerationPlan } from '@forgecli7/templates';
import type { BuiltinPluginCatalogEntry } from '@forgecli7/plugins';
import type { PluginCatalogEntry } from '@forgecli7/plugins';
import type { ForgeKiPluginManifest, PluginSafetyReport } from '@forgecli7/plugin-sdk';
import type {
  ForgeWorkspace,
  WorkspaceGenerationPlan,
  WorkspaceGenerationResult,
  WorkspaceScanResult,
} from '@forgecli7/workspaces';
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

export const tauriBridge: DesktopBridge = {
  selectDestination() {
    return invoke<string | null>('select_destination');
  },

  async createProject(request, onProgress) {
    const unlisten = await listen<ProgressEvent>('forgeki://creation-progress', ({ payload }) => {
      onProgress(payload);
    });
    try {
      return await invoke<DesktopCreateResult>('create_project', { request });
    } finally {
      unlisten();
    }
  },

  planStack(request: StackPlanRequest) {
    return invoke<ProjectGenerationPlan>('plan_stack', { request });
  },

  async createStack(request, onProgress) {
    const unlisten = await listen<ProgressEvent>('forgeki://creation-progress', ({ payload }) => {
      onProgress(payload);
    });
    try {
      return await invoke<DesktopCreateResult>('create_project', { request });
    } finally {
      unlisten();
    }
  },

  scanProject(path) {
    return invoke<DesktopProjectScan>('scan_project', { path });
  },

  inspectBuiltinPlugins(path) {
    return invoke<BuiltinPluginCatalogEntry[]>('inspect_builtin_plugins', { path });
  },

  applyBuiltinPlugin(request) {
    return invoke<PluginApplyResponse>('apply_builtin_plugin', { request });
  },

  listMarketplacePlugins() {
    return invoke<PluginCatalogEntry[]>('list_marketplace_plugins');
  },

  validateCommunityPlugin(path) {
    return invoke<{
      manifest?: ForgeKiPluginManifest;
      report: PluginSafetyReport;
      files: string[];
      bytes: number;
    }>('validate_community_plugin', { path });
  },

  installCommunityPlugin(path) {
    return invoke<PluginCatalogEntry>('install_community_plugin', { path });
  },

  installBundledPlugin(id) {
    return invoke<PluginCatalogEntry>('install_bundled_plugin', { id });
  },

  removeCommunityPlugin(id) {
    return invoke('remove_community_plugin', { id });
  },

  createPluginProject(parent, name) {
    return invoke<{ directory: string }>('create_plugin_project', { parent, name });
  },

  checkDeveloperTools() {
    return invoke<DeveloperToolsReport>('check_developer_tools');
  },

  loadDesktopState() {
    return invoke<unknown>('load_desktop_state');
  },

  saveDesktopState(state: PersistedDesktopState) {
    return invoke('save_desktop_state', { state });
  },

  openProjectFolder(path) {
    return invoke('open_project_folder', { path });
  },

  copyProjectPath(path) {
    return invoke('copy_project_path', { path });
  },

  planWorkspace(definition: ForgeWorkspace, destinationDirectory: string) {
    return invoke<WorkspaceGenerationPlan>('plan_workspace', { definition, destinationDirectory });
  },

  createWorkspace(plan: WorkspaceGenerationPlan) {
    return invoke<WorkspaceGenerationResult>('create_workspace', { plan });
  },

  scanWorkspace(path: string) {
    return invoke<WorkspaceScanResult>('scan_workspace', { path });
  },

  copyText(text: string) {
    return invoke('copy_text', { text });
  },

  scanDeployment(path: string) {
    return invoke<DeploymentScanResult>('scan_deployment', { path });
  },

  planDeployment(
    path: string,
    environment: EnvironmentProfileId,
    target: DeploymentTargetId,
    options: DeploymentPlanOptions = {},
  ) {
    return invoke<DeploymentProfile>('plan_deployment', { path, environment, target, options });
  },

  exportDeployment(
    path: string,
    destination: string,
    plan: DeploymentProfile,
    options: DeploymentPlanOptions = {},
  ) {
    return invoke<{ destination: string; createdFiles: string[]; fingerprint: string }>(
      'export_deployment',
      { path, destination, plan, options },
    );
  },

  marketplaceStatus() {
    return invoke<MarketplaceStatus>('marketplace_status');
  },

  refreshMarketplace() {
    return invoke<{ pluginCount: number; verifiedAt: string }>('refresh_marketplace');
  },

  clearMarketplaceCache() {
    return invoke('clear_marketplace_cache');
  },

  searchMarketplace(options: MarketplaceSearchOptions = {}) {
    return invoke<RemotePluginView[]>('search_marketplace', { options });
  },

  showMarketplacePlugin(id: string) {
    return invoke<RemotePluginView>('show_marketplace_plugin', { id });
  },

  reviewRemotePlugin(id: string) {
    return invoke<PluginInstallReview>('review_remote_plugin', { id });
  },

  installRemotePlugin(id: string, confirmed: boolean) {
    return invoke<PluginCatalogEntry>('install_remote_plugin', { id, confirmed });
  },

  listRemotePluginUpdates() {
    return invoke<RemotePluginView[]>('list_remote_plugin_updates');
  },

  updateRemotePlugin(id: string, confirmed: boolean, confirmPermissions = false) {
    return invoke<PluginCatalogEntry>('update_remote_plugin', {
      id,
      confirmed,
      confirmPermissions,
    });
  },

  checkApplicationUpdate(channel: UpdateChannel) {
    return invoke<ApplicationUpdateCheck>('check_application_update', { channel });
  },
};
