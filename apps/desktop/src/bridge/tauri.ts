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
} from '../types';
import type { BuiltinPluginCatalogEntry } from '@forgecli7/plugins';

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

  scanProject(path) {
    return invoke<DesktopProjectScan>('scan_project', { path });
  },

  inspectBuiltinPlugins(path) {
    return invoke<BuiltinPluginCatalogEntry[]>('inspect_builtin_plugins', { path });
  },

  applyBuiltinPlugin(request) {
    return invoke<PluginApplyResponse>('apply_builtin_plugin', { request });
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
};
