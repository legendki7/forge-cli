import type {
  ActivityEntry,
  DesktopPreferences,
  PersistedDesktopState,
  RecentProject,
  CustomStackPreset,
} from './types';
import {
  isStackComponentId,
  isStackFramework,
  validateStack,
  type StackDefinition,
} from '@forgecli7/core/stacks';

export const MAX_RECENT_PROJECTS = 25;
export const MAX_ACTIVITY_ENTRIES = 200;
export const MAX_CUSTOM_STACK_PRESETS = 50;

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
  defaultFramework: 'nextjs',
  defaultStyling: 'plain-css',
  defaultTesting: 'vitest',
  rememberLastStack: true,
  confirmRequiredComponents: true,
  allowLocalCommunityPlugins: true,
  showExperimentalBundledPlugins: false,
};

export function createDefaultDesktopState(): PersistedDesktopState {
  return {
    schemaVersion: 2,
    preferences: { ...defaultPreferences },
    recentProjects: [],
    activity: [],
    customStackPresets: [],
  };
}

export function migrateDesktopState(value: unknown): PersistedDesktopState {
  if (!isRecord(value)) return createDefaultDesktopState();
  const preferences = isRecord(value.preferences) ? value.preferences : {};
  const recent = Array.isArray(value.recentProjects) ? value.recentProjects : [];
  const activity = Array.isArray(value.activity) ? value.activity : [];
  const presets = Array.isArray(value.customStackPresets) ? value.customStackPresets : [];
  const lastStack = readStackDefinition(value.lastStack);
  return {
    schemaVersion: 2,
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
      defaultFramework: oneOf(
        preferences.defaultFramework,
        ['nextjs', 'react-vite', 'express'],
        'nextjs',
      ),
      defaultStyling: oneOf(preferences.defaultStyling, ['plain-css', 'tailwind'], 'plain-css'),
      defaultTesting: oneOf(preferences.defaultTesting, ['none', 'vitest', 'playwright'], 'vitest'),
      rememberLastStack: boolean(preferences.rememberLastStack, true),
      confirmRequiredComponents: boolean(preferences.confirmRequiredComponents, true),
      allowLocalCommunityPlugins: boolean(preferences.allowLocalCommunityPlugins, true),
      showExperimentalBundledPlugins: boolean(preferences.showExperimentalBundledPlugins, false),
    },
    recentProjects: recent.map(readRecentProject).filter(isPresent).slice(0, MAX_RECENT_PROJECTS),
    activity: activity.map(readActivity).filter(isPresent).slice(0, MAX_ACTIVITY_ENTRIES),
    customStackPresets: presets
      .map(readCustomStackPreset)
      .filter(isPresent)
      .slice(0, MAX_CUSTOM_STACK_PRESETS),
    ...(lastStack ? { lastStack } : {}),
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
        'stack-configured',
        'preset-loaded',
        'preset-saved',
        'stack-generated',
        'stack-validation-failed',
        'plugin-validated',
        'plugin-installed',
        'plugin-installation-blocked',
        'plugin-removed',
        'plugin-integrity-failure',
        'plugin-used',
        'plugin-development-created',
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

function readCustomStackPreset(value: unknown): CustomStackPreset | undefined {
  if (!isRecord(value)) return undefined;
  const definition = readStackDefinition(value.definition);
  const id = safeText(value.id, 100);
  const name = safeText(value.name, 120);
  if (!definition || !id || !name) return undefined;
  return {
    schemaVersion: 1,
    id,
    name,
    description: safeText(value.description, 300),
    definition,
    createdAt: safeText(value.createdAt, 60),
    updatedAt: safeText(value.updatedAt, 60),
  };
}

function readStackDefinition(value: unknown): StackDefinition | undefined {
  if (!isRecord(value) || !isStackFramework(value.framework) || !Array.isArray(value.components))
    return undefined;
  const components = value.components.filter(isStackComponentId).slice(0, 30);
  if (components.length !== value.components.length) return undefined;
  const definition: StackDefinition = {
    framework: value.framework,
    components,
    packageManager: oneOf(value.packageManager, ['pnpm', 'npm', 'yarn', 'bun'], 'pnpm'),
    initializeGit: boolean(value.initializeGit, false),
    addDocker: boolean(value.addDocker, false),
    addGitHubActions: boolean(value.addGitHubActions, false),
    ...(safeText(value.templateId, 100) ? { templateId: safeText(value.templateId, 100) } : {}),
    ...(Array.isArray(value.pluginComponents)
      ? {
          pluginComponents: value.pluginComponents
            .map((entry) => safeText(entry, 128))
            .filter((entry) => /^[a-z0-9][a-z0-9._-]*$/u.test(entry) && !entry.includes('..'))
            .slice(0, 30),
        }
      : {}),
  };
  return validateStack(definition).valid ? definition : undefined;
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
