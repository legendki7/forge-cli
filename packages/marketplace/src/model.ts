export const MARKETPLACE_SCHEMA_VERSION = 1 as const;

export const MARKETPLACE_LIMITS = {
  indexBytes: 5 * 1024 * 1024,
  publishersBytes: 2 * 1024 * 1024,
  revocationsBytes: 2 * 1024 * 1024,
  updateMetadataBytes: 1024 * 1024,
  packageBytes: 10 * 1024 * 1024,
  extractedFileBytes: 1024 * 1024,
  extractedFiles: 200,
  redirects: 3,
  timeoutMs: 10_000,
} as const;

export type PublisherStatus = 'forgeki' | 'verified' | 'community' | 'revoked';
export type PublisherKeyStatus = 'active' | 'retired' | 'revoked';
export type MarketplaceFreshness = 'fresh' | 'cached' | 'stale' | 'unavailable';
export type SignatureStatus = 'verified' | 'invalid' | 'unavailable';
export type UpdateChannel = 'stable' | 'beta';

export interface PublisherPublicKey {
  id: string;
  algorithm: 'Ed25519';
  publicKey: string;
  status: PublisherKeyStatus;
}

export interface MarketplacePublisher {
  id: string;
  displayName: string;
  status: PublisherStatus;
  publicKeys: PublisherPublicKey[];
}

export interface PublisherRegistry {
  schemaVersion: 1;
  expiresAt: string;
  publishers: MarketplacePublisher[];
}

export interface MarketplacePluginEntry {
  id: string;
  version: string;
  name: string;
  description: string;
  publisherId: string;
  publisherKeyId: string;
  packageUrl: string;
  packageSha256: string;
  signature: string;
  minimumForgeKiVersion: string;
  categories: string[];
  supportedFrameworks: string[];
  permissions: string[];
  packageFiles: string[];
  repository?: string;
  homepage?: string;
}

export interface MarketplaceIndex {
  schemaVersion: 1;
  expiresAt: string;
  plugins: MarketplacePluginEntry[];
}

export interface MarketplaceRevocation {
  type: 'publisher' | 'publisher-key' | 'plugin-version' | 'package-digest';
  value: string;
  reason: string;
}

export interface RevocationList {
  schemaVersion: 1;
  expiresAt: string;
  revocations: MarketplaceRevocation[];
}

export interface SignedDocument<T> {
  document: T;
  signature: string;
  keyId: string;
}

export interface TrustedMarketplaceSnapshot {
  schemaVersion: 1;
  index: MarketplaceIndex;
  publishers: PublisherRegistry;
  revocations: RevocationList;
  verifiedAt: string;
  expiresAt: string;
  source: 'remote' | 'test-fixture';
}

export interface MarketplaceStatus {
  configured: boolean;
  connectivity: 'online' | 'offline' | 'unconfigured';
  freshness: MarketplaceFreshness;
  rootTrust: SignatureStatus;
  revocations: MarketplaceFreshness;
  lastSuccessfulRefresh?: string;
  message: string;
}

export interface ApplicationUpdateMetadata {
  schemaVersion: 1;
  channel: UpdateChannel;
  version: string;
  releaseNotes: string;
  packageSize: number;
  artifactUrl: string;
  artifactSha256: string;
  artifactSignature: string;
  expiresAt: string;
}

export interface ApplicationUpdateCheck {
  configured: boolean;
  channel: UpdateChannel;
  currentVersion: string;
  state: 'unconfigured' | 'no-update' | 'available' | 'invalid' | 'unavailable';
  signatureStatus: SignatureStatus;
  latestVersion?: string;
  releaseNotes?: string;
  packageSize?: number;
  message: string;
}

export class MarketplaceError extends Error {
  constructor(
    readonly code:
      | 'UNCONFIGURED'
      | 'INVALID_SCHEMA'
      | 'INVALID_SIGNATURE'
      | 'UNTRUSTED_PUBLISHER'
      | 'REVOKED'
      | 'DIGEST_MISMATCH'
      | 'UNSAFE_ARCHIVE'
      | 'NETWORK_POLICY'
      | 'NETWORK_FAILURE'
      | 'CACHE_FAILURE'
      | 'INCOMPATIBLE'
      | 'CONFIRMATION_REQUIRED'
      | 'DOWNGRADE_BLOCKED'
      | 'PERMISSION_EXPANSION',
    message: string,
  ) {
    super(message);
    this.name = 'MarketplaceError';
  }
}

export function canonicalize(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'number') {
    if (typeof value === 'number' && !Number.isFinite(value))
      throw new TypeError('Non-finite number.');
    return JSON.stringify(value);
  }
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .filter((key) => object[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(object[key])}`)
      .join(',')}}`;
  }
  throw new TypeError('Value cannot be represented in canonical JSON.');
}

const idPattern = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?\.[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/u;
const simpleIdPattern = /^[a-z0-9](?:[a-z0-9._-]{0,126}[a-z0-9])?$/u;
const versionPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;
const digestPattern = /^[a-f0-9]{64}$/u;

export function validateMarketplaceIndex(value: unknown): MarketplaceIndex {
  const input = record(value, 'Marketplace index');
  exactKeys(input, ['schemaVersion', 'expiresAt', 'plugins'], 'Marketplace index');
  if (
    input.schemaVersion !== 1 ||
    !validDate(input.expiresAt) ||
    !Array.isArray(input.plugins) ||
    input.plugins.length > 5000
  )
    invalid('Marketplace index');
  const plugins = input.plugins.map(validatePluginEntry);
  if (new Set(plugins.map(({ id }) => id)).size !== plugins.length)
    invalid('Marketplace index contains duplicate plugin ids');
  return { schemaVersion: 1, expiresAt: input.expiresAt as string, plugins };
}

export function validatePublisherRegistry(value: unknown): PublisherRegistry {
  const input = record(value, 'Publisher registry');
  exactKeys(input, ['schemaVersion', 'expiresAt', 'publishers'], 'Publisher registry');
  if (
    input.schemaVersion !== 1 ||
    !validDate(input.expiresAt) ||
    !Array.isArray(input.publishers) ||
    input.publishers.length > 2000
  )
    invalid('Publisher registry');
  const publishers = input.publishers.map((candidate) => {
    const item = record(candidate, 'Publisher');
    exactKeys(item, ['id', 'displayName', 'status', 'publicKeys'], 'Publisher');
    if (
      !simple(item.id) ||
      !simple(item.displayName) ||
      !['forgeki', 'verified', 'community', 'revoked'].includes(String(item.status)) ||
      !Array.isArray(item.publicKeys) ||
      item.publicKeys.length < 1 ||
      item.publicKeys.length > 10
    )
      invalid('Publisher');
    const publicKeys = item.publicKeys.map((candidateKey) => {
      const key = record(candidateKey, 'Publisher key');
      exactKeys(key, ['id', 'algorithm', 'publicKey', 'status'], 'Publisher key');
      if (
        !simpleIdPattern.test(String(key.id)) ||
        key.algorithm !== 'Ed25519' ||
        !base64(key.publicKey, 1024) ||
        !['active', 'retired', 'revoked'].includes(String(key.status))
      )
        invalid('Publisher key');
      return key as unknown as PublisherPublicKey;
    });
    return {
      id: item.id as string,
      displayName: item.displayName as string,
      status: item.status as PublisherStatus,
      publicKeys,
    };
  });
  if (new Set(publishers.map(({ id }) => id)).size !== publishers.length)
    invalid('Publisher registry contains duplicate ids');
  return { schemaVersion: 1, expiresAt: input.expiresAt as string, publishers };
}

export function validateRevocations(value: unknown): RevocationList {
  const input = record(value, 'Revocation list');
  exactKeys(input, ['schemaVersion', 'expiresAt', 'revocations'], 'Revocation list');
  if (
    input.schemaVersion !== 1 ||
    !validDate(input.expiresAt) ||
    !Array.isArray(input.revocations) ||
    input.revocations.length > 10_000
  )
    invalid('Revocation list');
  const revocations = input.revocations.map((candidate) => {
    const item = record(candidate, 'Revocation');
    exactKeys(item, ['type', 'value', 'reason'], 'Revocation');
    if (
      !['publisher', 'publisher-key', 'plugin-version', 'package-digest'].includes(
        String(item.type),
      ) ||
      !simple(item.value, 300) ||
      !simple(item.reason, 300)
    )
      invalid('Revocation');
    return item as unknown as MarketplaceRevocation;
  });
  return { schemaVersion: 1, expiresAt: input.expiresAt as string, revocations };
}

export function validateUpdateMetadata(value: unknown): ApplicationUpdateMetadata {
  const input = record(value, 'Update metadata');
  exactKeys(
    input,
    [
      'schemaVersion',
      'channel',
      'version',
      'releaseNotes',
      'packageSize',
      'artifactUrl',
      'artifactSha256',
      'artifactSignature',
      'expiresAt',
    ],
    'Update metadata',
  );
  if (
    input.schemaVersion !== 1 ||
    !['stable', 'beta'].includes(String(input.channel)) ||
    !versionPattern.test(String(input.version)) ||
    !simple(input.releaseNotes, 20_000) ||
    !Number.isSafeInteger(input.packageSize) ||
    Number(input.packageSize) < 1 ||
    Number(input.packageSize) > 500 * 1024 * 1024 ||
    !httpsUrl(input.artifactUrl) ||
    !digestPattern.test(String(input.artifactSha256)) ||
    !base64(input.artifactSignature, 1024) ||
    !validDate(input.expiresAt)
  )
    invalid('Update metadata');
  return input as unknown as ApplicationUpdateMetadata;
}

function validatePluginEntry(candidate: unknown): MarketplacePluginEntry {
  const item = record(candidate, 'Plugin entry');
  exactKeys(
    item,
    [
      'id',
      'version',
      'name',
      'description',
      'publisherId',
      'publisherKeyId',
      'packageUrl',
      'packageSha256',
      'signature',
      'minimumForgeKiVersion',
      'categories',
      'supportedFrameworks',
      'permissions',
      'packageFiles',
      'repository',
      'homepage',
    ],
    'Plugin entry',
  );
  if (
    !idPattern.test(String(item.id)) ||
    !versionPattern.test(String(item.version)) ||
    !simple(item.name) ||
    !simple(item.description, 2000) ||
    !simpleIdPattern.test(String(item.publisherId)) ||
    !simpleIdPattern.test(String(item.publisherKeyId)) ||
    !httpsUrl(item.packageUrl) ||
    !digestPattern.test(String(item.packageSha256)) ||
    !base64(item.signature, 1024) ||
    !versionPattern.test(String(item.minimumForgeKiVersion))
  )
    invalid('Plugin entry');
  for (const field of [
    'categories',
    'supportedFrameworks',
    'permissions',
    'packageFiles',
  ] as const) {
    if (
      !Array.isArray(item[field]) ||
      item[field].length > 200 ||
      item[field].some((part) => !simple(part, 300))
    )
      invalid(`Plugin entry ${field}`);
  }
  for (const field of ['repository', 'homepage'] as const)
    if (item[field] !== undefined && !httpsUrl(item[field])) invalid(`Plugin entry ${field}`);
  return item as unknown as MarketplacePluginEntry;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(label);
  return value as Record<string, unknown>;
}
function exactKeys(value: Record<string, unknown>, allowed: string[], label: string) {
  if (Object.keys(value).some((key) => !allowed.includes(key)))
    invalid(`${label} contains unsupported fields`);
}
function simple(value: unknown, max = 500): value is string {
  return (
    typeof value === 'string' && value.length > 0 && value.length <= max && !value.includes('\0')
  );
}
function base64(value: unknown, max: number): value is string {
  return simple(value, max) && /^[A-Za-z0-9+/]+={0,2}$/u.test(value);
}
function validDate(value: unknown): value is string {
  return simple(value, 100) && Number.isFinite(Date.parse(value));
}
function httpsUrl(value: unknown): value is string {
  try {
    const url = new URL(String(value));
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}
function invalid(label: string): never {
  throw new MarketplaceError('INVALID_SCHEMA', `${label} is invalid or unsupported.`);
}

export function compareVersions(left: string, right: string): number {
  const values = (version: string) => version.split('-', 1)[0]!.split('.').map(Number);
  const a = values(left);
  const b = values(right);
  for (let index = 0; index < 3; index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference) return difference;
  }
  return left.localeCompare(right);
}
