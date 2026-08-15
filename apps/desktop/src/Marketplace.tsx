import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createPluginSafetyReport,
  serializePluginManifest,
  type PluginSafetyReport,
} from '@forgecli7/plugin-sdk';
import type { BuiltinPluginId, PluginCatalogEntry } from '@forgecli7/plugins';
import type { MarketplaceStatus, PluginInstallReview } from '@forgecli7/marketplace/browser';
import { PageHeading } from './pages';
import type { ActivityEntry, DesktopBridge, DesktopPreferences, DesktopProjectScan } from './types';

type Tab = 'installed' | 'built-in' | 'community' | 'developer';
type Pending =
  | { kind: 'builtin'; id: BuiltinPluginId }
  | { kind: 'install'; id?: string; path?: string }
  | { kind: 'remote-install'; id: string }
  | { kind: 'remote-update'; id: string }
  | { kind: 'remove'; id: string };

export function MarketplacePage({
  bridge,
  preferences,
  projectPath,
  onProjectPath,
  onScan,
  onActivity,
  onCatalogChange,
}: {
  bridge: DesktopBridge;
  preferences: DesktopPreferences;
  projectPath?: string;
  onProjectPath: (path: string) => void;
  onScan: (scan: DesktopProjectScan) => void;
  onActivity: (entry: Omit<ActivityEntry, 'id' | 'timestamp'>) => void;
  onCatalogChange: (plugins: PluginCatalogEntry[]) => void;
}) {
  const [plugins, setPlugins] = useState<PluginCatalogEntry[]>([]);
  const [tab, setTab] = useState<Tab>('installed');
  const [query, setQuery] = useState('');
  const [framework, setFramework] = useState('all');
  const [category, setCategory] = useState('all');
  const [status, setStatus] = useState('all');
  const [compatibility, setCompatibility] = useState('all');
  const [sort, setSort] = useState('name');
  const [selected, setSelected] = useState<PluginCatalogEntry>();
  const [safety, setSafety] = useState<PluginSafetyReport>();
  const [localPath, setLocalPath] = useState<string>();
  const [pending, setPending] = useState<Pending>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [marketplaceStatus, setMarketplaceStatus] = useState<MarketplaceStatus>();
  const [remoteReview, setRemoteReview] = useState<PluginInstallReview>();
  const reportedIntegrityFailures = useRef(new Set<string>());
  const reportedRevocations = useRef(new Set<string>());

  async function refresh() {
    const entries = await bridge.listMarketplacePlugins();
    setPlugins(entries);
    onCatalogChange(entries);
    for (const plugin of entries) {
      if (plugin.integrity !== 'corrupted' || reportedIntegrityFailures.current.has(plugin.id))
        continue;
      reportedIntegrityFailures.current.add(plugin.id);
      onActivity({
        type: 'plugin-integrity-failure',
        result: 'failed',
        message: `${plugin.id} was disabled after an integrity failure.`,
      });
    }
    for (const plugin of entries) {
      if (plugin.integrity !== 'revoked' || reportedRevocations.current.has(plugin.id)) continue;
      reportedRevocations.current.add(plugin.id);
      onActivity({
        type: 'plugin-revoked',
        result: 'failed',
        message: `${plugin.id} was disabled by verified revocation metadata.`,
      });
    }
  }

  useEffect(() => {
    void refresh().catch(() => setError('The local plugin catalog could not be loaded.'));
    void bridge
      .marketplaceStatus?.()
      .then(setMarketplaceStatus)
      .catch(() => undefined);
  }, [bridge]);

  async function refreshRemote() {
    if (!preferences.remoteMarketplaceEnabled) {
      setError('Remote Marketplace is disabled in Settings.');
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      if (!bridge.refreshMarketplace || !bridge.marketplaceStatus)
        throw new Error('Marketplace bridge is unavailable.');
      await bridge.refreshMarketplace();
      await refresh();
      setMarketplaceStatus(await bridge.marketplaceStatus());
      onActivity({
        type: 'marketplace-refreshed',
        result: 'success',
        message: 'Signed Marketplace metadata verified and cached.',
      });
    } catch {
      setError('Marketplace refresh failed safely. Existing verified cache was preserved.');
    } finally {
      setBusy(false);
    }
  }

  const visible = useMemo(
    () =>
      plugins
        .filter((plugin) => {
          if (tab === 'installed' && !plugin.installed) return false;
          if (tab === 'built-in' && !plugin.builtIn) return false;
          if (tab === 'community') {
            if (plugin.builtIn) return false;
            if (
              plugin.sourceType === 'bundled-curated' &&
              plugin.id !== 'community.editorconfig' &&
              !preferences.showExperimentalBundledPlugins
            )
              return false;
          }
          if (tab === 'developer') return false;
          const supportsFramework =
            framework === 'all' || plugin.supportedFrameworks.includes(framework);
          return (
            (framework === 'all' ||
              (compatibility === 'incompatible' ? !supportsFramework : supportsFramework)) &&
            (category === 'all' || plugin.category === category) &&
            (status === 'all' || (status === 'installed') === plugin.installed) &&
            `${plugin.name} ${plugin.id} ${plugin.description} ${plugin.category}`
              .toLowerCase()
              .includes(query.toLowerCase())
          );
        })
        .sort((left, right) => {
          if (sort === 'category')
            return (
              left.category.localeCompare(right.category) || left.name.localeCompare(right.name)
            );
          if (sort === 'recent')
            return (
              (right.installedAt ?? '').localeCompare(left.installedAt ?? '') ||
              left.name.localeCompare(right.name)
            );
          return left.name.localeCompare(right.name);
        }),
    [
      category,
      compatibility,
      framework,
      plugins,
      preferences.showExperimentalBundledPlugins,
      query,
      sort,
      status,
      tab,
    ],
  );
  const categories = useMemo(
    () => [...new Set(plugins.map((plugin) => plugin.category))].sort(),
    [plugins],
  );

  function inspect(plugin: PluginCatalogEntry) {
    setSelected(plugin);
    setSafety(plugin.manifest ? createPluginSafetyReport(plugin.manifest) : undefined);
    setLocalPath(undefined);
  }

  async function importLocal() {
    if (!preferences.allowLocalCommunityPlugins) {
      setError('Local community plugins are disabled in Settings.');
      return;
    }
    const source = await bridge.selectDestination();
    if (!source) return;
    setBusy(true);
    setError(undefined);
    try {
      const inspected = await bridge.validateCommunityPlugin(source);
      setSafety(inspected.report);
      setLocalPath(source);
      if (inspected.manifest) setSelected(entryFromManifest(inspected.manifest));
      onActivity({
        type:
          inspected.report.result === 'blocked'
            ? 'plugin-installation-blocked'
            : 'plugin-validated',
        result: inspected.report.result === 'blocked' ? 'failed' : 'success',
        message:
          inspected.report.result === 'blocked'
            ? 'Plugin validation blocked installation.'
            : 'Plugin validated safely.',
      });
    } catch {
      setError('ForgeKi could not inspect the selected plugin directory safely.');
    } finally {
      setBusy(false);
    }
  }

  async function chooseProject() {
    const path = await bridge.selectDestination();
    if (path) onProjectPath(path);
  }

  async function reviewRemote(
    plugin: PluginCatalogEntry,
    kind: 'remote-install' | 'remote-update',
  ) {
    setBusy(true);
    setError(undefined);
    try {
      if (!bridge.reviewRemotePlugin) throw new Error('Marketplace review bridge is unavailable.');
      const review = await bridge.reviewRemotePlugin(plugin.id);
      setRemoteReview(review);
      setSelected({
        ...plugin,
        manifest: review.manifest,
        permissionExpansion: review.permissionExpansion,
      });
      setSafety(review.safety);
      setPending({ kind, id: plugin.id });
    } catch {
      setError('The verified plugin package could not be reviewed safely.');
    } finally {
      setBusy(false);
    }
  }

  async function perform() {
    if (!pending) return;
    setBusy(true);
    setError(undefined);
    try {
      if (pending.kind === 'builtin') {
        if (!projectPath) throw new Error('Select a project first.');
        const result = await bridge.applyBuiltinPlugin({
          projectDirectory: projectPath,
          pluginId: pending.id,
        });
        onScan(result.scan);
        onActivity({
          type: pending.id === 'docker' ? 'docker-added' : 'github-actions-added',
          projectName: result.scan.projectName,
          projectPath,
          result: result.status === 'applied' ? 'success' : 'warning',
          message: result.message,
        });
      } else if (pending.kind === 'install') {
        const installed = pending.path
          ? await bridge.installCommunityPlugin(pending.path)
          : await bridge.installBundledPlugin(pending.id!);
        inspect(installed);
        onActivity({
          type: 'plugin-installed',
          result: 'success',
          message: `Installed ${installed.id} as restricted declarative data.`,
        });
      } else if (pending.kind === 'remote-install') {
        if (!bridge.installRemotePlugin) throw new Error('Marketplace bridge is unavailable.');
        const installed = await bridge.installRemotePlugin(pending.id, true);
        inspect(installed);
        onActivity({
          type: 'plugin-installed',
          result: 'success',
          message: `Installed verified remote plugin ${installed.id}.`,
        });
      } else if (pending.kind === 'remote-update') {
        if (!bridge.updateRemotePlugin) throw new Error('Marketplace bridge is unavailable.');
        const installed = await bridge.updateRemotePlugin(
          pending.id,
          true,
          Boolean(selected?.permissionExpansion?.length),
        );
        inspect(installed);
        onActivity({
          type: 'remote-plugin-updated',
          result: 'success',
          message: `Updated verified remote plugin ${installed.id}.`,
        });
      } else {
        await bridge.removeCommunityPlugin(pending.id);
        if (selected?.id === pending.id) setSelected(undefined);
        onActivity({
          type: 'plugin-removed',
          result: 'success',
          message: `Removed ${pending.id}; existing projects were not modified.`,
        });
      }
      await refresh();
    } catch {
      setError('The plugin operation was blocked or could not be completed safely.');
      onActivity({
        type: 'plugin-installation-blocked',
        result: 'failed',
        message: 'Plugin operation blocked by ForgeKi validation.',
      });
    } finally {
      setPending(undefined);
      setRemoteReview(undefined);
      setBusy(false);
    }
  }

  return (
    <section className="page">
      <PageHeading
        eyebrow="Restricted extension platform"
        title="Marketplace"
        description="Inspect trusted built-ins and validated declarative community plugins."
        actions={
          <div className="button-row">
            <button onClick={() => void chooseProject()}>Select project</button>
            <button className="primary" disabled={busy} onClick={() => void importLocal()}>
              Import local plugin
            </button>
            <button
              disabled={busy || !preferences.remoteMarketplaceEnabled}
              onClick={() => void refreshRemote()}
            >
              Refresh
            </button>
          </div>
        }
      />
      <p className="notice info">
        <strong>
          {marketplaceStatus?.configured
            ? 'Trusted Marketplace.'
            : 'Marketplace provider not configured.'}
        </strong>{' '}
        {marketplaceStatus?.message ?? 'Checking verified Marketplace cache.'} Community plugins
        remain declarative and cannot execute arbitrary code.
      </p>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <div className="tab-row" role="tablist" aria-label="Marketplace sections">
        {(['installed', 'built-in', 'community', 'developer'] as const).map((value) => (
          <button
            key={value}
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
          >
            {title(value)}
          </button>
        ))}
      </div>
      {tab === 'developer' ? (
        <DeveloperPanel bridge={bridge} onActivity={onActivity} />
      ) : (
        <>
          <div className="filter-bar">
            <input
              aria-label="Search plugins"
              placeholder="Search plugins"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <select
              aria-label="Plugin framework"
              value={framework}
              onChange={(event) => setFramework(event.target.value)}
            >
              <option value="all">All frameworks</option>
              <option value="nextjs">Next.js</option>
              <option value="react-vite">React + Vite</option>
              <option value="express">Express</option>
            </select>
            <select
              aria-label="Plugin category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              <option value="all">All categories</option>
              {categories.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
            <select
              aria-label="Plugin status"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="all">Any install status</option>
              <option value="installed">Installed</option>
              <option value="not-installed">Not installed</option>
            </select>
            <select
              aria-label="Plugin compatibility"
              value={compatibility}
              onChange={(event) => setCompatibility(event.target.value)}
              disabled={framework === 'all'}
            >
              <option value="all">Any compatibility</option>
              <option value="compatible">Compatible</option>
              <option value="incompatible">Incompatible</option>
            </select>
            <select
              aria-label="Sort plugins"
              value={sort}
              onChange={(event) => setSort(event.target.value)}
            >
              <option value="name">Name</option>
              <option value="recent">Recently installed</option>
              <option value="category">Category</option>
            </select>
          </div>
          <div className="marketplace-layout">
            <div className="plugin-grid">
              {visible.map((plugin) => (
                <article className="panel marketplace-card" key={plugin.id}>
                  <div className="section-title">
                    <span className="badge">
                      {plugin.builtIn
                        ? 'Built-in · Trusted · Ships with ForgeKi'
                        : plugin.sourceType === 'bundled-curated'
                          ? 'Bundled community example'
                          : plugin.sourceType === 'remote'
                            ? `${plugin.publisherStatus === 'verified' ? 'Verified Publisher' : plugin.publisherStatus === 'forgeki' ? 'ForgeKi' : plugin.publisherStatus === 'revoked' ? 'Revoked' : 'Community Publisher'} · Signature ${plugin.signatureStatus ?? 'unavailable'}`
                            : 'Community · Local'}
                    </span>
                    <span
                      className="status-badge"
                      data-result={
                        plugin.integrity === 'corrupted' || plugin.integrity === 'revoked'
                          ? 'warning'
                          : plugin.installed
                            ? 'success'
                            : 'neutral'
                      }
                    >
                      {plugin.integrity === 'corrupted' || plugin.integrity === 'revoked'
                        ? 'disabled'
                        : plugin.installed
                          ? 'installed'
                          : 'not installed'}
                    </span>
                  </div>
                  <h2>{plugin.name}</h2>
                  <p>{plugin.description}</p>
                  <small>
                    {plugin.publisher} · v{plugin.version} · {plugin.category}
                  </small>
                  <p>
                    <strong>Frameworks:</strong> {plugin.supportedFrameworks.join(', ')}
                  </p>
                  <div className="compact-actions">
                    <button onClick={() => inspect(plugin)}>View details</button>
                    {plugin.builtIn && (
                      <button
                        disabled={!projectPath}
                        onClick={() =>
                          setPending({
                            kind: 'builtin',
                            id: plugin.id === 'forgeki.docker' ? 'docker' : 'github-actions',
                          })
                        }
                      >
                        Apply built-in
                      </button>
                    )}
                    {!plugin.builtIn && !plugin.installed && (
                      <button
                        onClick={() => {
                          if (plugin.sourceType === 'remote') {
                            void reviewRemote(plugin, 'remote-install');
                          } else {
                            inspect(plugin);
                            setPending({ kind: 'install', id: plugin.id });
                          }
                        }}
                      >
                        {plugin.sourceType === 'remote'
                          ? 'Install verified plugin'
                          : 'Install locally'}
                      </button>
                    )}
                    {plugin.sourceType === 'remote' &&
                      plugin.installed &&
                      plugin.updateAvailable && (
                        <button onClick={() => void reviewRemote(plugin, 'remote-update')}>
                          Review update
                        </button>
                      )}
                    {!plugin.builtIn && plugin.installed && (
                      <button onClick={() => setPending({ kind: 'remove', id: plugin.id })}>
                        Remove
                      </button>
                    )}
                  </div>
                  {plugin.warning && <p className="notice warning">{plugin.warning}</p>}
                </article>
              ))}
              {visible.length === 0 && (
                <div className="empty-state">
                  <strong>No plugins in this section</strong>
                  <p>Adjust filters or install a validated local plugin.</p>
                </div>
              )}
            </div>
            {selected && (
              <PluginDetails
                plugin={selected}
                safety={safety}
                canInstallLocal={Boolean(localPath && safety?.result !== 'blocked')}
                installLocal={() => setPending({ kind: 'install', path: localPath })}
              />
            )}
          </div>
        </>
      )}
      {pending && (
        <div className="modal-backdrop" role="presentation">
          <section className="confirmation-dialog" role="dialog" aria-modal="true">
            <h2>
              {pending.kind === 'remove'
                ? 'Remove plugin?'
                : pending.kind === 'builtin'
                  ? 'Apply trusted built-in?'
                  : pending.kind === 'remote-update'
                    ? 'Update verified declarative plugin?'
                    : pending.kind === 'remote-install'
                      ? 'Install verified declarative plugin?'
                      : 'Install restricted plugin?'}
            </h2>
            <p>
              {pending.kind === 'remove'
                ? 'Installed declarative data will be removed. Existing projects remain unchanged.'
                : pending.kind === 'builtin'
                  ? 'Only declared built-in files will be created; existing files are preserved.'
                  : pending.kind === 'remote-install' || pending.kind === 'remote-update'
                    ? 'Publisher signature, package digest, revocation, compatibility, permissions, and declarative safety are verified before atomic installation. No plugin code runs.'
                    : 'Only validated declarative data is copied. No plugin code, shell command, or network request runs.'}
            </p>
            {pending.kind === 'remote-update' && selected?.permissionExpansion?.length ? (
              <p className="notice warning">
                <strong>This update requests additional permissions:</strong>{' '}
                {selected.permissionExpansion.map((permission) => `+ ${permission}`).join(', ')}
              </p>
            ) : null}
            {(pending.kind === 'remote-install' || pending.kind === 'remote-update') &&
              remoteReview && (
                <dl className="detail-grid">
                  <div>
                    <dt>Publisher</dt>
                    <dd>
                      {remoteReview.plugin.publisherName} · {remoteReview.plugin.publisherStatus}
                    </dd>
                  </div>
                  <div>
                    <dt>Signature / integrity</dt>
                    <dd>Verified / verified</dd>
                  </div>
                  <div>
                    <dt>Permissions</dt>
                    <dd>{remoteReview.manifest.permissions.join(', ') || 'None'}</dd>
                  </div>
                  <div>
                    <dt>Package files</dt>
                    <dd>{remoteReview.packageFiles.join(', ')}</dd>
                  </div>
                  <div>
                    <dt>Contributions</dt>
                    <dd>
                      {remoteReview.safety.generatedFiles} files ·{' '}
                      {remoteReview.safety.dependencies} dependencies ·{' '}
                      {remoteReview.safety.scripts} scripts ·{' '}
                      {remoteReview.safety.environmentVariables} environment variables ·{' '}
                      {remoteReview.safety.scannerRules} scanner rules
                    </dd>
                  </div>
                  <div>
                    <dt>Compatibility</dt>
                    <dd>{remoteReview.safety.forgekiCompatible ? 'Compatible' : 'Blocked'}</dd>
                  </div>
                </dl>
              )}
            <div className="button-row">
              <button
                onClick={() => {
                  setPending(undefined);
                  setRemoteReview(undefined);
                }}
              >
                Cancel
              </button>
              <button className="primary" disabled={busy} onClick={() => void perform()}>
                {busy ? 'Working…' : 'Confirm'}
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}

function PluginDetails({
  plugin,
  safety,
  canInstallLocal,
  installLocal,
}: {
  plugin: PluginCatalogEntry;
  safety?: PluginSafetyReport;
  canInstallLocal: boolean;
  installLocal: () => void;
}) {
  const manifest = plugin.manifest;
  return (
    <aside className="panel details-panel" aria-label="Plugin details">
      <span className="badge">
        {plugin.builtIn ? 'Trusted built-in' : 'Community · Declarative · Restricted'}
      </span>
      <h2>{plugin.name}</h2>
      <p>{plugin.description}</p>
      <dl className="detail-grid">
        <div>
          <dt>Publisher</dt>
          <dd>{plugin.publisher}</dd>
        </div>
        <div>
          <dt>Version</dt>
          <dd>{plugin.version}</dd>
        </div>
        <div>
          <dt>Signature</dt>
          <dd>{plugin.signatureStatus ?? (plugin.builtIn ? 'Ships with ForgeKi' : 'Local')}</dd>
        </div>
        <div>
          <dt>Publisher trust</dt>
          <dd>{plugin.publisherStatus ?? (plugin.builtIn ? 'ForgeKi' : 'Community')}</dd>
        </div>
        <div>
          <dt>License</dt>
          <dd>{manifest?.license ?? 'Bundled with ForgeKi'}</dd>
        </div>
        <div>
          <dt>Compatibility</dt>
          <dd>{manifest?.compatibility.forgeki ?? 'Built-in'}</dd>
        </div>
        <div>
          <dt>Repository</dt>
          <dd>{manifest?.repository ?? 'ForgeKi repository'}</dd>
        </div>
      </dl>
      <h3>Permissions</h3>
      <ul>
        {plugin.permissions.map((permission) => (
          <li key={permission}>{permission}</li>
        ))}
      </ul>
      <h3>This plugin cannot</h3>
      <ul>
        <li>Run shell commands or processes</li>
        <li>Access the network</li>
        <li>Access credentials</li>
        <li>Execute arbitrary code</li>
      </ul>
      {manifest && (
        <>
          <h3>Contributions</h3>
          <p>
            Files:{' '}
            {manifest.contributions.generatedFiles?.map(({ path }) => path).join(', ') || 'None'}
          </p>
          <p>
            Dependencies:{' '}
            {dependencyNames(manifest.contributions.dependencies).join(', ') || 'None'}
          </p>
          <p>Scripts: {Object.keys(manifest.contributions.scripts ?? {}).join(', ') || 'None'}</p>
          <p>
            Environment:{' '}
            {manifest.contributions.environmentVariables
              ?.map(({ name, secret }) => `${name}${secret ? ' (secret schema)' : ''}`)
              .join(', ') || 'None'}
          </p>
          <p>Scanner rules: {manifest.contributions.scannerRules?.length ?? 0}</p>
          <p>
            Stack components:{' '}
            {manifest.contributions.stackComponents
              ?.map(
                ({ name, requires, conflictsWith }) =>
                  `${name}${requires?.length ? ` (requires ${requires.join(', ')})` : ''}${conflictsWith?.length ? ` (conflicts with ${conflictsWith.join(', ')})` : ''}`,
              )
              .join(', ') || 'None'}
          </p>
          <details>
            <summary>Inspect manifest</summary>
            <pre>{serializePluginManifest(manifest)}</pre>
          </details>
        </>
      )}
      {safety && (
        <section className="safety-report">
          <h3>ForgeKi Plugin Safety Report</h3>
          <strong>
            {safety.result === 'safe'
              ? 'Safe to install'
              : safety.result === 'warnings'
                ? 'Install with warnings'
                : 'Blocked'}
          </strong>
          <p>
            {safety.generatedFiles} files · {safety.dependencies} dependencies · {safety.scripts}{' '}
            scripts · {safety.scannerRules} scanner rules
          </p>
          {safety.errors.map(({ message }) => (
            <p className="notice error" key={message}>
              {message}
            </p>
          ))}
        </section>
      )}
      {canInstallLocal && (
        <button className="primary" onClick={installLocal}>
          Install validated local plugin
        </button>
      )}
    </aside>
  );
}

function DeveloperPanel({
  bridge,
  onActivity,
}: {
  bridge: DesktopBridge;
  onActivity: (entry: Omit<ActivityEntry, 'id' | 'timestamp'>) => void;
}) {
  const [name, setName] = useState('my-plugin');
  const [message, setMessage] = useState('');
  async function create() {
    const parent = await bridge.selectDestination();
    if (!parent) return;
    try {
      const result = await bridge.createPluginProject(parent, name);
      setMessage(`Created ${result.directory}`);
      onActivity({
        type: 'plugin-development-created',
        result: 'success',
        message: 'Plugin development project created.',
      });
    } catch {
      setMessage('Plugin project creation failed safely.');
    }
  }
  return (
    <section className="panel developer-panel">
      <h2>Plugin Developer</h2>
      <p>
        Create, validate, preview, test, and install a declarative plugin without npm publishing.
      </p>
      <label className="field">
        <span>Plugin name</span>
        <input
          aria-label="Plugin name"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <button className="primary" onClick={() => void create()}>
        Create plugin project
      </button>
      {message && <p className="notice info">{message}</p>}
      <p>
        <code>forge plugins validate &lt;path&gt;</code>
      </p>
      <p>
        Export a validation report by redirecting that command to a text file. Install a development
        copy, then use Stack Builder review to test its exact generation plan before creating a
        temporary project.
      </p>
    </section>
  );
}

function entryFromManifest(
  manifest: NonNullable<PluginCatalogEntry['manifest']>,
): PluginCatalogEntry {
  return {
    id: manifest.id,
    name: manifest.name,
    description: manifest.description,
    publisher: typeof manifest.author === 'string' ? manifest.author : manifest.author.name,
    version: manifest.version,
    category: manifest.category ?? 'Community',
    supportedFrameworks: manifest.supportedFrameworks,
    permissions: manifest.permissions,
    sourceType: 'local',
    builtIn: false,
    trusted: false,
    declarative: true,
    installed: false,
    integrity: 'not-installed',
    manifest,
  };
}
function dependencyNames(
  value: NonNullable<PluginCatalogEntry['manifest']>['contributions']['dependencies'],
) {
  return Array.isArray(value) ? value.map(({ name }) => name) : Object.keys(value ?? {});
}
function title(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
