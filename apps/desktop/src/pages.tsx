import { useEffect, useMemo, useState } from 'react';
import type {
  ForgeKiTemplate,
  TemplateCategory,
  TemplateDifficulty,
  TemplateId,
} from '@forgecli7/templates/catalog';
import type { BuiltinPluginCatalogEntry, BuiltinPluginId } from '@forgecli7/plugins';
import type {
  ActivityEntry,
  ActivityResult,
  ActivityType,
  DesktopBridge,
  DesktopPreferences,
  DesktopProjectScan,
  DeveloperToolsReport,
  NavigationPage,
  RecentProject,
  RecentWorkspace,
} from './types';

export function PageHeading({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions}
    </header>
  );
}

export function HomePage({
  recentProjects,
  recentWorkspaces = [],
  activity,
  navigate,
  openProject,
  scanProject,
  removeProject,
  openWorkspace,
  removeWorkspace,
}: {
  recentProjects: RecentProject[];
  recentWorkspaces?: RecentWorkspace[];
  activity: ActivityEntry[];
  navigate: (page: NavigationPage) => void;
  openProject: (path: string) => void;
  scanProject: (path: string) => void;
  removeProject: (path: string) => void;
  openWorkspace?: (path: string) => void;
  removeWorkspace?: (path: string) => void;
}) {
  return (
    <section className="page">
      <PageHeading
        eyebrow="Local developer studio"
        title="ForgeKi"
        description="Build and configure development projects visually."
      />
      <div className="quick-grid">
        <Quick
          title="Build a workspace"
          text="Plan a typed multi-service monorepo."
          onClick={() => navigate('workspace-builder')}
        />
        <Quick
          title="Create a project"
          text="Start a guided local project."
          onClick={() => navigate('create')}
        />
        <Quick
          title="Create from template"
          text="Browse five built-in templates."
          onClick={() => navigate('templates')}
        />
        <Quick
          title="Scan an existing project"
          text="Inspect project configuration safely."
          onClick={() => navigate('scan')}
        />
        <Quick
          title="Check developer tools"
          text="Review your local environment."
          onClick={() => navigate('tools')}
        />
      </div>
      <section className="panel">
        <div className="section-title">
          <div>
            <h2>Recent workspaces</h2>
            <p>Created or imported on this device; never rescanned automatically.</p>
          </div>
        </div>
        {recentWorkspaces.length === 0 ? (
          <Empty title="No recent workspaces" text="Build or import a workspace to see it here." />
        ) : (
          <div className="list-stack">
            {recentWorkspaces.map((workspace) => (
              <article className="list-card" key={workspace.path}>
                <div>
                  <strong>{workspace.name}</strong>
                  <p className="truncate">{workspace.path}</p>
                  <small>
                    {workspace.serviceCount} services ·{' '}
                    {workspace.frameworks.join(', ') || 'no app framework'}
                    {workspace.database ? ` · ${workspace.database}` : ''}
                    {workspace.infrastructure.length
                      ? ` · ${workspace.infrastructure.join(', ')}`
                      : ''}
                  </small>
                </div>
                <div className="compact-actions">
                  <button onClick={() => openWorkspace?.(workspace.path)}>Open</button>
                  <button
                    aria-label={`Remove ${workspace.name} from recent workspaces`}
                    onClick={() => removeWorkspace?.(workspace.path)}
                  >
                    Remove
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      <div className="dashboard-columns">
        <section className="panel">
          <div className="section-title">
            <div>
              <h2>Recent projects</h2>
              <p>Created or scanned on this device.</p>
            </div>
          </div>
          {recentProjects.length === 0 ? (
            <Empty title="No recent projects" text="Create or scan a project to see it here." />
          ) : (
            <div className="list-stack">
              {recentProjects.map((project) => (
                <article className="list-card" key={project.path}>
                  <div>
                    <strong>{project.name}</strong>
                    <p className="truncate">{project.path}</p>
                    <small>
                      {project.framework} · {project.packageManager} · {project.activityType}
                    </small>
                  </div>
                  <div className="compact-actions">
                    <button onClick={() => openProject(project.path)}>Open</button>
                    <button onClick={() => scanProject(project.path)}>Scan again</button>
                    <button
                      aria-label={`Remove ${project.name} from recent projects`}
                      onClick={() => removeProject(project.path)}
                    >
                      Remove
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
        <section className="panel">
          <h2>Recent activity</h2>
          {activity.length === 0 ? (
            <Empty title="No activity yet" text="ForgeKi operations will appear here." />
          ) : (
            <div className="activity-list">
              {activity.map((entry) => (
                <article key={entry.id}>
                  <span className="status-badge" data-result={entry.result}>
                    {entry.result}
                  </span>
                  <div>
                    <strong>{activityLabel(entry.type)}</strong>
                    <p>{entry.message}</p>
                    <small>{formatDate(entry.timestamp)}</small>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </section>
  );
}

function Quick({ title, text, onClick }: { title: string; text: string; onClick: () => void }) {
  return (
    <button className="quick-card" onClick={onClick}>
      <span aria-hidden="true">→</span>
      <strong>{title}</strong>
      <small>{text}</small>
    </button>
  );
}

export function TemplatesPage({
  templates,
  onCreate,
}: {
  templates: readonly ForgeKiTemplate[];
  onCreate: (id: TemplateId) => void;
}) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<TemplateCategory | 'all'>('all');
  const [difficulty, setDifficulty] = useState<TemplateDifficulty | 'all'>('all');
  const [selected, setSelected] = useState<TemplateId>('nextjs-blank');
  const filtered = useMemo(
    () =>
      templates.filter(
        (template) =>
          (category === 'all' || template.category === category) &&
          (difficulty === 'all' || template.difficulty === difficulty) &&
          `${template.name} ${template.description} ${template.features.join(' ')}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
    [category, difficulty, query, templates],
  );
  const details = templates.find(({ id }) => id === selected) ?? templates[0]!;
  return (
    <section className="page">
      <PageHeading
        eyebrow="Built-in templates"
        title="Templates"
        description="Offline, deterministic foundations maintained by ForgeKi."
      />
      <div className="filter-bar">
        <input
          aria-label="Search templates"
          placeholder="Search templates"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select
          aria-label="Template category"
          value={category}
          onChange={(event) => setCategory(event.target.value as TemplateCategory | 'all')}
        >
          <option value="all">All categories</option>
          {['starter', 'dashboard', 'content', 'portfolio', 'marketing'].map((value) => (
            <option key={value} value={value}>
              {titleCase(value)}
            </option>
          ))}
        </select>
        <select
          aria-label="Template difficulty"
          value={difficulty}
          onChange={(event) => setDifficulty(event.target.value as TemplateDifficulty | 'all')}
        >
          <option value="all">All difficulties</option>
          <option value="beginner">Beginner</option>
          <option value="intermediate">Intermediate</option>
        </select>
      </div>
      <div className="catalog-layout">
        <div className="template-grid">
          {filtered.map((template) => (
            <button
              key={template.id}
              className="template-card"
              data-selected={selected === template.id}
              onClick={() => setSelected(template.id)}
            >
              <span className="badge">{titleCase(template.category)}</span>
              <h2>{template.name}</h2>
              <p>{template.description}</p>
              <small>Next.js · {template.difficulty}</small>
            </button>
          ))}
          {filtered.length === 0 && (
            <Empty title="No matching templates" text="Adjust the local search or filters." />
          )}
        </div>
        <aside className="panel details-panel">
          <span className="badge">Built-in</span>
          <h2>{details.name}</h2>
          <p>{details.description}</p>
          <h3>Included features</h3>
          <ul>
            {details.features.map((feature) => (
              <li key={feature}>{feature}</li>
            ))}
          </ul>
          <p>
            <strong>{details.estimatedFileCount}</strong> deterministic files · Next.js · TypeScript
          </p>
          <button className="primary" onClick={() => onCreate(details.id)}>
            Create Project
          </button>
        </aside>
      </div>
    </section>
  );
}

export function ScanProjectPage({
  bridge,
  initialPath,
  onScanned,
  onActivity,
}: {
  bridge: DesktopBridge;
  initialPath?: string;
  onScanned: (scan: DesktopProjectScan) => void;
  onActivity: (entry: Omit<ActivityEntry, 'id' | 'timestamp'>) => void;
}) {
  const [path, setPath] = useState(initialPath ?? '');
  const [scan, setScan] = useState<DesktopProjectScan>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [pendingPlugin, setPendingPlugin] = useState<BuiltinPluginId>();
  async function choose() {
    const selected = await bridge.selectDestination();
    if (selected) {
      setPath(selected);
      setScan(undefined);
    }
  }
  async function runScan() {
    if (!path || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const result = await bridge.scanProject(path);
      setScan(result);
      onScanned(result);
    } catch {
      setError('ForgeKi could not scan the selected project. Select the folder again and retry.');
    } finally {
      setBusy(false);
    }
  }
  async function applyPlugin() {
    if (!pendingPlugin || !scan) return;
    setBusy(true);
    try {
      const result = await bridge.applyBuiltinPlugin({
        projectDirectory: scan.directory,
        pluginId: pendingPlugin,
      });
      setScan(result.scan);
      onScanned(result.scan);
      onActivity({
        type: pendingPlugin === 'docker' ? 'docker-added' : 'github-actions-added',
        projectName: scan.projectName,
        projectPath: scan.directory,
        result: result.status === 'applied' ? 'success' : 'warning',
        message: result.message,
      });
    } catch {
      setError('The built-in plugin could not be applied. Existing files were preserved.');
    } finally {
      setPendingPlugin(undefined);
      setBusy(false);
    }
  }
  return (
    <section className="page">
      <PageHeading
        eyebrow="Project inspection"
        title="Scan Project"
        description="Select an existing project to inspect local metadata and configuration."
        actions={
          <button className="primary" onClick={() => void choose()}>
            Select project
          </button>
        }
      />
      <div className="panel picker-panel">
        <output aria-label="Selected scan directory">{path || 'No project selected'}</output>
        <button disabled={!path || busy} onClick={() => void runScan()}>
          {busy ? 'Working…' : scan ? 'Rescan' : 'Scan project'}
        </button>
      </div>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {scan && <ScanDetails scan={scan} onApply={setPendingPlugin} />}
      {pendingPlugin && scan && (
        <Confirmation
          title={`Add ${pluginName(pendingPlugin)}?`}
          text={`ForgeKi will create only ${scan.plugins.find(({ id }) => id === pendingPlugin)?.files.join(', ')}. Existing files will not be overwritten.`}
          onCancel={() => setPendingPlugin(undefined)}
          onConfirm={() => void applyPlugin()}
        />
      )}
    </section>
  );
}

function ScanDetails({
  scan,
  onApply,
}: {
  scan: DesktopProjectScan;
  onApply: (id: BuiltinPluginId) => void;
}) {
  return (
    <div className="scan-layout">
      <section className="panel">
        <div className="section-title">
          <div>
            <h2>{scan.projectName}</h2>
            <p className="truncate">{scan.directory}</p>
          </div>
          <span className="badge">{scan.framework}</span>
        </div>
        <dl className="detail-grid">
          <Item label="Language" value={scan.language} />
          <Item label="Package manager" value={scan.packageManager} />
          <Item label="Scripts" value={Object.keys(scan.scripts).join(', ') || 'None detected'} />
          <Item label="Detected files" value={`${scan.detectedFiles.length}`} />
          <Item label="Docker" value={pluginStatus(scan, 'docker')} />
          <Item label="GitHub Actions" value={pluginStatus(scan, 'github-actions')} />
        </dl>
        <section className="detected-stack" aria-label="Detected stack graph">
          <h3>Detected stack</h3>
          {(scan.stackComponents ?? []).length ? (
            <div className="architecture-branches">
              {(scan.stackComponents ?? []).map((component) => (
                <div key={component.id} className="detected-node">
                  <strong>{component.id}</strong>
                  <span
                    className="status-badge"
                    data-result={component.state === 'conflicting' ? 'warning' : 'success'}
                  >
                    {component.state.replace('-', ' ')}
                  </span>
                  <small>{component.evidence.join(', ')}</small>
                </div>
              ))}
            </div>
          ) : (
            <p>No supported stack components were detected with enough evidence.</p>
          )}
        </section>
        <details>
          <summary>Detailed project metadata</summary>
          <h3>Scripts</h3>
          <CodeRecord value={scan.scripts} />
          <h3>Dependencies summary</h3>
          <p>
            {Object.keys(scan.dependencies).length} dependencies ·{' '}
            {Object.keys(scan.devDependencies).length} development dependencies
          </p>
          <h3>Detected files</h3>
          <ul className="file-list">
            {scan.detectedFiles.map((file) => (
              <li key={file}>
                <code>{file}</code>
              </li>
            ))}
          </ul>
        </details>
      </section>
      <section className="panel">
        <h2>Recommendations</h2>
        {scan.recommendations.length === 0 ? (
          <Empty title="No recommendations" text="Recognized configuration is present." />
        ) : (
          <div className="recommendation-list">
            {scan.recommendations.map((recommendation) => (
              <article key={recommendation.id}>
                <span
                  className="status-badge"
                  data-result={recommendation.severity === 'warning' ? 'warning' : 'success'}
                >
                  {recommendation.severity}
                </span>
                <p>{recommendation.message}</p>
                {recommendation.pluginId && (
                  <button onClick={() => onApply(recommendation.pluginId!)}>
                    Add {pluginName(recommendation.pluginId)}
                  </button>
                )}
              </article>
            ))}
          </div>
        )}
        {scan.warnings.length > 0 && (
          <div className="notice warning">
            <strong>Scan warnings</strong>
            <ul>
              {scan.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}

export function PluginsPage({
  bridge,
  projectPath,
  onProjectPath,
  onScan,
  onActivity,
}: {
  bridge: DesktopBridge;
  projectPath?: string;
  onProjectPath: (path: string) => void;
  onScan: (scan: DesktopProjectScan) => void;
  onActivity: (entry: Omit<ActivityEntry, 'id' | 'timestamp'>) => void;
}) {
  const [plugins, setPlugins] = useState<BuiltinPluginCatalogEntry[]>([]);
  const [pending, setPending] = useState<BuiltinPluginId>();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void bridge
      .inspectBuiltinPlugins(projectPath)
      .then(setPlugins)
      .catch(() => setPlugins([]));
  }, [bridge, projectPath]);
  async function select() {
    const selected = await bridge.selectDestination();
    if (!selected) return;
    onProjectPath(selected);
    setPlugins(await bridge.inspectBuiltinPlugins(selected));
  }
  async function apply() {
    if (!pending || !projectPath) return;
    setBusy(true);
    try {
      const response = await bridge.applyBuiltinPlugin({
        projectDirectory: projectPath,
        pluginId: pending,
      });
      setPlugins(response.scan.plugins);
      onScan(response.scan);
      onActivity({
        type: pending === 'docker' ? 'docker-added' : 'github-actions-added',
        projectName: response.scan.projectName,
        projectPath,
        result: response.status === 'applied' ? 'success' : 'warning',
        message: response.message,
      });
    } finally {
      setPending(undefined);
      setBusy(false);
    }
  }
  return (
    <section className="page">
      <PageHeading
        eyebrow="Trusted extensions"
        title="Plugins"
        description="Inspect and apply only the built-in plugins bundled with ForgeKi."
        actions={
          <button className="primary" onClick={() => void select()}>
            Select project
          </button>
        }
      />
      <p className="notice info">Community plugins are planned for a future release.</p>
      <p className="selected-path">{projectPath ?? 'No project selected'}</p>
      <div className="plugin-grid">
        {plugins.map((plugin) => (
          <article className="panel" key={plugin.id}>
            <div className="section-title">
              <span className="badge">Built-in · v{plugin.version}</span>
              <span
                className="status-badge"
                data-result={
                  plugin.status === 'installed'
                    ? 'success'
                    : plugin.status === 'partial'
                      ? 'warning'
                      : 'neutral'
                }
              >
                {plugin.status}
              </span>
            </div>
            <h2>{plugin.name}</h2>
            <p>{plugin.description}</p>
            <p>
              <strong>Frameworks:</strong> {plugin.supportedFrameworks.join(', ')}
            </p>
            <p>
              <strong>Files:</strong> {plugin.files.join(', ')}
            </p>
            <p>{plugin.message}</p>
            <button
              disabled={
                !projectPath || plugin.status === 'installed' || plugin.status === 'unsupported'
              }
              onClick={() => setPending(plugin.id)}
            >
              Apply built-in plugin
            </button>
          </article>
        ))}
      </div>
      {pending && (
        <Confirmation
          title={`Apply ${pluginName(pending)}?`}
          text={`ForgeKi will create only the declared built-in files and preserve anything already present.`}
          onCancel={() => setPending(undefined)}
          onConfirm={() => void apply()}
          busy={busy}
        />
      )}
    </section>
  );
}

export function DeveloperToolsPage({ bridge }: { bridge: DesktopBridge }) {
  const [report, setReport] = useState<DeveloperToolsReport>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  async function refresh() {
    setBusy(true);
    setError(false);
    try {
      setReport(await bridge.checkDeveloperTools());
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="page">
      <PageHeading
        eyebrow="Local environment"
        title="Developer Tools"
        description="Fixed allowlisted checks run only when you request them."
        actions={
          <button className="primary" disabled={busy} onClick={() => void refresh()}>
            {busy ? 'Checking…' : report ? 'Refresh' : 'Check tools'}
          </button>
        }
      />
      {error && (
        <p className="notice error">
          The environment check failed safely. No tool was reported as missing.
        </p>
      )}
      {!report ? (
        <Empty
          title="Tools have not been checked"
          text="ForgeKi does not run developer-tool checks at startup."
        />
      ) : (
        <>
          <div className="summary-strip">
            {report.summary.map((message) => (
              <p key={message}>{message}</p>
            ))}
          </div>
          <div className="tool-grid">
            {report.tools.map((tool) => (
              <article className="panel" key={tool.id}>
                <div className="section-title">
                  <h2>{tool.name}</h2>
                  <span
                    className="status-badge"
                    data-result={
                      tool.status === 'installed'
                        ? 'success'
                        : tool.status === 'check-failed'
                          ? 'warning'
                          : 'neutral'
                    }
                  >
                    {tool.status.replace('-', ' ')}
                  </span>
                </div>
                <p>{tool.purpose}</p>
                <p>
                  {tool.required
                    ? 'Required by generated projects'
                    : 'Optional for ForgeKi workflows'}
                </p>
                <code>{tool.version ?? 'Version unavailable'}</code>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

export function ActivityPage({
  entries,
  onClear,
  onOpen,
}: {
  entries: ActivityEntry[];
  onClear: () => void;
  onOpen: (path: string) => void;
}) {
  const [type, setType] = useState<ActivityType | 'all'>('all');
  const [result, setResult] = useState<ActivityResult | 'all'>('all');
  const [confirming, setConfirming] = useState(false);
  const filtered = entries.filter(
    (entry) =>
      (type === 'all' || entry.type === type) && (result === 'all' || entry.result === result),
  );
  return (
    <section className="page">
      <PageHeading
        eyebrow="Local history"
        title="Activity"
        description="The latest 200 ForgeKi operations stored only on this device."
        actions={
          <button disabled={entries.length === 0} onClick={() => setConfirming(true)}>
            Clear history
          </button>
        }
      />
      <div className="filter-bar">
        <select
          aria-label="Activity type"
          value={type}
          onChange={(event) => setType(event.target.value as ActivityType | 'all')}
        >
          <option value="all">All event types</option>
          {[...new Set(entries.map((entry) => entry.type))].map((value) => (
            <option value={value} key={value}>
              {activityLabel(value)}
            </option>
          ))}
        </select>
        <select
          aria-label="Activity result"
          value={result}
          onChange={(event) => setResult(event.target.value as ActivityResult | 'all')}
        >
          <option value="all">All results</option>
          <option value="success">Success</option>
          <option value="warning">Warning</option>
          <option value="failed">Failed</option>
        </select>
      </div>
      {filtered.length === 0 ? (
        <Empty
          title="No matching activity"
          text="Completed operations will appear here without file contents or stack traces."
        />
      ) : (
        <div className="activity-list panel">
          {filtered.map((entry) => (
            <article key={entry.id}>
              <span className="status-badge" data-result={entry.result}>
                {entry.result}
              </span>
              <div>
                <strong>{activityLabel(entry.type)}</strong>
                <p>{entry.message}</p>
                <small>
                  {entry.projectName ? `${entry.projectName} · ` : ''}
                  {formatDate(entry.timestamp)}
                </small>
              </div>
              {entry.projectPath && (
                <button onClick={() => onOpen(entry.projectPath!)}>Open folder</button>
              )}
            </article>
          ))}
        </div>
      )}
      {confirming && (
        <Confirmation
          title="Clear activity history?"
          text="This removes local ForgeKi activity metadata. Project files are not changed."
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            onClear();
            setConfirming(false);
          }}
        />
      )}
    </section>
  );
}

export function SettingsPage({
  preferences,
  onChange,
  onReset,
  onClearRecent,
  onClearActivity,
  chooseDirectory,
}: {
  preferences: DesktopPreferences;
  onChange: (value: DesktopPreferences) => void;
  onReset: () => void;
  onClearRecent: () => void;
  onClearActivity: () => void;
  chooseDirectory: () => Promise<string | null>;
}) {
  const update = <K extends keyof DesktopPreferences>(key: K, value: DesktopPreferences[K]) =>
    onChange({ ...preferences, [key]: value });
  return (
    <section className="page">
      <PageHeading
        eyebrow="Local preferences"
        title="Settings"
        description="Configure ForgeKi Desktop without accounts, cloud services, or telemetry."
      />
      <div className="settings-stack">
        <section className="panel">
          <h2>Appearance</h2>
          <label className="field">
            <span>Theme</span>
            <select
              aria-label="Theme"
              value={preferences.theme}
              onChange={(event) =>
                update('theme', event.target.value as DesktopPreferences['theme'])
              }
            >
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
          <OptionRow
            label="Collapsed sidebar"
            checked={preferences.sidebarCollapsed}
            onChange={(value) => update('sidebarCollapsed', value)}
          />
        </section>
        <section className="panel">
          <h2>Project defaults</h2>
          <label className="field">
            <span>Default package manager</span>
            <select
              aria-label="Default package manager"
              value={preferences.defaultPackageManager}
              onChange={(event) =>
                update(
                  'defaultPackageManager',
                  event.target.value as DesktopPreferences['defaultPackageManager'],
                )
              }
            >
              {['pnpm', 'npm', 'yarn', 'bun'].map((manager) => (
                <option key={manager}>{manager}</option>
              ))}
            </select>
          </label>
          <div className="picker-row">
            <output>{preferences.defaultDestination || 'No default directory'}</output>
            <button
              onClick={() =>
                void chooseDirectory().then((value) => {
                  if (value) update('defaultDestination', value);
                })
              }
            >
              Choose default directory
            </button>
          </div>
          <OptionRow
            label="Initialize Git by default"
            checked={preferences.initializeGit}
            onChange={(value) => update('initializeGit', value)}
          />
          <OptionRow
            label="Docker by default"
            checked={preferences.addDocker}
            onChange={(value) => update('addDocker', value)}
          />
          <OptionRow
            label="GitHub Actions by default"
            checked={preferences.addGitHubActions}
            onChange={(value) => update('addGitHubActions', value)}
          />
          <label className="field">
            <span>User mode</span>
            <select
              aria-label="User mode"
              value={preferences.mode}
              onChange={(event) => update('mode', event.target.value as DesktopPreferences['mode'])}
            >
              <option value="beginner">Beginner</option>
              <option value="advanced">Advanced</option>
            </select>
            <small>
              Advanced mode adds safe metadata and file previews; validation remains unchanged.
            </small>
          </label>
        </section>
        <section className="panel">
          <h2>Stack Builder defaults</h2>
          <label className="field">
            <span>Default framework</span>
            <select
              aria-label="Default framework"
              value={preferences.defaultFramework}
              onChange={(event) =>
                update(
                  'defaultFramework',
                  event.target.value as DesktopPreferences['defaultFramework'],
                )
              }
            >
              <option value="nextjs">Next.js</option>
              <option value="react-vite">React + Vite</option>
              <option value="express">Express</option>
            </select>
          </label>
          <label className="field">
            <span>Default styling</span>
            <select
              aria-label="Default styling"
              value={preferences.defaultStyling}
              onChange={(event) =>
                update('defaultStyling', event.target.value as DesktopPreferences['defaultStyling'])
              }
            >
              <option value="plain-css">Plain CSS</option>
              <option value="tailwind">Tailwind CSS</option>
            </select>
          </label>
          <label className="field">
            <span>Default testing</span>
            <select
              aria-label="Default testing"
              value={preferences.defaultTesting}
              onChange={(event) =>
                update('defaultTesting', event.target.value as DesktopPreferences['defaultTesting'])
              }
            >
              <option value="none">None</option>
              <option value="vitest">Vitest</option>
              <option value="playwright">Playwright</option>
            </select>
          </label>
          <OptionRow
            label="Remember last stack"
            checked={preferences.rememberLastStack}
            onChange={(value) => update('rememberLastStack', value)}
          />
          <OptionRow
            label="Confirm required components"
            checked={preferences.confirmRequiredComponents}
            onChange={(value) => update('confirmRequiredComponents', value)}
          />
          <small>Databases and ORMs are never selected automatically.</small>
        </section>
        <section className="panel">
          <h2>Deployment defaults</h2>
          <label className="field">
            <span>Default environment view</span>
            <select
              aria-label="Default environment view"
              value={preferences.defaultEnvironmentView}
              onChange={(event) =>
                update(
                  'defaultEnvironmentView',
                  event.target.value as DesktopPreferences['defaultEnvironmentView'],
                )
              }
            >
              <option value="local">Local</option>
              <option value="staging">Staging</option>
              <option value="production">Production</option>
            </select>
          </label>
          <label className="field">
            <span>Preferred deployment target</span>
            <select
              aria-label="Preferred deployment target"
              value={preferences.preferredDeploymentTarget}
              onChange={(event) =>
                update(
                  'preferredDeploymentTarget',
                  event.target.value as DesktopPreferences['preferredDeploymentTarget'],
                )
              }
            >
              <option value="docker-compose">Docker Compose</option>
              <option value="generic-docker">Generic Docker</option>
              <option value="kubernetes">Kubernetes</option>
              <option value="static-export">Static Export</option>
              <option value="node-server">Node Server</option>
            </select>
          </label>
          <label className="field">
            <span>Default Kubernetes replicas</span>
            <input
              aria-label="Default Kubernetes replicas"
              type="number"
              min="1"
              max="20"
              value={preferences.defaultKubernetesReplicas}
              onChange={(event) =>
                update(
                  'defaultKubernetesReplicas',
                  Math.max(1, Math.min(20, Number(event.target.value))),
                )
              }
            />
          </label>
          <OptionRow
            label="Use production Docker profile by default"
            checked={preferences.defaultDockerProductionProfile}
            onChange={(value) => update('defaultDockerProductionProfile', value)}
          />
          <OptionRow
            label="Include deployment metadata"
            checked={preferences.includeDeploymentMetadata}
            onChange={(value) => update('includeDeploymentMetadata', value)}
          />
          <OptionRow
            label="Show advanced deployment options"
            checked={preferences.showAdvancedDeploymentOptions}
            onChange={(value) => update('showAdvancedDeploymentOptions', value)}
          />
          <small>ForgeKi stores no cloud credentials or deployment secrets.</small>
        </section>
        <section className="panel">
          <h2>Plugin platform</h2>
          <OptionRow
            label="Remote Marketplace"
            checked={preferences.remoteMarketplaceEnabled}
            onChange={(value) => update('remoteMarketplaceEnabled', value)}
          />
          <OptionRow
            label="Check Marketplace automatically"
            checked={preferences.automaticallyCheckMarketplace}
            onChange={(value) => update('automaticallyCheckMarketplace', value)}
          />
          <OptionRow
            label="Allow local community plugins"
            checked={preferences.allowLocalCommunityPlugins}
            onChange={(value) => update('allowLocalCommunityPlugins', value)}
          />
          <OptionRow
            label="Show experimental bundled plugins"
            checked={preferences.showExperimentalBundledPlugins}
            onChange={(value) => update('showExperimentalBundledPlugins', value)}
          />
          <small>
            There is no unsafe mode. Validation, integrity checks, and restricted permissions cannot
            be disabled.
          </small>
        </section>
        <section className="panel">
          <h2>Secure updates</h2>
          <label className="field">
            <span>Application update channel</span>
            <select
              aria-label="Application update channel"
              value={preferences.updateChannel}
              onChange={(event) =>
                update('updateChannel', event.target.value as DesktopPreferences['updateChannel'])
              }
            >
              <option value="stable">Stable</option>
              <option value="beta">Beta</option>
            </select>
          </label>
          <OptionRow
            label="Automatically check for updates"
            checked={preferences.automaticallyCheckUpdates}
            onChange={(value) => update('automaticallyCheckUpdates', value)}
          />
          <small>
            Checks are limited to trusted configured providers. Installation is never silent.
          </small>
        </section>
        <section className="panel">
          <h2>Application</h2>
          <dl className="detail-grid">
            <Item label="Version" value="0.1.0" />
            <Item label="Identifier" value="com.legendki7.forgeki" />
            <Item label="Repository" value="github.com/legendki7/forge-cli" />
          </dl>
          <div className="button-row">
            <button onClick={onClearRecent}>Clear recent projects</button>
            <button onClick={onClearActivity}>Clear activity history</button>
            <button onClick={onReset}>Reset settings</button>
          </div>
        </section>
        <section className="panel privacy-panel">
          <h2>Privacy</h2>
          <p>ForgeKi does not use analytics or telemetry.</p>
          <p>Project files remain on your device.</p>
          <p>ForgeKi does not upload project contents.</p>
        </section>
      </div>
    </section>
  );
}

function OptionRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="option-row">
      <span>{label}</span>
      <input
        type="checkbox"
        aria-label={label}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}
function Confirmation({
  title,
  text,
  onCancel,
  onConfirm,
  busy = false,
}: {
  title: string;
  text: string;
  onCancel: () => void;
  onConfirm: () => void;
  busy?: boolean;
}) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="confirmation-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
      >
        <h2 id="confirm-title">{title}</h2>
        <p>{text}</p>
        <div className="button-row">
          <button onClick={onCancel}>Cancel</button>
          <button className="primary" disabled={busy} onClick={onConfirm}>
            {busy ? 'Working…' : 'Confirm'}
          </button>
        </div>
      </section>
    </div>
  );
}
function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty-state">
      <span aria-hidden="true">◇</span>
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}
function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
function CodeRecord({ value }: { value: Record<string, string> }) {
  return Object.keys(value).length ? (
    <ul className="file-list">
      {Object.entries(value).map(([key, command]) => (
        <li key={key}>
          <code>
            {key}: {command}
          </code>
        </li>
      ))}
    </ul>
  ) : (
    <p>None detected.</p>
  );
}
function pluginStatus(scan: DesktopProjectScan, id: BuiltinPluginId) {
  return scan.plugins.find((plugin) => plugin.id === id)?.status ?? 'unknown';
}
function pluginName(id: BuiltinPluginId) {
  return id === 'docker' ? 'Docker' : 'GitHub Actions';
}
function activityLabel(type: ActivityType) {
  return (
    {
      'project-created': 'Project created',
      'project-scanned': 'Project scanned',
      'docker-added': 'Docker added',
      'github-actions-added': 'GitHub Actions added',
      'folder-opened': 'Project folder opened',
      'creation-failed': 'Creation failed',
      'plugin-warning': 'Plugin warning',
      'stack-configured': 'Stack configured',
      'preset-loaded': 'Preset loaded',
      'preset-saved': 'Custom preset saved',
      'stack-generated': 'Project generated from stack',
      'stack-validation-failed': 'Stack validation failed',
      'plugin-validated': 'Plugin validated',
      'plugin-installed': 'Plugin installed',
      'plugin-installation-blocked': 'Plugin installation blocked',
      'plugin-removed': 'Plugin removed',
      'plugin-integrity-failure': 'Plugin disabled after integrity failure',
      'plugin-used': 'Plugin used in generation',
      'plugin-development-created': 'Plugin development project created',
      'marketplace-refreshed': 'Marketplace refreshed',
      'remote-plugin-updated': 'Remote plugin updated',
      'plugin-revoked': 'Plugin revoked',
      'update-checked': 'Application update checked',
      'workspace-configured': 'Workspace configured',
      'workspace-generated': 'Workspace generated',
      'workspace-scanned': 'Workspace scanned',
      'environment-profile-reviewed': 'Environment profile reviewed',
      'deployment-readiness-checked': 'Deployment readiness checked',
      'deployment-plan-generated': 'Deployment plan generated',
      'deployment-files-exported': 'Deployment files exported',
      'deployment-export-blocked': 'Deployment export blocked',
      'deployment-drift-detected': 'Deployment drift detected',
    } as const
  )[type];
}
function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? 'Unknown date' : date.toLocaleString();
}
function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
