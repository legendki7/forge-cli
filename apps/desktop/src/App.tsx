import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { BUILTIN_TEMPLATES, type TemplateId } from '@forgecli7/templates/catalog';
import { CreateWizard } from './CreateWizard';
import {
  ActivityPage,
  DeveloperToolsPage,
  HomePage,
  ScanProjectPage,
  SettingsPage,
  TemplatesPage,
} from './pages';
import { MarketplacePage } from './Marketplace';
import { SecurityPage } from './SecurityPage';
import { AboutPage } from './AboutPage';
import type { PluginCatalogEntry } from '@forgecli7/plugins';
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

const StackBuilderPage = lazy(() =>
  import('./StackBuilder').then((module) => ({ default: module.StackBuilderPage })),
);
const WorkspaceBuilderPage = lazy(() =>
  import('./WorkspaceBuilder').then((module) => ({ default: module.WorkspaceBuilderPage })),
);
const EnvironmentsPage = lazy(() =>
  import('./DeploymentPages').then((module) => ({ default: module.EnvironmentsPage })),
);
const DeploymentPage = lazy(() =>
  import('./DeploymentPages').then((module) => ({ default: module.DeploymentPage })),
);

const navigation: readonly { id: NavigationPage; label: string; icon: string }[] = [
  { id: 'home', label: 'Home', icon: 'H' },
  { id: 'create', label: 'Create Project', icon: '+' },
  { id: 'templates', label: 'Templates', icon: 'T' },
  { id: 'stack-builder', label: 'Stack Builder', icon: 'B' },
  { id: 'workspace-builder', label: 'Workspace Builder', icon: 'W' },
  { id: 'environments', label: 'Environments', icon: 'E' },
  { id: 'deployment', label: 'Deployment', icon: 'R' },
  { id: 'scan', label: 'Scan Project', icon: 'S' },
  { id: 'plugins', label: 'Marketplace', icon: 'P' },
  { id: 'security', label: 'Security', icon: 'X' },
  { id: 'tools', label: 'Developer Tools', icon: 'D' },
  { id: 'activity', label: 'Activity', icon: 'A' },
  { id: 'about', label: 'About', icon: 'I' },
  { id: 'settings', label: 'Settings', icon: 'G' },
];

export function App({ bridge }: { bridge: DesktopBridge }) {
  const [page, setPage] = useState<NavigationPage>('home');
  const [state, setState] = useState<PersistedDesktopState>(createDefaultDesktopState);
  const [loaded, setLoaded] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateId>('nextjs-blank');
  const [selectedProject, setSelectedProject] = useState<string>();
  const [pluginCatalog, setPluginCatalog] = useState<PluginCatalogEntry[]>([]);
  const automaticMarketplaceCheckStarted = useRef(false);
  const automaticUpdateCheckStarted = useRef(false);

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
    void bridge
      .listMarketplacePlugins()
      .then(setPluginCatalog)
      .catch(() => setPluginCatalog([]));
  }, [bridge]);

  useEffect(() => {
    document.documentElement.dataset.theme = state.preferences.theme;
    if (loaded) void bridge.saveDesktopState(state).catch(() => undefined);
  }, [bridge, loaded, state]);

  useEffect(() => {
    if (
      !loaded ||
      automaticMarketplaceCheckStarted.current ||
      !state.preferences.remoteMarketplaceEnabled ||
      !state.preferences.automaticallyCheckMarketplace ||
      !bridge.marketplaceStatus ||
      !bridge.refreshMarketplace
    )
      return;
    automaticMarketplaceCheckStarted.current = true;
    void bridge
      .marketplaceStatus()
      .then(async (status) => {
        const lastRefresh = status.lastSuccessfulRefresh
          ? Date.parse(status.lastSuccessfulRefresh)
          : Number.NaN;
        const due = !Number.isFinite(lastRefresh) || Date.now() - lastRefresh >= 86_400_000;
        if (!status.configured || !due) return;
        await bridge.refreshMarketplace?.();
        setPluginCatalog(await bridge.listMarketplacePlugins());
      })
      .catch(() => undefined);
  }, [bridge, loaded, state.preferences]);

  useEffect(() => {
    if (
      !loaded ||
      automaticUpdateCheckStarted.current ||
      !state.preferences.automaticallyCheckUpdates ||
      !bridge.checkApplicationUpdate
    )
      return;
    const lastCheck = state.activity.find(({ type }) => type === 'update-checked')?.timestamp;
    if (lastCheck && Date.now() - Date.parse(lastCheck) < 86_400_000) return;
    automaticUpdateCheckStarted.current = true;
    void bridge
      .checkApplicationUpdate(state.preferences.updateChannel)
      .then((result) => {
        setState((current) =>
          addActivity(current, {
            id: `${Date.now()}-automatic-update-check`,
            type: 'update-checked',
            timestamp: new Date().toISOString(),
            result: result.state === 'invalid' ? 'warning' : 'success',
            message: result.message,
          }),
        );
      })
      .catch(() => undefined);
  }, [bridge, loaded, state.activity, state.preferences]);

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
    updateState((current) => {
      let next = addActivity(
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
      );
      for (const plugin of result.generationPlan?.plugins.filter(
        ({ source }) => source === 'community',
      ) ?? []) {
        next = addActivity(next, {
          id: `${Date.now()}-plugin-${plugin.id}`,
          type: 'plugin-used',
          projectName: result.projectName,
          projectPath: result.projectDirectory,
          timestamp: now,
          result: 'success',
          message: `Used restricted plugin ${plugin.id} in generation.`,
        });
      }
      return next;
    });
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
            recentWorkspaces={state.recentWorkspaces}
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
            openWorkspace={(path) => void bridge.openProjectFolder(path)}
            removeWorkspace={(path) =>
              updateState((current) => ({
                ...current,
                recentWorkspaces: current.recentWorkspaces.filter(
                  (workspace) => workspace.path !== path,
                ),
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
      case 'stack-builder':
        return (
          <Suspense fallback={<p className="loading-state">Loading Stack Builder…</p>}>
            <StackBuilderPage
              bridge={bridge}
              preferences={state.preferences}
              customPresets={state.customStackPresets}
              initialStack={state.preferences.rememberLastStack ? state.lastStack : undefined}
              onPresetsChange={(customStackPresets) =>
                updateState((current) => ({ ...current, customStackPresets }))
              }
              onStackChange={(lastStack) => {
                if (state.preferences.rememberLastStack)
                  updateState((current) => ({ ...current, lastStack }));
              }}
              onCreated={projectCreated}
              onActivity={record}
              communityPlugins={pluginCatalog.filter(
                (plugin) =>
                  plugin.installed && plugin.integrity === 'valid' && Boolean(plugin.manifest),
              )}
            />
          </Suspense>
        );
      case 'workspace-builder':
        return (
          <Suspense fallback={<p className="loading-state">Loading Workspace Builder…</p>}>
            <WorkspaceBuilderPage
              bridge={bridge}
              initialWorkspace={state.lastWorkspace}
              customPresets={state.customWorkspacePresets}
              onWorkspaceChange={(lastWorkspace) =>
                updateState((current) => ({ ...current, lastWorkspace }))
              }
              onPresetsChange={(customWorkspacePresets) =>
                updateState((current) => ({ ...current, customWorkspacePresets }))
              }
              onCreated={(path, workspace) => {
                const now = new Date().toISOString();
                updateState((current) => ({
                  ...addActivity(current, {
                    id: `${Date.now()}-workspace-created`,
                    type: 'workspace-generated',
                    projectName: workspace.name,
                    projectPath: path,
                    timestamp: now,
                    result: 'success',
                    message: 'Workspace generated successfully.',
                  }),
                  recentWorkspaces: [
                    {
                      name: workspace.name,
                      path,
                      serviceCount: workspace.services.length,
                      lastActivityAt: now,
                      activityType: 'created' as const,
                      frameworks: workspace.services
                        .filter((service) => service.type === 'web' || service.type === 'api')
                        .map((service) => service.implementation),
                      database: workspace.services.find((service) => service.type === 'database')
                        ?.implementation,
                      infrastructure: workspace.services
                        .filter((service) => service.type === 'infrastructure')
                        .map((service) => service.implementation),
                    },
                    ...current.recentWorkspaces.filter((item) => item.path !== path),
                  ].slice(0, 25),
                }));
              }}
              onScanned={(path, workspace) => {
                const now = new Date().toISOString();
                updateState((current) => ({
                  ...addActivity(current, {
                    id: `${Date.now()}-workspace-scanned`,
                    type: 'workspace-scanned',
                    projectName: workspace.name,
                    projectPath: path,
                    timestamp: now,
                    result: 'success',
                    message: 'Workspace imported read-only.',
                  }),
                  recentWorkspaces: [
                    {
                      name: workspace.name,
                      path,
                      serviceCount: workspace.services.length,
                      lastActivityAt: now,
                      activityType: 'scanned' as const,
                      frameworks: workspace.services
                        .filter((service) => service.type === 'web' || service.type === 'api')
                        .map((service) => service.implementation),
                      database: workspace.services.find((service) => service.type === 'database')
                        ?.implementation,
                      infrastructure: workspace.services
                        .filter((service) => service.type === 'infrastructure')
                        .map((service) => service.implementation),
                    },
                    ...current.recentWorkspaces.filter((item) => item.path !== path),
                  ].slice(0, 25),
                }));
              }}
            />
          </Suspense>
        );
      case 'scan':
        return (
          <ScanProjectPage
            bridge={bridge}
            initialPath={selectedProject}
            onScanned={projectScanned}
            onActivity={record}
          />
        );
      case 'environments':
        return (
          <Suspense fallback={<p className="loading-state">Loading Environments…</p>}>
            <EnvironmentsPage
              bridge={bridge}
              initialPath={selectedProject}
              preferences={state.preferences}
              onPath={setSelectedProject}
              onActivity={record}
            />
          </Suspense>
        );
      case 'deployment':
        return (
          <Suspense fallback={<p className="loading-state">Loading Deployment…</p>}>
            <DeploymentPage
              bridge={bridge}
              initialPath={selectedProject}
              preferences={state.preferences}
              onPath={setSelectedProject}
              onActivity={record}
            />
          </Suspense>
        );
      case 'plugins':
        return (
          <MarketplacePage
            bridge={bridge}
            preferences={state.preferences}
            projectPath={selectedProject}
            onProjectPath={setSelectedProject}
            onScan={projectScanned}
            onActivity={record}
            onCatalogChange={setPluginCatalog}
          />
        );
      case 'security':
        return (
          <SecurityPage
            bridge={bridge}
            preferences={state.preferences}
            onActivity={record}
            lastUpdateCheck={state.activity.find(({ type }) => type === 'update-checked')}
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
      case 'about':
        return <AboutPage bridge={bridge} state={state} plugins={pluginCatalog} />;
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
