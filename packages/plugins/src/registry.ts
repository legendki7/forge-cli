import type { ForgePlugin } from '@forgecli7/core';

export class PluginRegistry {
  readonly #plugins = new Map<string, ForgePlugin>();

  register(plugin: ForgePlugin): void {
    const id = plugin.id.trim().toLowerCase();

    if (!id) {
      throw new Error('A plugin id cannot be empty.');
    }

    if (this.#plugins.has(id)) {
      throw new Error(`A plugin with id "${id}" is already registered.`);
    }

    this.#plugins.set(id, plugin);
  }

  get(id: string): ForgePlugin | undefined {
    return this.#plugins.get(id.trim().toLowerCase());
  }

  has(id: string): boolean {
    return this.get(id) !== undefined;
  }

  list(): readonly ForgePlugin[] {
    return [...this.#plugins.values()];
  }
}
