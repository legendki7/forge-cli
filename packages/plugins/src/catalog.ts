import { detectProject, type Framework, type PluginApplyResult } from '@forgecli7/core';
import { loadPlugins } from './loader.js';

export type BuiltinPluginId = 'docker' | 'github-actions';
export type BuiltinPluginStatus = 'available' | 'installed' | 'partial' | 'unsupported';

export interface BuiltinPluginCatalogEntry {
  id: BuiltinPluginId;
  name: string;
  description: string;
  version: string;
  builtIn: true;
  supportedFrameworks: readonly Framework[];
  files: readonly string[];
  status: BuiltinPluginStatus;
  message: string;
  detectedFiles: readonly string[];
}

const trustedIds = new Set<BuiltinPluginId>(['docker', 'github-actions']);

export function isBuiltinPluginId(value: unknown): value is BuiltinPluginId {
  return typeof value === 'string' && trustedIds.has(value as BuiltinPluginId);
}

export async function inspectBuiltinPlugins(
  directory?: string,
): Promise<BuiltinPluginCatalogEntry[]> {
  const registry = loadPlugins();
  const project = directory ? await detectProject(directory) : undefined;

  return Promise.all(
    registry.list().map(async (plugin) => {
      if (!isBuiltinPluginId(plugin.id)) {
        throw new Error(`Untrusted plugin registered in the built-in catalog: ${plugin.id}`);
      }
      const supported =
        !project ||
        (project.framework !== 'unknown' &&
          (plugin.supportedFrameworks ?? []).includes(project.framework));
      const detection = directory ? await plugin.detect({ cwd: directory }) : undefined;
      const status: BuiltinPluginStatus = !supported
        ? 'unsupported'
        : detection?.state === 'configured'
          ? 'installed'
          : detection?.state === 'partial'
            ? 'partial'
            : 'available';
      return {
        id: plugin.id,
        name: plugin.name,
        description: plugin.description,
        version: plugin.version ?? 'unknown',
        builtIn: true,
        supportedFrameworks: plugin.supportedFrameworks ?? [],
        files: plugin.managedFiles ?? [],
        status,
        message: detection?.message ?? 'Select a project to inspect this built-in plugin.',
        detectedFiles: detection?.files ?? [],
      };
    }),
  );
}

export async function applyBuiltinPlugin(
  directory: string,
  pluginId: BuiltinPluginId,
): Promise<PluginApplyResult> {
  if (!isBuiltinPluginId(pluginId)) throw new Error('Unsupported built-in plugin.');
  const plugin = loadPlugins().get(pluginId);
  if (!plugin) throw new Error('The requested built-in plugin is unavailable.');
  return plugin.apply({ cwd: directory });
}
