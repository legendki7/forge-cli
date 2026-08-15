import { verifyPluginSignature, verifySignedDocument, type TrustedRootKey } from './crypto.js';
import {
  MarketplaceError,
  validateMarketplaceIndex,
  validatePublisherRegistry,
  validateRevocations,
  type MarketplacePluginEntry,
  type MarketplacePublisher,
  type MarketplaceRevocation,
  type PublisherRegistry,
  type RevocationList,
  type SignedDocument,
  type TrustedMarketplaceSnapshot,
} from './model.js';

export interface SignedMarketplaceDocuments {
  index: SignedDocument<unknown>;
  publishers: SignedDocument<unknown>;
  revocations: SignedDocument<unknown>;
}

export function verifyMarketplaceDocuments(
  input: SignedMarketplaceDocuments,
  roots: readonly TrustedRootKey[],
  now = new Date(),
): TrustedMarketplaceSnapshot {
  const index = validateMarketplaceIndex(verifySignedDocument(input.index, roots));
  const publishers = validatePublisherRegistry(verifySignedDocument(input.publishers, roots));
  const revocations = validateRevocations(verifySignedDocument(input.revocations, roots));
  const expiresAt = earliest(index.expiresAt, publishers.expiresAt, revocations.expiresAt);
  for (const entry of index.plugins)
    verifyCatalogPlugin(entry, publishers, revocations, false, true);
  return {
    schemaVersion: 1,
    index,
    publishers,
    revocations,
    verifiedAt: now.toISOString(),
    expiresAt,
    source: 'remote',
  };
}

export function verifyCatalogPlugin(
  entry: MarketplacePluginEntry,
  publishers: PublisherRegistry,
  revocations: RevocationList,
  requireActiveKey = true,
  allowRevokedForCatalog = false,
): { publisher: MarketplacePublisher; keyStatus: 'active' | 'retired' | 'revoked' } {
  const publisher = publishers.publishers.find(({ id }) => id === entry.publisherId);
  if (!publisher)
    throw new MarketplaceError('UNTRUSTED_PUBLISHER', `Publisher ${entry.publisherId} is unknown.`);
  const key = publisher.publicKeys.find(({ id }) => id === entry.publisherKeyId);
  if (!key)
    throw new MarketplaceError(
      'UNTRUSTED_PUBLISHER',
      'Plugin references an unknown publisher key.',
    );
  const revoked = revocationFor(entry, revocations.revocations);
  if (
    !allowRevokedForCatalog &&
    (publisher.status === 'revoked' || key.status === 'revoked' || revoked)
  )
    throw new MarketplaceError(
      'REVOKED',
      revoked?.reason ?? 'Publisher or signing key is revoked.',
    );
  if (requireActiveKey && key.status !== 'active')
    throw new MarketplaceError(
      'UNTRUSTED_PUBLISHER',
      'New installations require an active publisher key.',
    );
  verifyPluginSignature(entry, key.publicKey);
  return { publisher, keyStatus: key.status };
}

export function revocationFor(
  entry: MarketplacePluginEntry,
  revocations: readonly MarketplaceRevocation[],
): MarketplaceRevocation | undefined {
  return revocations.find(
    (item) =>
      (item.type === 'publisher' && item.value === entry.publisherId) ||
      (item.type === 'publisher-key' &&
        item.value === `${entry.publisherId}:${entry.publisherKeyId}`) ||
      (item.type === 'plugin-version' && item.value === `${entry.id}@${entry.version}`) ||
      (item.type === 'package-digest' && item.value === entry.packageSha256),
  );
}

export function isExpired(value: { expiresAt: string }, now = new Date()): boolean {
  return Date.parse(value.expiresAt) <= now.getTime();
}
function earliest(...values: string[]): string {
  return values.sort((a, b) => Date.parse(a) - Date.parse(b))[0]!;
}
