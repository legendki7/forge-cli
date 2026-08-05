import type { ForgePlugin } from '@forgecli/core';
import { dockerPlugin } from '@forgecli/plugin-docker';
import { githubActionsPlugin } from '@forgecli/plugin-github-actions';
import { PluginRegistry } from './registry.js';

const builtInPlugins: readonly ForgePlugin[] = [dockerPlugin, githubActionsPlugin];

/** Loads all plugins bundled with ForgeCLI into an isolated registry. */
export function loadPlugins(additionalPlugins: readonly ForgePlugin[] = []): PluginRegistry {
  const registry = new PluginRegistry();

  for (const plugin of [...builtInPlugins, ...additionalPlugins]) {
    registry.register(plugin);
  }

  return registry;
}
