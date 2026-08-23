import { afterEach, describe, expect, it, vi } from 'vitest';
import { BUILTIN_WORKSPACE_PRESETS } from '@forgecli7/workspaces/model';
import {
  MAX_ACTIVITY_ENTRIES,
  MAX_CUSTOM_STACK_PRESETS,
  MAX_RECENT_PROJECTS,
  addActivity,
  addRecentProject,
  createDefaultDesktopState,
  defaultPreferences,
  InMemoryStorageAdapter,
  migrateDesktopState,
} from './persistence';

describe('desktop persistence', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('loads safe defaults and recovers corrupted data', () => {
    expect(migrateDesktopState('broken')).toEqual(createDefaultDesktopState());
    expect(
      migrateDesktopState({ schemaVersion: 99, preferences: { theme: 'invalid' } }).preferences,
    ).toEqual(defaultPreferences);
  });

  it('migrates supported values without persisting unknown sensitive keys', () => {
    const state = migrateDesktopState({
      schemaVersion: 0,
      preferences: { theme: 'dark', token: 'secret', mode: 'advanced' },
      npmToken: 'secret',
    });
    expect(state.preferences.theme).toBe('dark');
    expect(state.preferences.mode).toBe('advanced');
    expect(JSON.stringify(state)).not.toContain('secret');
    expect(JSON.stringify(state)).not.toContain('npmToken');
  });

  it('defaults, restores, and validates the persisted Desktop language without losing state', () => {
    expect(createDefaultDesktopState().preferences.language).toBe('en');
    const arabic = migrateDesktopState({
      schemaVersion: 2,
      preferences: { language: 'ar', theme: 'dark' },
      recentProjects: [
        {
          name: 'kept',
          path: 'C:/projects/kept',
          framework: 'nextjs',
          packageManager: 'pnpm',
          lastActivityAt: '2026-01-01T00:00:00.000Z',
          activityType: 'created',
        },
      ],
    });
    expect(arabic.preferences.language).toBe('ar');
    expect(arabic.preferences.theme).toBe('dark');
    expect(arabic.recentProjects[0]?.name).toBe('kept');
    expect(
      migrateDesktopState({ preferences: { language: 'invalid', theme: 'light' } }).preferences,
    ).toMatchObject({ language: 'en', theme: 'light' });
  });

  it('bounds and deduplicates recent projects', () => {
    let state = createDefaultDesktopState();
    for (let index = 0; index < MAX_RECENT_PROJECTS + 5; index += 1) {
      state = addRecentProject(state, {
        name: `project-${index}`,
        path: `/projects/${index}`,
        framework: 'nextjs',
        packageManager: 'pnpm',
        lastActivityAt: '2026-01-01T00:00:00.000Z',
        activityType: 'created',
      });
    }
    expect(state.recentProjects).toHaveLength(MAX_RECENT_PROJECTS);
    state = addRecentProject(state, { ...state.recentProjects[4]!, name: 'updated' });
    expect(state.recentProjects[0]?.name).toBe('updated');
  });

  it('bounds activity and sanitizes token-shaped messages', () => {
    let state = createDefaultDesktopState();
    for (let index = 0; index < MAX_ACTIVITY_ENTRIES + 5; index += 1) {
      state = addActivity(state, {
        id: String(index),
        type: 'plugin-warning',
        timestamp: '2026-01-01T00:00:00.000Z',
        result: 'warning',
        message: `message npm_${'a'.repeat(26)}`,
      });
    }
    expect(state.activity).toHaveLength(MAX_ACTIVITY_ENTRIES);
    expect(state.activity[0]?.message).toContain('[redacted]');
  });

  it('supports an in-memory test adapter', async () => {
    const adapter = new InMemoryStorageAdapter();
    const state = createDefaultDesktopState();
    await adapter.save(state);
    expect(migrateDesktopState(await adapter.load())).toEqual(state);
  });

  it('restores valid custom presets and the last stack through schema migration', () => {
    const definition = {
      framework: 'express',
      components: ['typescript', 'vitest', 'node'],
      packageManager: 'pnpm',
      initializeGit: false,
      addDocker: false,
      addGitHubActions: false,
    };
    const migrated = migrateDesktopState({
      schemaVersion: 1,
      customStackPresets: [
        {
          schemaVersion: 1,
          id: 'local-api',
          name: 'Local API',
          description: 'Offline Express preset',
          definition,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      lastStack: definition,
    });
    expect(migrated.schemaVersion).toBe(3);
    expect(migrated.customStackPresets[0]?.name).toBe('Local API');
    expect(migrated.lastStack?.framework).toBe('express');
  });

  it('rejects tampered presets, redacts secrets, and bounds the custom preset collection', () => {
    const preset = (index: number) => ({
      schemaVersion: 1,
      id: `preset-${index}`,
      name: `Preset ${index} npm_${'a'.repeat(26)}`,
      description: `Safe description npm_${'b'.repeat(26)}`,
      definition: {
        framework: 'nextjs',
        components: ['typescript', 'plain-css', 'node'],
        packageManager: 'pnpm',
        initializeGit: false,
        addDocker: false,
        addGitHubActions: false,
      },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    const migrated = migrateDesktopState({
      customStackPresets: [
        {
          ...preset(-1),
          definition: { ...preset(-1).definition, components: ['typescript', '@evil/package'] },
        },
        ...Array.from({ length: MAX_CUSTOM_STACK_PRESETS + 5 }, (_, index) => preset(index)),
      ],
      apiToken: 'must-not-survive',
    });
    expect(migrated.customStackPresets).toHaveLength(MAX_CUSTOM_STACK_PRESETS);
    expect(migrated.customStackPresets.some(({ id }) => id === 'preset--1')).toBe(false);
    expect(JSON.stringify(migrated)).not.toContain('must-not-survive');
    expect(JSON.stringify(migrated)).not.toContain(`npm_${'a'.repeat(26)}`);
  });

  it('restores schema-v2 workspace state in the browser and drops only corrupted definitions', () => {
    vi.stubGlobal('Buffer', undefined);
    const definition = BUILTIN_WORKSPACE_PRESETS[0]!.definition;
    const migrated = migrateDesktopState({
      schemaVersion: 2,
      lastWorkspace: definition,
      customWorkspacePresets: [
        {
          schemaVersion: 1,
          id: 'valid-workspace',
          name: 'Valid workspace',
          description: 'Local preset',
          definition,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          schemaVersion: 1,
          id: 'broken-workspace',
          name: 'Broken workspace',
          definition: { schemaVersion: 1, services: 'invalid' },
        },
      ],
    });

    expect(migrated.schemaVersion).toBe(3);
    expect(migrated.lastWorkspace).toEqual(definition);
    expect(migrated.customWorkspacePresets.map(({ id }) => id)).toEqual(['valid-workspace']);
  });
});
