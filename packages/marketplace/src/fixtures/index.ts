import { serializePluginManifest, type ForgeKiPluginManifest } from '@forgecli7/plugin-sdk';
import { BUNDLED_COMMUNITY_PLUGINS } from '@forgecli7/plugins';
import { encodePackage, type ForgeKiPluginPackage } from '../package.js';
import {
  pluginSignaturePayload,
  sha256,
  signBytesForFixture,
  signCanonicalForFixture,
} from '../crypto.js';
import type {
  ApplicationUpdateMetadata,
  MarketplaceIndex,
  MarketplacePluginEntry,
  MarketplaceRevocation,
  PublisherRegistry,
  RevocationList,
  SignedDocument,
} from '../model.js';
import type { MarketplaceProvider } from '../service.js';
import type { SignedMarketplaceDocuments } from '../trust.js';
import type { UpdateProvider } from '../updater.js';
import {
  TEST_PUBLISHER_PRIVATE_KEY,
  TEST_PUBLISHER_PUBLIC_KEY,
  TEST_ROOT_KEY,
  TEST_ROOT_PRIVATE_KEY,
  TEST_UPDATE_PRIVATE_KEY,
} from './test-keys.js';

const expiry = '2099-01-01T00:00:00.000Z';

export function packageFixture(manifest: ForgeKiPluginManifest): Uint8Array {
  const files: ForgeKiPluginPackage['files'] = [
    {
      path: 'README.md',
      type: 'file',
      content: Buffer.from(
        `# ${manifest.name}\n\nTEST FIXTURE. Declarative plugin only.\n`,
      ).toString('base64'),
    },
    {
      path: 'forgeki.plugin.json',
      type: 'file',
      content: Buffer.from(serializePluginManifest(manifest)).toString('base64'),
    },
  ];
  const bundle: ForgeKiPluginPackage = {
    formatVersion: 1,
    pluginId: manifest.id,
    version: manifest.version,
    files: files.sort((a, b) => a.path.localeCompare(b.path)),
  };
  return encodePackage(bundle);
}

export function createSignedTestMarketplace(
  options: {
    revoked?: string;
    revocations?: MarketplaceRevocation[];
    publisherStatus?: 'forgeki' | 'verified' | 'community' | 'revoked';
    publisherKeyStatus?: 'active' | 'retired' | 'revoked';
    versionOverrides?: Record<string, string>;
    permissionAdditions?: Record<string, string[]>;
    minimumForgeKiVersions?: Record<string, string>;
  } = {},
): {
  documents: SignedMarketplaceDocuments;
  packages: Map<string, Uint8Array>;
  root: typeof TEST_ROOT_KEY;
} {
  const packages = new Map<string, Uint8Array>();
  const plugins = BUNDLED_COMMUNITY_PLUGINS.map((original) => {
    const version = options.versionOverrides?.[original.id] ?? original.version;
    const manifest = {
      ...original,
      version,
      permissions: [
        ...original.permissions,
        ...(options.permissionAdditions?.[original.id] ?? []),
      ] as ForgeKiPluginManifest['permissions'],
    };
    const bytes = packageFixture(manifest);
    packages.set(manifest.id, bytes);
    const unsigned = {
      id: manifest.id,
      version,
      name: manifest.name,
      description: manifest.description,
      publisherId: 'forgeki-test-community',
      publisherKeyId: 'publisher-key-1',
      packageUrl: `https://fixtures.forgeki.invalid/packages/${manifest.id}.forgeki-plugin`,
      packageSha256: sha256(bytes),
      minimumForgeKiVersion: options.minimumForgeKiVersions?.[manifest.id] ?? '0.1.0',
      categories: [manifest.category ?? 'Community'],
      supportedFrameworks: [...manifest.supportedFrameworks],
      permissions: [...manifest.permissions],
      packageFiles: ['README.md', 'forgeki.plugin.json'],
      repository: 'https://github.com/legendki7/forge-cli',
    };
    return {
      ...unsigned,
      signature: signBytesForFixture(pluginSignaturePayload(unsigned), TEST_PUBLISHER_PRIVATE_KEY),
    } satisfies MarketplacePluginEntry;
  });
  const index: MarketplaceIndex = { schemaVersion: 1, expiresAt: expiry, plugins };
  const publishers: PublisherRegistry = {
    schemaVersion: 1,
    expiresAt: expiry,
    publishers: [
      {
        id: 'forgeki-test-community',
        displayName: 'ForgeKi Test Publisher',
        status: options.publisherStatus ?? 'verified',
        publicKeys: [
          {
            id: 'publisher-key-1',
            algorithm: 'Ed25519',
            publicKey: TEST_PUBLISHER_PUBLIC_KEY,
            status: options.publisherKeyStatus ?? 'active',
          },
        ],
      },
    ],
  };
  const revocations: RevocationList = {
    schemaVersion: 1,
    expiresAt: expiry,
    revocations:
      options.revocations ??
      (options.revoked
        ? [
            {
              type: 'plugin-version',
              value: options.revoked,
              reason: 'TEST ONLY revocation fixture',
            },
          ]
        : []),
  };
  return {
    root: TEST_ROOT_KEY,
    packages,
    documents: {
      index: signed(index),
      publishers: signed(publishers),
      revocations: signed(revocations),
    },
  };
}

export class TestMarketplaceProvider implements MarketplaceProvider {
  readonly configured = true;
  readonly source = 'test-fixture' as const;
  constructor(readonly fixture = createSignedTestMarketplace()) {}
  async fetchDocuments() {
    return this.fixture.documents;
  }
  async fetchPackage(entry: MarketplacePluginEntry) {
    const bytes = this.fixture.packages.get(entry.id);
    if (!bytes) throw new Error('Fixture package missing.');
    return bytes;
  }
}

export class TestUpdateProvider implements UpdateProvider {
  readonly configured = true;
  constructor(
    readonly metadata?: ApplicationUpdateMetadata,
    readonly invalidSignature = false,
    readonly artifact?: Uint8Array | Error,
  ) {}
  async check(): Promise<SignedDocument<unknown> | undefined> {
    if (!this.metadata) return undefined;
    return {
      document: this.metadata,
      keyId: 'forgeki-test-update-1',
      signature: this.invalidSignature
        ? 'aW52YWxpZA=='
        : signCanonicalForFixture(this.metadata, TEST_UPDATE_PRIVATE_KEY),
    };
  }
  async download(): Promise<Uint8Array> {
    if (this.artifact instanceof Error) throw this.artifact;
    if (!this.artifact) throw new Error('TEST ONLY update artifact is unavailable.');
    return this.artifact;
  }
}

function signed<T>(document: T): SignedDocument<T> {
  return {
    document,
    keyId: TEST_ROOT_KEY.id,
    signature: signCanonicalForFixture(document, TEST_ROOT_PRIVATE_KEY),
  };
}
