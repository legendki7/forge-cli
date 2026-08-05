import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { DesktopBridge, DesktopCreateResult, ProgressEvent } from '../types';

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

  openProjectFolder(path) {
    return invoke('open_project_folder', { path });
  },

  copyProjectPath(path) {
    return invoke('copy_project_path', { path });
  },
};
