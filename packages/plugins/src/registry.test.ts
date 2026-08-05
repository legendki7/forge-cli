import type { ForgePlugin } from '@forgecli7/core';
import { describe, expect, it } from 'vitest';
import { loadPlugins } from './loader.js';
import { PluginRegistry } from './registry.js';

const testPlugin: ForgePlugin = {
  id: 'test',
  name: 'Test',
  description: 'A test plugin.',
  detect: async () => ({ detected: false, message: 'Not detected.', files: [] }),
  apply: async () => ({
    status: 'applied',
    message: 'Applied.',
    createdFiles: [],
    skippedFiles: [],
  }),
};

describe('PluginRegistry', () => {
  it('registers and resolves plugins case-insensitively', () => {
    const registry = new PluginRegistry();
    registry.register(testPlugin);

    expect(registry.get('TEST')).toBe(testPlugin);
    expect(registry.list()).toEqual([testPlugin]);
  });

  it('rejects duplicate plugin ids', () => {
    const registry = new PluginRegistry();
    registry.register(testPlugin);

    expect(() => registry.register(testPlugin)).toThrow('already registered');
  });

  it('automatically loads built-in plugins', () => {
    expect(loadPlugins().get('docker')?.name).toBe('Docker');
    expect(loadPlugins().get('GITHUB-ACTIONS')?.name).toBe('GitHub Actions');
  });
});
