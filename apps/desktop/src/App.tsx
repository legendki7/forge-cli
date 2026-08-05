import { useEffect, useMemo, useState } from 'react';
import { BUILTIN_TEMPLATES, type TemplateId } from '@forgecli7/templates/catalog';
import { CreateWizard } from './CreateWizard';
import {
  ActivityPage,
  DeveloperToolsPage,
  HomePage,
  PluginsPage,
  ScanProjectPage,
  SettingsPage,
  TemplatesPage,
} from './pages';
import {
  addActivity,
  addRecentProject,
  createDefaultDesktopState,
  migrateDesktopState,
} from './persistence';
import type {
  ActivityEntry,
  DesktopBridge,
  DesktopCreateResult,
  DesktopProjectScan,
  NavigationPage,
  PersistedDesktopState,
} from './types';

const navigation: readonly { id: NavigationPage; label: string; icon: string }[] = [
  { id: 'home', label: 'Home', icon: 'H' },
  { id: 'create', label: 'Create Project', icon: '+' },
  { id: 'templates', label: 'Templates', icon: 'T' },
  { id: 'scan', label: 'Scan Project', icon: 'S' },
  { id: 'plugins', label: 'Plugins', icon: 'P' },
  { id: 'tools', label: 'Developer Tools', icon: 'D' },
  { id: 'activity', label: 'Activity', icon: 'A' },
  { id: 'settings', label: 'Settings', icon: 'G' },
];

export function App({ bridge }: { bridge: DesktopBridge }) {
  const [page, setPage] = useState<NavigationPage>('home');
  const [state, setState] = useState<PersistedDesktopState>(createDefaultDesktopState);
  const [loaded, setLoaded] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateId>('nextjs-blank');
  const [selectedProject, setSelectedProject] = useState<string>();

  useEffect(() => {
    let active = true;
    void bridge
      .loadDesktopState()
      .then((value) => {
        if (active) setState(migrateDesktopState(value));
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [bridge]);

  useEffect(() => {
    document.documentElement.dataset.theme = state.preferences.theme;
    if (loaded) void bridge.saveDesktopState(state).catch(() => undefined);
  }, [bridge, loaded, state]);

  const recentActivity = useMemo(() => state.activity.slice(0, 5), [state.activity]);

  function navigate(destination: NavigationPage) {
    setPage(destination);
  }

  function updateState(update: (current: PersistedDesktopState) => PersistedDesktopState) {
    setState((current) => update(current));
  }

  function record(entry: Omit<ActivityEntry, 'id' | 'timestamp'>) {
    updateState((current) =>
      addActivity(current, {
        ...entry,
        id: `${Date.now()}-${current.activity.length}`,
        timestamp: new Date().toISOString(),
      }),
    );
  }

  function projectCreated(result: DesktopCreateResult) {
    const now = new Date().toISOString();
    updateState((current) =>
      addActivity(
        addRecentProject(current, {
          name: result.projectName,
          path: result.projectDirectory,
          framework: result.framework,
          packageManager: result.packageManager,
          lastActivityAt: now,
          activityType: 'created',
        }),
        {
          id: `${Date.now()}-created`,
          type: 'project-created',
          projectName: result.projectName,
          projectPath: result.projectDirectory,
          timestamp: now,
          result: result.warnings.length ? 'warning' : 'success',
          message: result.warnings.length
            ? 'Project created with warnings.'
            : 'Project created successfully.',
        },
      ),
    );
    setSelectedProject(result.projectDirectory);
  }

  function projectScanned(scan: DesktopProjectScan) {
    setSelectedProject(scan.directory);
    const now = new Date().toISOString();
    updateState((current) =>
      addActivity(
        addRecentProject(current, {
          name: scan.projectName,
          path: scan.directory,
          framework: scan.framework,
          packageManager: scan.packageManager,
          lastActivityAt: now,
          activityType: 'scanned',
        }),
        {
          id: `${Date.now()}-scanned`,
          type: 'project-scanned',
          projectName: scan.projectName,
          projectPath: scan.directory,
          timestamp: now,
          result: scan.warnings.length ? 'warning' : 'success',
          message: 'Project scan completed.',
        },
      ),
    );
  }

  function openTemplate(id: TemplateId) {
    setSelectedTemplate(id);
    setPage('create');
  }

  const content = (() => {
    switch (page) {
      case 'home':
        return (
          <HomePage
            recentProjects={state.recentProjects}
            activity={recentActivity}
            navigate={navigate}
            openProject={(path) => {
              void bridge.openProjectFolder(path);
              record({
                type: 'folder-opened',
                projectPath: path,
                result: 'success',
                message: 'Project folder opened.',
              });
            }}
            scanProject={(path) => {
              setSelectedProject(path);
              setPage('scan');
            }}
            removeProject={(path) =>
              updateState((current) => ({
                ...current,
                recentProjects: current.recentProjects.filter((project) => project.path !== path),
              }))
            }
          />
        );
      case 'create':
        return (
          <CreateWizard
            bridge={bridge}
            preferences={state.preferences}
            initialTemplateId={selectedTemplate}
            onCreated={projectCreated}
            onHome={() => setPage('home')}
          />
        );
      case 'templates':
        return <TemplatesPage templates={BUILTIN_TEMPLATES} onCreate={openTemplate} />;
      case 'scan':
        return (
          <ScanProjectPage
            bridge={bridge}
            initialPath={selectedProject}
            onScanned={projectScanned}
            onActivity={record}
          />
        );
      case 'plugins':
        return (
          <PluginsPage
            bridge={bridge}
            projectPath={selectedProject}
            onProjectPath={setSelectedProject}
            onScan={projectScanned}
            onActivity={record}
          />
        );
      case 'tools':
        return <DeveloperToolsPage bridge={bridge} />;
      case 'activity':
        return (
          <ActivityPage
            entries={state.activity}
            onClear={() => updateState((current) => ({ ...current, activity: [] }))}
            onOpen={(path) => void bridge.openProjectFolder(path)}
          />
        );
      case 'settings':
        return (
          <SettingsPage
            preferences={state.preferences}
            onChange={(preferences) => updateState((current) => ({ ...current, preferences }))}
            onReset={() => updateState(() => createDefaultDesktopState())}
            onClearRecent={() => updateState((current) => ({ ...current, recentProjects: [] }))}
            onClearActivity={() => updateState((current) => ({ ...current, activity: [] }))}
            chooseDirectory={bridge.selectDestination}
          />
        );
    }
  })();

  return (
    <div className="desktop-shell">
      <aside className="sidebar" data-collapsed={state.preferences.sidebarCollapsed}>
        <div className="sidebar-brand">
          <span>FK</span>
          <strong>ForgeKi</strong>
        </div>
        <nav aria-label="Main navigation">
          {navigation.map((item) => (
            <button
              key={item.id}
              className={page === item.id ? 'selected' : ''}
              aria-current={page === item.id ? 'page' : undefined}
              aria-label={item.label}
              title={state.preferences.sidebarCollapsed ? item.label : undefined}
              onClick={() => navigate(item.id)}
            >
              <span aria-hidden="true">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </button>
          ))}
        </nav>
        <button
          className="collapse-button"
          aria-label={state.preferences.sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          onClick={() =>
            updateState((current) => ({
              ...current,
              preferences: {
                ...current.preferences,
                sidebarCollapsed: !current.preferences.sidebarCollapsed,
              },
            }))
          }
        >
          <span aria-hidden="true">{state.preferences.sidebarCollapsed ? '›' : '‹'}</span>
          <span className="nav-label">Collapse</span>
        </button>
      </aside>
      <main className="workspace" data-page={page}>
        {content}
      </main>
    </div>
  );
}
