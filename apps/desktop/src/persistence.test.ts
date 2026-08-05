import { describe, expect, it } from 'vitest';
import {
  MAX_ACTIVITY_ENTRIES,
  MAX_RECENT_PROJECTS,
  addActivity,
  addRecentProject,
  createDefaultDesktopState,
  defaultPreferences,
  InMemoryStorageAdapter,
  migrateDesktopState,
} from './persistence';

describe('desktop persistence', () => {
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
});
