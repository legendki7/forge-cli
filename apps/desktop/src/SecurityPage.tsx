import { useEffect, useState } from 'react';
import {
  MARKETPLACE_TRUST_EXPLANATION,
  type ApplicationUpdateCheck,
  type MarketplaceStatus,
} from '@forgecli7/marketplace/browser';
import { PageHeading } from './pages';
import type { ActivityEntry, DesktopBridge, DesktopPreferences } from './types';

export function SecurityPage({
  bridge,
  preferences,
  onActivity,
  lastUpdateCheck,
}: {
  bridge: DesktopBridge;
  preferences: DesktopPreferences;
  onActivity: (entry: Omit<ActivityEntry, 'id' | 'timestamp'>) => void;
  lastUpdateCheck?: ActivityEntry;
}) {
  const [status, setStatus] = useState<MarketplaceStatus>();
  const [update, setUpdate] = useState<ApplicationUpdateCheck>();
  const [remoteCount, setRemoteCount] = useState(0);
  const [revokedCount, setRevokedCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  async function load() {
    if (!bridge.marketplaceStatus) return;
    const [next, plugins] = await Promise.all([
      bridge.marketplaceStatus(),
      bridge.listMarketplacePlugins(),
    ]);
    setStatus(next);
    setRemoteCount(
      plugins.filter(({ sourceType, installed }) => sourceType === 'remote' && installed).length,
    );
    setRevokedCount(plugins.filter(({ integrity }) => integrity === 'revoked').length);
  }
  useEffect(() => {
    void load().catch(() => setError('Security status is temporarily unavailable.'));
  }, [bridge]);
  async function checkUpdates() {
    setBusy(true);
    setError(undefined);
    try {
      if (!bridge.checkApplicationUpdate) throw new Error('Update bridge unavailable.');
      const result = await bridge.checkApplicationUpdate(preferences.updateChannel);
      setUpdate(result);
      onActivity({
        type: 'update-checked',
        result: result.state === 'invalid' ? 'failed' : 'success',
        message: result.message,
      });
    } catch {
      setError('Update metadata could not be checked safely.');
    } finally {
      setBusy(false);
    }
  }
  async function clearCache() {
    if (!bridge.clearMarketplaceCache) return;
    setBusy(true);
    try {
      await bridge.clearMarketplaceCache();
      await load();
    } catch {
      setError('Verified Marketplace cache could not be cleared.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="page">
      <PageHeading
        eyebrow="Trust and integrity"
        title="Security"
        description="Review Marketplace trust, revocation, and signed application update status."
        actions={
          <button className="primary" disabled={busy} onClick={() => void checkUpdates()}>
            Check for updates
          </button>
        }
      />
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <p className="notice info">
        <strong>Restricted by design.</strong> {MARKETPLACE_TRUST_EXPLANATION}
      </p>
      <div className="dashboard-columns">
        <section className="panel">
          <h2>Marketplace</h2>
          <dl className="detail-grid">
            <Item label="Provider" value={status?.configured ? 'Configured' : 'Not configured'} />
            <Item label="Connectivity" value={status?.connectivity ?? 'Checking'} />
            <Item label="Verified cache" value={status?.freshness ?? 'Checking'} />
            <Item label="Root trust" value={status?.rootTrust ?? 'Checking'} />
            <Item label="Revocations" value={status?.revocations ?? 'Checking'} />
            <Item label="Installed remote plugins" value={String(remoteCount)} />
            <Item label="Disabled / revoked" value={String(revokedCount)} />
            <Item
              label="Last successful refresh"
              value={status?.lastSuccessfulRefresh ?? 'Never'}
            />
          </dl>
          <p>{status?.message}</p>
          <button disabled={busy} onClick={() => void clearCache()}>
            Clear verified cache
          </button>
        </section>
        <section className="panel">
          <h2>Application updates</h2>
          <dl className="detail-grid">
            <Item label="Channel" value={preferences.updateChannel} />
            <Item label="Provider" value={update?.configured ? 'Configured' : 'Not configured'} />
            <Item label="Current version" value={update?.currentVersion ?? '0.1.0'} />
            <Item label="Latest" value={update?.latestVersion ?? 'Unavailable'} />
            <Item
              label="Package size"
              value={
                update?.packageSize ? `${Math.ceil(update.packageSize / 1024)} KiB` : 'Unavailable'
              }
            />
            <Item label="Signature" value={update?.signatureStatus ?? 'Not checked'} />
            <Item
              label="Last update check"
              value={update ? 'This session' : (lastUpdateCheck?.timestamp ?? 'Never')}
            />
          </dl>
          <p>
            {update?.message ??
              lastUpdateCheck?.message ??
              'Checking does not download or install an update.'}
          </p>
          {update?.releaseNotes && <p>Release notes: {update.releaseNotes}</p>}
          <p>
            Updater signing and Windows Authenticode signing are separate. Current Windows
            installers are unsigned.
          </p>
        </section>
      </div>
      <section className="panel">
        <h2>Privacy boundary</h2>
        <p>
          ForgeKi sends no project names, paths, source code, dependencies, environment values,
          secrets, identity, or telemetry to Marketplace providers.
        </p>
        <p>Remote plugins cannot execute shell commands or access ForgeKi network APIs.</p>
      </section>
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
