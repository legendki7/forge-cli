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
};
