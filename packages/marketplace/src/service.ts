import { chmod, lstat, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { createPluginSafetyReport } from '@forgecli7/plugin-sdk';
import type {
  PluginStore,
  InstalledPlugin,
  PluginCatalogEntry,
  PluginCatalogProvider,
} from '@forgecli7/plugins';
import type { MarketplaceCache } from './cache.js';
import { sha256, type TrustedRootKey } from './crypto.js';
import { extractInspectedPackage, inspectPluginPackage } from './package.js';
import {
  compareVersions,
  MarketplaceError,
  type MarketplacePluginEntry,
  type MarketplaceStatus,
  type PublisherStatus,
  type TrustedMarketplaceSnapshot,
} from './model.js';
import {
  revocationFor,
  verifyCatalogPlugin,
  verifyMarketplaceDocuments,
  type SignedMarketplaceDocuments,
} from './trust.js';
import type { ForgeKiNetworkClient } from './network.js';

export interface MarketplaceProvider {
  readonly configured: boolean;
  readonly source: 'remote' | 'test-fixture';
  fetchDocuments(): Promise<SignedMarketplaceDocuments>;
  fetchPackage(entry: MarketplacePluginEntry): Promise<Uint8Array>;
}
export function defaultMarketplaceCacheRoot(): string {
  const local = process.env.LOCALAPPDATA;
  return local
    ? path.join(local, 'ForgeKi', 'marketplace')
    : path.join(os.homedir(), '.forgeki', 'marketplace');
}
export class UnconfiguredMarketplaceProvider implements MarketplaceProvider {
  readonly configured = false;
  readonly source = 'remote' as const;
  async fetchDocuments(): Promise<never> {
    throw new MarketplaceError(
      'UNCONFIGURED',
      'Production Marketplace provider is not configured.',
    );
  }
  async fetchPackage(): Promise<never> {
    throw new MarketplaceError(
      'UNCONFIGURED',
      'Production Marketplace provider is not configured.',
    );
  }
}

export interface RemoteMarketplaceProviderConfiguration {
  indexUrl: string;
  publishersUrl: string;
  revocationsUrl: string;
}

export class RemoteNetworkMarketplaceProvider implements MarketplaceProvider {
  readonly configured = true;
  readonly source = 'remote' as const;
  constructor(
    private readonly configuration: RemoteMarketplaceProviderConfiguration,
    private readonly network: ForgeKiNetworkClient,
  ) {}
  async fetchDocuments(): Promise<SignedMarketplaceDocuments> {
    const [index, publishers, revocations] = await Promise.all([
      this.network.fetchMarketplaceIndex(this.configuration.indexUrl),
      this.network.fetchPublisherRegistry(this.configuration.publishersUrl),
      this.network.fetchRevocations(this.configuration.revocationsUrl),
    ]);
    return {
      index: parseSigned(index),
      publishers: parseSigned(publishers),
      revocations: parseSigned(revocations),
    };
  }
  fetchPackage(entry: MarketplacePluginEntry): Promise<Uint8Array> {
    return this.network.fetchPluginPackage(entry.packageUrl);
  }
}

export interface MarketplaceSearchOptions {
  text?: string;
  category?: string;
  framework?: string;
  publisher?: string;
  installed?: boolean;
  compatible?: boolean;
  verifiedPublisher?: boolean;
}
export interface RemotePluginView extends MarketplacePluginEntry {
  publisherName: string;
  publisherStatus: PublisherStatus;
  signatureStatus: 'verified';
  installed: boolean;
  installedVersion?: string;
  updateAvailable: boolean;
  revoked: boolean;
  compatible: boolean;
}
export interface PluginInstallReview {
  plugin: RemotePluginView;
  manifest: ReturnType<typeof inspectPluginPackage>['manifest'];
  safety: ReturnType<typeof createPluginSafetyReport>;
  packageFiles: string[];
  permissionExpansion: string[];
  digestVerified: true;
  signatureVerified: true;
}

export class MarketplaceService {
  private refreshPromise?: Promise<TrustedMarketplaceSnapshot>;
  constructor(
    readonly provider: MarketplaceProvider,
    readonly roots: readonly TrustedRootKey[],
    readonly cache: MarketplaceCache,
    readonly store: PluginStore,
    readonly forgekiVersion = '0.1.0',
    readonly quarantineRoot = path.join(os.tmpdir(), 'ForgeKi', 'quarantine'),
  ) {}

  async status(now = new Date()): Promise<MarketplaceStatus> {
    const read = await this.cache.read(now);
    const cached =
      read.snapshot?.source === this.provider.source
        ? read
        : { snapshot: undefined, freshness: 'unavailable' as const };
    if (!this.provider.configured)
      return {
        configured: false,
        connectivity: 'unconfigured',
        freshness: cached.freshness,
        rootTrust: cached.snapshot ? 'verified' : 'unavailable',
        revocations: cached.freshness,
        ...(cached.snapshot ? { lastSuccessfulRefresh: cached.snapshot.verifiedAt } : {}),
        message: cached.snapshot
          ? 'Production Marketplace is not configured. Showing verified cached data.'
          : 'Production Marketplace is not configured.',
      };
    return {
      configured: true,
      connectivity: cached.snapshot ? 'online' : 'offline',
      freshness: cached.freshness,
      rootTrust: cached.snapshot ? 'verified' : 'unavailable',
      revocations: cached.freshness,
      ...(cached.snapshot ? { lastSuccessfulRefresh: cached.snapshot.verifiedAt } : {}),
      message: cached.snapshot
        ? 'Verified Marketplace metadata is available.'
        : 'Marketplace metadata is unavailable.',
    };
  }

  refresh(): Promise<TrustedMarketplaceSnapshot> {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = this.refreshOnce().finally(() => {
      this.refreshPromise = undefined;
    });
    return this.refreshPromise;
  }
  private async refreshOnce(): Promise<TrustedMarketplaceSnapshot> {
    if (!this.provider.configured)
      throw new MarketplaceError(
        'UNCONFIGURED',
        'Production Marketplace provider is not configured.',
      );
    const documents = await this.provider.fetchDocuments();
    const verified = verifyMarketplaceDocuments(documents, this.roots);
    const snapshot = { ...verified, source: this.provider.source };
    await this.cache.write(snapshot);
    await this.enforceRevocations(snapshot);
    return snapshot;
  }

  async snapshot(allowStale = true): Promise<TrustedMarketplaceSnapshot> {
    const read = await this.cache.read();
    const cached =
      read.snapshot?.source === this.provider.source
        ? read
        : { snapshot: undefined, freshness: 'unavailable' as const };
    if (!cached.snapshot) {
      if (this.provider.configured) return this.refresh();
      throw new MarketplaceError('UNCONFIGURED', 'No verified Marketplace metadata is available.');
    }
    if (!allowStale && cached.freshness === 'stale')
      throw new MarketplaceError(
        'REVOKED',
        'Revocation metadata is stale; new remote installations are blocked.',
      );
    return cached.snapshot;
  }

  async search(options: MarketplaceSearchOptions = {}): Promise<RemotePluginView[]> {
    const snapshot = await this.snapshot();
    const installed = new Map(
      (await this.store.list()).map((plugin) => [plugin.manifest.id, plugin]),
    );
    return snapshot.index.plugins
      .map((entry) => view(entry, snapshot, installed.get(entry.id), this.forgekiVersion))
      .filter((plugin) => {
        const text = options.text?.toLowerCase();
        return (
          (!text ||
            `${plugin.id} ${plugin.name} ${plugin.description} ${plugin.publisherName}`
              .toLowerCase()
              .includes(text)) &&
          (!options.category || plugin.categories.includes(options.category)) &&
          (!options.framework || plugin.supportedFrameworks.includes(options.framework)) &&
          (!options.publisher || plugin.publisherId === options.publisher) &&
          (options.installed === undefined || plugin.installed === options.installed) &&
          (options.compatible === undefined || plugin.compatible === options.compatible) &&
          (options.verifiedPublisher === undefined ||
            ['forgeki', 'verified'].includes(plugin.publisherStatus) === options.verifiedPublisher)
        );
      });
  }
  async show(id: string): Promise<RemotePluginView> {
    const found = (await this.search()).find((plugin) => plugin.id === id);
    if (!found) throw new MarketplaceError('INVALID_SCHEMA', `Unknown Marketplace plugin "${id}".`);
    return found;
  }

  async prepareInstall(id: string): Promise<PluginInstallReview> {
    const snapshot = await this.snapshot(false);
    const entry = snapshot.index.plugins.find((plugin) => plugin.id === id);
    if (!entry) throw new MarketplaceError('INVALID_SCHEMA', `Unknown Marketplace plugin "${id}".`);
    const plugin = await this.show(id);
    if (plugin.revoked) throw new MarketplaceError('REVOKED', 'This plugin is revoked.');
    if (!plugin.compatible)
      throw new MarketplaceError('INCOMPATIBLE', 'This plugin requires a newer ForgeKi version.');
    verifyCatalogPlugin(entry, snapshot.publishers, snapshot.revocations);
    return this.withQuarantinedPackage(entry, async (inspected) => {
      if (inspected.manifest.id !== entry.id || inspected.manifest.version !== entry.version)
        throw new MarketplaceError(
          'UNSAFE_ARCHIVE',
          'Downloaded package identity does not match the signed index.',
        );
      const safety = createPluginSafetyReport(inspected.manifest);
      if (safety.result === 'blocked')
        throw new MarketplaceError(
          'UNSAFE_ARCHIVE',
          safety.errors[0]?.message ?? 'Declarative plugin safety validation failed.',
        );
      const existing = await this.store.inspect(id);
      const existingPermissions = new Set<string>(existing?.manifest.permissions ?? []);
      const permissionExpansion = entry.permissions.filter(
        (permission) => !existingPermissions.has(permission),
      );
      return {
        plugin,
        manifest: inspected.manifest,
        safety,
        packageFiles: inspected.files.map(({ path: file }) => file),
        permissionExpansion,
        digestVerified: true as const,
        signatureVerified: true as const,
      };
    });
  }

  async install(id: string, confirmed = false): Promise<InstalledPlugin> {
    if (!confirmed)
      throw new MarketplaceError(
        'CONFIRMATION_REQUIRED',
        'Remote plugin installation requires explicit confirmation.',
      );
    const snapshot = await this.snapshot(false);
    const entry = snapshot.index.plugins.find((plugin) => plugin.id === id);
    if (!entry) throw new MarketplaceError('INVALID_SCHEMA', `Unknown Marketplace plugin "${id}".`);
    const existing = await this.store.inspect(id);
    if (existing && compareVersions(entry.version, existing.manifest.version) < 0)
      throw new MarketplaceError(
        'DOWNGRADE_BLOCKED',
        'Remote Marketplace cannot downgrade an installed plugin.',
      );
    const review = await this.prepareInstall(id);
    if (existing && review.permissionExpansion.length)
      throw new MarketplaceError(
        'PERMISSION_EXPANSION',
        `Update requests additional permissions: ${review.permissionExpansion.join(', ')}.`,
      );
    return this.installReviewed(entry, snapshot);
  }

  async update(
    id: string,
    confirmed = false,
    confirmPermissions = false,
  ): Promise<InstalledPlugin> {
    if (!confirmed)
      throw new MarketplaceError(
        'CONFIRMATION_REQUIRED',
        'Plugin update requires explicit confirmation.',
      );
    const existing = await this.store.inspect(id);
    if (!existing || existing.metadata.sourceType !== 'remote')
      throw new MarketplaceError('INVALID_SCHEMA', 'Only installed remote plugins can be updated.');
    const snapshot = await this.snapshot(false);
    const entry = snapshot.index.plugins.find((plugin) => plugin.id === id);
    if (!entry)
      throw new MarketplaceError(
        'INVALID_SCHEMA',
        'Installed plugin is not present in the verified catalog.',
      );
    const comparison = compareVersions(entry.version, existing.manifest.version);
    if (comparison < 0)
      throw new MarketplaceError(
        'DOWNGRADE_BLOCKED',
        'Remote Marketplace cannot downgrade an installed plugin.',
      );
    if (comparison === 0) return existing;
    const review = await this.prepareInstall(id);
    if (review.permissionExpansion.length && !confirmPermissions)
      throw new MarketplaceError(
        'PERMISSION_EXPANSION',
        `Update requests additional permissions: ${review.permissionExpansion.join(', ')}.`,
      );
    return this.installReviewed(entry, snapshot);
  }

  async updates(): Promise<RemotePluginView[]> {
    return (await this.search({ installed: true })).filter(
      ({ updateAvailable, revoked }) => updateAvailable || revoked,
    );
  }

  private async installReviewed(
    entry: MarketplacePluginEntry,
    snapshot: TrustedMarketplaceSnapshot,
  ): Promise<InstalledPlugin> {
    verifyCatalogPlugin(entry, snapshot.publishers, snapshot.revocations);
    return this.withQuarantinedPackage(entry, async (inspected, quarantine) => {
      const extracted = path.join(quarantine, 'extracted');
      await extractInspectedPackage(inspected, extracted);
      return this.store.install(extracted, {
        sourceType: 'remote',
        publisherId: entry.publisherId,
        packageSha256: entry.packageSha256,
        signatureStatus: 'verified',
      });
    });
  }

  private async withQuarantinedPackage<T>(
    entry: MarketplacePluginEntry,
    operation: (
      inspected: ReturnType<typeof inspectPluginPackage>,
      quarantine: string,
    ) => Promise<T>,
  ): Promise<T> {
    await this.cleanupQuarantine();
    await mkdir(this.quarantineRoot, { recursive: true });
    const quarantine = path.join(this.quarantineRoot, `package-${randomUUID()}`);
    await mkdir(quarantine, { recursive: false });
    try {
      const bytes = await this.provider.fetchPackage(entry);
      const archive = path.join(quarantine, 'download.forgeki-plugin');
      await writeFile(archive, bytes, { flag: 'wx' });
      await chmod(archive, 0o600).catch(() => undefined);
      if (sha256(bytes) !== entry.packageSha256)
        throw new MarketplaceError(
          'DIGEST_MISMATCH',
          'Downloaded plugin package digest does not match the signed index.',
        );
      return await operation(inspectPluginPackage(bytes), quarantine);
    } finally {
      await rm(quarantine, { recursive: true, force: true });
    }
  }

  async cleanupQuarantine(now = Date.now(), maximumAgeMs = 24 * 60 * 60 * 1_000): Promise<void> {
    const entries = await readdir(this.quarantineRoot).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    });
    for (const name of entries) {
      if (!/^package-[0-9a-f-]+$/iu.test(name)) continue;
      const target = path.join(this.quarantineRoot, name);
      const metadata = await lstat(target).catch(() => undefined);
      if (!metadata || now - metadata.mtimeMs < maximumAgeMs) continue;
      await rm(target, { recursive: true, force: true });
    }
  }
  async enforceRevocations(providedSnapshot?: TrustedMarketplaceSnapshot): Promise<string[]> {
    const snapshot = providedSnapshot ?? (await this.snapshot());
    const disabled: string[] = [];
    for (const plugin of await this.store.list()) {
      if (plugin.metadata.sourceType !== 'remote') continue;
      const entry = snapshot.index.plugins.find(
        ({ id, version }) => id === plugin.manifest.id && version === plugin.manifest.version,
      );
      const revoked = entry ? revocationFor(entry, snapshot.revocations.revocations) : undefined;
      if (revoked) {
        await this.store.disable(plugin.manifest.id, `Revoked: ${revoked.reason}`);
        disabled.push(plugin.manifest.id);
      }
    }
    return disabled;
  }
}

export class RemoteMarketplaceCatalogProvider implements PluginCatalogProvider {
  constructor(private readonly service: MarketplaceService) {}
  async list(): Promise<PluginCatalogEntry[]> {
    try {
      return await Promise.all(
        (await this.service.search()).map(async (plugin) =>
          remoteCatalog(plugin, await this.service.store.inspect(plugin.id)),
        ),
      );
    } catch {
      return [];
    }
  }
  async get(id: string): Promise<PluginCatalogEntry | undefined> {
    return (await this.list()).find((entry) => entry.id === id);
  }
}

function view(
  entry: MarketplacePluginEntry,
  snapshot: TrustedMarketplaceSnapshot,
  installed: InstalledPlugin | undefined,
  forgekiVersion: string,
): RemotePluginView {
  const publisher = snapshot.publishers.publishers.find(({ id }) => id === entry.publisherId)!;
  const revoked =
    Boolean(revocationFor(entry, snapshot.revocations.revocations)) ||
    publisher.status === 'revoked';
  return {
    ...entry,
    publisherName: publisher.displayName,
    publisherStatus: publisher.status,
    signatureStatus: 'verified',
    installed: Boolean(installed),
    ...(installed ? { installedVersion: installed.manifest.version } : {}),
    updateAvailable: Boolean(
      installed && compareVersions(entry.version, installed.manifest.version) > 0,
    ),
    revoked,
    compatible: compareVersions(forgekiVersion, entry.minimumForgeKiVersion) >= 0,
  };
}
function parseSigned(bytes: Uint8Array): SignedMarketplaceDocuments['index'] {
  try {
    const value = JSON.parse(Buffer.from(bytes).toString('utf8')) as Record<string, unknown>;
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      Object.keys(value).some((key) => !['document', 'signature', 'keyId'].includes(key)) ||
      typeof value.signature !== 'string' ||
      typeof value.keyId !== 'string'
    )
      throw new Error('invalid envelope');
    return value as unknown as SignedMarketplaceDocuments['index'];
  } catch {
    throw new MarketplaceError('INVALID_SCHEMA', 'Trusted service returned invalid signed JSON.');
  }
}
function remoteCatalog(plugin: RemotePluginView, installed?: InstalledPlugin): PluginCatalogEntry {
  const previousPermissions = new Set<string>(installed?.manifest.permissions ?? []);
  const permissionExpansion = installed
    ? plugin.permissions.filter((permission) => !previousPermissions.has(permission))
    : [];
  return {
    id: plugin.id,
    name: plugin.name,
    description: plugin.description,
    publisher: plugin.publisherName,
    version: plugin.version,
    category: plugin.categories[0] ?? 'Community',
    supportedFrameworks: plugin.supportedFrameworks,
    permissions: plugin.permissions,
    sourceType: 'remote',
    builtIn: false,
    trusted: plugin.publisherStatus === 'forgeki' || plugin.publisherStatus === 'verified',
    declarative: true,
    installed: Boolean(installed),
    integrity: plugin.revoked ? 'revoked' : (installed?.integrity ?? 'not-installed'),
    ...(installed
      ? { manifest: installed.manifest, installedAt: installed.metadata.installedAt }
      : {}),
    ...(plugin.revoked
      ? { warning: 'Plugin is revoked and disabled.' }
      : plugin.publisherStatus === 'community'
        ? { warning: 'Signature verified; publisher is not ForgeKi-verified.' }
        : {}),
    publisherStatus: plugin.publisherStatus,
    signatureStatus: plugin.signatureStatus,
    updateAvailable: plugin.updateAvailable,
    compatible: plugin.compatible,
    packageSha256: plugin.packageSha256,
    ...(permissionExpansion.length ? { permissionExpansion } : {}),
  };
}
