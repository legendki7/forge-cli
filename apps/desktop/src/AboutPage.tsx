import { useState } from 'react';
import type { PluginCatalogEntry } from '@forgecli7/plugins';
import type { ApplicationUpdateCheck } from '@forgecli7/marketplace/browser';
import { PageHeading } from './pages';
import type { DesktopBridge, PersistedDesktopState } from './types';
import { createSafeDiagnostics, diagnosticsJson, type ForgeKiDiagnostics } from './diagnostics';
import { FORGEKI_LICENSE, FORGEKI_REPOSITORY, FORGEKI_VERSION } from './version';
import { BrandMark } from './BrandMark';

export function AboutPage({
  bridge,
  state,
  plugins,
}: {
  bridge: DesktopBridge;
  state: PersistedDesktopState;
  plugins: readonly PluginCatalogEntry[];
}) {
  const [diagnostics, setDiagnostics] = useState<ForgeKiDiagnostics>();
  const [update, setUpdate] = useState<ApplicationUpdateCheck>();
  const [busy, setBusy] = useState(false);

  async function previewDiagnostics() {
    setBusy(true);
    try {
      const tools = await bridge.checkDeveloperTools().catch(() => undefined);
      setDiagnostics(
        createSafeDiagnostics({
          version: FORGEKI_VERSION,
          userAgent: navigator.userAgent,
          state,
          tools,
          plugins,
        }),
      );
    } finally {
      setBusy(false);
    }
  }

  function saveDiagnostics() {
    if (!diagnostics) return;
    const url = URL.createObjectURL(
      new Blob([diagnosticsJson(diagnostics)], { type: 'application/json' }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `forgeki-diagnostics-${FORGEKI_VERSION}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="page">
      <PageHeading
        eyebrow="Release and support"
        title="About ForgeKi"
        description="Version, trust status, updates, and privacy-safe diagnostics."
      />
      <div className="settings-stack about-stack">
        <section className="panel about-identity">
          <BrandMark size="about" />
          <div>
            <h2>ForgeKi Desktop</h2>
            <dl className="detail-grid">
              <Item label="Version" value={FORGEKI_VERSION} />
              <Item
                label="Channel"
                value={state.preferences.updateChannel === 'beta' ? 'Beta' : 'Stable'}
              />
              <Item label="License" value={FORGEKI_LICENSE} />
              <Item label="Repository" value={FORGEKI_REPOSITORY} />
            </dl>
            <p>ForgeKi is currently in Beta. APIs and plugin schemas may evolve.</p>
          </div>
        </section>
        <section className="panel">
          <h2>Trust status</h2>
          <p>Marketplace: Production provider unconfigured; signed metadata is always required.</p>
          <p>
            Application updates: Production provider unconfigured; signed artifacts are required.
          </p>
          <p>
            Windows Authenticode and Tauri updater signing use separate owner-managed credentials.
          </p>
          <button
            disabled={busy || !bridge.checkApplicationUpdate}
            onClick={() => {
              setBusy(true);
              void bridge
                .checkApplicationUpdate?.(state.preferences.updateChannel)
                .then(setUpdate)
                .finally(() => setBusy(false));
            }}
          >
            Check for updates
          </button>
          {update && <p role="status">{update.message}</p>}
        </section>
        <section className="panel">
          <h2>Export Diagnostics</h2>
          <p>
            Preview an allowlisted report before saving. Project names, project paths, home paths,
            usernames, environment values, and credentials are excluded.
          </p>
          <div className="button-row">
            <button disabled={busy} onClick={() => void previewDiagnostics()}>
              Preview diagnostics
            </button>
            <button disabled={!diagnostics} onClick={saveDiagnostics}>
              Save JSON
            </button>
          </div>
          {diagnostics && (
            <pre aria-label="Diagnostics preview" className="diagnostics-preview">
              {diagnosticsJson(diagnostics)}
            </pre>
          )}
        </section>
      </div>
    </section>
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
