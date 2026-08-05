import type { ForgePlugin } from '@forgecli7/core';
import { dockerPlugin } from '@forgecli7/plugin-docker';
import { githubActionsPlugin } from '@forgecli7/plugin-github-actions';
import { PluginRegistry } from './registry.js';

const builtInPlugins: readonly ForgePlugin[] = [dockerPlugin, githubActionsPlugin];

/** Loads all plugins bundled with ForgeKi into an isolated registry. */
export function loadPlugins(additionalPlugins: readonly ForgePlugin[] = []): PluginRegistry {
  const registry = new PluginRegistry();

  for (const plugin of [...builtInPlugins, ...additionalPlugins]) {
    registry.register(plugin);
  }

  return registry;
}
