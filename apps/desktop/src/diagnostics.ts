import type { ActivityEntry, DeveloperToolsReport, PersistedDesktopState } from './types';
import type { PluginCatalogEntry } from '@forgecli7/plugins';

export const DIAGNOSTICS_SCHEMA_VERSION = 1 as const;

export interface ForgeKiDiagnostics {
  schemaVersion: typeof DIAGNOSTICS_SCHEMA_VERSION;
  product: 'ForgeKi Desktop';
  version: string;
  channel: 'beta' | 'stable';
  platform: { os: 'Windows' | 'macOS' | 'Linux' | 'Unknown'; architecture: 'unknown' };
  configurationSchemaVersion: number;
  developerTools: Array<{ id: string; status: string; version?: string }>;
  plugins: Array<{ id: string; version?: string; installed: boolean; status: string }>;
  marketplace: { provider: 'unconfigured'; remoteEnabled: boolean };
  updates: { provider: 'unconfigured'; automaticChecks: boolean; channel: 'beta' | 'stable' };
  recentErrors: Array<{ type: string; result: 'warning' | 'failed'; timestamp: string }>;
}

export function createSafeDiagnostics(input: {
  version: string;
  userAgent?: string;
  state: PersistedDesktopState;
  tools?: DeveloperToolsReport;
  plugins: readonly PluginCatalogEntry[];
}): ForgeKiDiagnostics {
  const channel = input.state.preferences.updateChannel;
  return {
    schemaVersion: DIAGNOSTICS_SCHEMA_VERSION,
    product: 'ForgeKi Desktop',
    version: input.version,
    channel,
    platform: { os: detectOperatingSystem(input.userAgent), architecture: 'unknown' },
    configurationSchemaVersion: input.state.schemaVersion,
    developerTools: (input.tools?.tools ?? []).map(({ id, status, version }) => ({
      id,
      status,
      ...(version ? { version: sanitizeVersion(version) } : {}),
    })),
    plugins: input.plugins
      .map(({ id, manifest, installed, integrity }) => ({
        id,
        ...(manifest?.version ? { version: manifest.version } : {}),
        installed,
        status: integrity,
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    marketplace: {
      provider: 'unconfigured',
      remoteEnabled: input.state.preferences.remoteMarketplaceEnabled,
    },
    updates: {
      provider: 'unconfigured',
      automaticChecks: input.state.preferences.automaticallyCheckUpdates,
      channel,
    },
    recentErrors: safeErrors(input.state.activity),
  };
}

export function diagnosticsJson(report: ForgeKiDiagnostics): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export function containsForbiddenDiagnosticData(value: string): boolean {
  return /(?:[A-Z]:\\|\/Users\/|\/home\/|token|password|credential|secret|npmrc|projectPath|projectName)/iu.test(
    value,
  );
}

function safeErrors(activity: readonly ActivityEntry[]): ForgeKiDiagnostics['recentErrors'] {
  return activity
    .filter(({ result }) => result === 'failed' || result === 'warning')
    .slice(0, 20)
    .map(({ type, result, timestamp }) => ({
      type,
      result: result as 'warning' | 'failed',
      timestamp,
    }));
}

function detectOperatingSystem(userAgent = ''): ForgeKiDiagnostics['platform']['os'] {
  if (/Windows/iu.test(userAgent)) return 'Windows';
  if (/Macintosh|Mac OS/iu.test(userAgent)) return 'macOS';
  if (/Linux/iu.test(userAgent)) return 'Linux';
  return 'Unknown';
}

function sanitizeVersion(value: string): string {
  return value.replace(/[\r\n]/gu, ' ').slice(0, 120);
}
