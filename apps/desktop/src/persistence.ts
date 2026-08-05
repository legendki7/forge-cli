import type {
  ActivityEntry,
  DesktopPreferences,
  PersistedDesktopState,
  RecentProject,
} from './types';

export const MAX_RECENT_PROJECTS = 25;
export const MAX_ACTIVITY_ENTRIES = 200;

export const defaultPreferences: DesktopPreferences = {
  theme: 'system',
  sidebarCollapsed: false,
  defaultPackageManager: 'pnpm',
  defaultDestination: '',
  initializeGit: true,
  addDocker: false,
  addGitHubActions: false,
  mode: 'beginner',
  dismissedRecommendations: [],
};

export function createDefaultDesktopState(): PersistedDesktopState {
  return {
    schemaVersion: 1,
    preferences: { ...defaultPreferences },
    recentProjects: [],
    activity: [],
  };
}

export function migrateDesktopState(value: unknown): PersistedDesktopState {
  if (!isRecord(value)) return createDefaultDesktopState();
  const preferences = isRecord(value.preferences) ? value.preferences : {};
  const recent = Array.isArray(value.recentProjects) ? value.recentProjects : [];
  const activity = Array.isArray(value.activity) ? value.activity : [];
  return {
    schemaVersion: 1,
    preferences: {
      theme: oneOf(preferences.theme, ['system', 'light', 'dark'], 'system'),
      sidebarCollapsed: boolean(preferences.sidebarCollapsed, false),
      defaultPackageManager: oneOf(
        preferences.defaultPackageManager,
        ['pnpm', 'npm', 'yarn', 'bun'],
        'pnpm',
      ),
      defaultDestination: safeText(preferences.defaultDestination, 500),
      initializeGit: boolean(preferences.initializeGit, true),
      addDocker: boolean(preferences.addDocker, false),
      addGitHubActions: boolean(preferences.addGitHubActions, false),
      mode: oneOf(preferences.mode, ['beginner', 'advanced'], 'beginner'),
      dismissedRecommendations: Array.isArray(preferences.dismissedRecommendations)
        ? preferences.dismissedRecommendations
            .map((entry) => safeText(entry, 120))
            .filter(Boolean)
            .slice(0, 100)
        : [],
    },
    recentProjects: recent.map(readRecentProject).filter(isPresent).slice(0, MAX_RECENT_PROJECTS),
    activity: activity.map(readActivity).filter(isPresent).slice(0, MAX_ACTIVITY_ENTRIES),
  };
}

export function addRecentProject(
  state: PersistedDesktopState,
  project: RecentProject,
): PersistedDesktopState {
  return {
    ...state,
    recentProjects: [
      project,
      ...state.recentProjects.filter((candidate) => candidate.path !== project.path),
    ].slice(0, MAX_RECENT_PROJECTS),
  };
}

export function addActivity(
  state: PersistedDesktopState,
  entry: ActivityEntry,
): PersistedDesktopState {
  return {
    ...state,
    activity: [{ ...entry, message: safeText(entry.message, 500) }, ...state.activity].slice(
      0,
      MAX_ACTIVITY_ENTRIES,
    ),
  };
}

export interface DesktopStorageAdapter {
  load(): Promise<unknown>;
  save(state: PersistedDesktopState): Promise<void>;
}

export class InMemoryStorageAdapter implements DesktopStorageAdapter {
  #value: unknown;

  constructor(initial?: unknown) {
    this.#value = initial;
  }

  async load(): Promise<unknown> {
    return structuredClone(this.#value);
  }

  async save(state: PersistedDesktopState): Promise<void> {
    this.#value = structuredClone(state);
  }
}

function readRecentProject(value: unknown): RecentProject | undefined {
  if (!isRecord(value)) return undefined;
  const path = safeText(value.path, 500);
  const name = safeText(value.name, 120);
  if (!path || !name) return undefined;
  return {
    name,
    path,
    framework: oneOf(
      value.framework,
      ['nextjs', 'react-vite', 'express', 'node', 'unknown'],
      'unknown',
    ),
    packageManager: safeText(value.packageManager, 40) || 'unknown',
    lastActivityAt: safeText(value.lastActivityAt, 60),
    activityType: oneOf(value.activityType, ['created', 'scanned'], 'scanned'),
  };
}

function readActivity(value: unknown): ActivityEntry | undefined {
  if (!isRecord(value)) return undefined;
  const id = safeText(value.id, 100);
  const message = safeText(value.message, 500);
  if (!id || !message) return undefined;
  return {
    id,
    type: oneOf(
      value.type,
      [
        'project-created',
        'project-scanned',
        'docker-added',
        'github-actions-added',
        'folder-opened',
        'creation-failed',
        'plugin-warning',
      ],
      'plugin-warning',
    ),
    ...(safeText(value.projectName, 120) ? { projectName: safeText(value.projectName, 120) } : {}),
    ...(safeText(value.projectPath, 500) ? { projectPath: safeText(value.projectPath, 500) } : {}),
    timestamp: safeText(value.timestamp, 60),
    result: oneOf(value.result, ['success', 'warning', 'failed'], 'warning'),
    message,
  };
}

function safeText(value: unknown, limit: number): string {
  if (typeof value !== 'string') return '';
  return [...value]
    .filter((character) => character.charCodeAt(0) > 31)
    .join('')
    .replace(/(?:npm|ghp)_[A-Za-z0-9_-]+/gu, '[redacted]')
    .slice(0, limit);
}

function boolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function oneOf<const T extends string>(value: unknown, values: readonly T[], fallback: T): T {
  return typeof value === 'string' && values.includes(value as T) ? (value as T) : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPresent<T>(value: T | undefined): value is T {
  return value !== undefined;
}
