import { describe, expect, it } from 'vitest';
import {
  canonicalize,
  MarketplaceError,
  validateMarketplaceIndex,
  validatePublisherRegistry,
} from './model.js';
import { createSignedTestMarketplace } from './fixtures/index.js';
import { TEST_OTHER_PUBLIC_KEY, TEST_ROOT_KEY } from './fixtures/test-keys.js';
import { verifyMarketplaceDocuments, verifyCatalogPlugin } from './trust.js';

describe('Marketplace protocol trust', () => {
  it('verifies a complete root-signed index and publisher chain', () => {
    const fixture = createSignedTestMarketplace();
    const snapshot = verifyMarketplaceDocuments(fixture.documents, [fixture.root]);
    expect(snapshot.index.plugins).toHaveLength(5);
    expect(
      verifyCatalogPlugin(snapshot.index.plugins[0]!, snapshot.publishers, snapshot.revocations)
        .publisher.status,
    ).toBe('verified');
  });
  it('rejects invalid and modified signatures', () => {
    const fixture = createSignedTestMarketplace();
    fixture.documents.index.signature = 'aW52YWxpZA==';
    expect(() => verifyMarketplaceDocuments(fixture.documents, [fixture.root])).toThrowError(
      /signature/u,
    );
  });
  it('rejects an unknown root key', () => {
    const fixture = createSignedTestMarketplace();
    expect(() =>
      verifyMarketplaceDocuments(fixture.documents, [
        { ...TEST_ROOT_KEY, publicKey: TEST_OTHER_PUBLIC_KEY },
      ]),
    ).toThrow(MarketplaceError);
  });
  it('rejects unsupported schemas, oversized catalogs, and invalid entries', () => {
    expect(() =>
      validateMarketplaceIndex({
        schemaVersion: 2,
        expiresAt: '2099-01-01T00:00:00Z',
        plugins: [],
      }),
    ).toThrow();
    expect(() =>
      validateMarketplaceIndex({
        schemaVersion: 1,
        expiresAt: '2099-01-01T00:00:00Z',
        plugins: Array.from({ length: 5001 }),
      }),
    ).toThrow();
    expect(() =>
      validateMarketplaceIndex({
        schemaVersion: 1,
        expiresAt: '2099-01-01T00:00:00Z',
        plugins: [{ id: '../evil' }],
      }),
    ).toThrow();
  });
  it('canonicalizes deterministically without ambiguous key order', () => {
    expect(canonicalize({ z: 1, a: { y: 2, x: 3 } })).toBe('{"a":{"x":3,"y":2},"z":1}');
    expect(canonicalize({ a: 1, z: 2 })).toBe(canonicalize({ z: 2, a: 1 }));
  });
  it('distinguishes verified, community, revoked, active, retired, and revoked keys', () => {
    const fixture = createSignedTestMarketplace();
    const registry = validatePublisherRegistry(fixture.documents.publishers.document);
    const plugin = fixture.documents.index.document as ReturnType<typeof validateMarketplaceIndex>;
    expect(registry.publishers[0]?.status).toBe('verified');
    registry.publishers[0]!.status = 'community';
    expect(
      verifyCatalogPlugin(
        plugin.plugins[0]!,
        registry,
        fixture.documents.revocations.document as never,
      ).publisher.status,
    ).toBe('community');
    registry.publishers[0]!.publicKeys[0]!.status = 'retired';
    expect(() =>
      verifyCatalogPlugin(
        plugin.plugins[0]!,
        registry,
        fixture.documents.revocations.document as never,
      ),
    ).toThrow(/active/u);
    expect(
      verifyCatalogPlugin(
        plugin.plugins[0]!,
        registry,
        fixture.documents.revocations.document as never,
        false,
      ).keyStatus,
    ).toBe('retired');
    registry.publishers[0]!.publicKeys[0]!.status = 'revoked';
    expect(() =>
      verifyCatalogPlugin(
        plugin.plugins[0]!,
        registry,
        fixture.documents.revocations.document as never,
        false,
      ),
    ).toThrow(/revoked/u);
  });
  it('rejects forged publisher IDs, unknown publishers, and signed revocations', () => {
    const fixture = createSignedTestMarketplace({ revoked: 'community.editorconfig@0.1.0' });
    const snapshot = verifyMarketplaceDocuments(fixture.documents, [fixture.root]);
    expect(() =>
      verifyCatalogPlugin(snapshot.index.plugins[0]!, snapshot.publishers, snapshot.revocations),
    ).toThrow(/revocation/u);
    expect(() =>
      verifyCatalogPlugin(
        { ...snapshot.index.plugins[1]!, publisherId: 'forged.publisher' },
        snapshot.publishers,
        snapshot.revocations,
      ),
    ).toThrow(/unknown/u);
  });
  it.each([
    ['publisher', 'forgeki-test-community'],
    ['publisher-key', 'forgeki-test-community:publisher-key-1'],
    ['plugin-version', 'community.editorconfig@0.1.0'],
  ] as const)('enforces signed %s revocations', (type, value) => {
    const fixture = createSignedTestMarketplace({
      revocations: [{ type, value, reason: 'TEST ONLY revocation fixture' }],
    });
    const snapshot = verifyMarketplaceDocuments(fixture.documents, [fixture.root]);
    expect(() =>
      verifyCatalogPlugin(snapshot.index.plugins[0]!, snapshot.publishers, snapshot.revocations),
    ).toThrow(/revocation/u);
  });
  it('enforces package-digest revocation and rejects a wrong publisher key', () => {
    const unsigned = createSignedTestMarketplace();
    const digest = (
      unsigned.documents.index.document as ReturnType<typeof validateMarketplaceIndex>
    ).plugins[0]!.packageSha256;
    const fixture = createSignedTestMarketplace({
      revocations: [{ type: 'package-digest', value: digest, reason: 'TEST ONLY digest revoked' }],
    });
    const revoked = verifyMarketplaceDocuments(fixture.documents, [fixture.root]);
    expect(() =>
      verifyCatalogPlugin(revoked.index.plugins[0]!, revoked.publishers, revoked.revocations),
    ).toThrow(/revoked/u);

    const valid = verifyMarketplaceDocuments(unsigned.documents, [unsigned.root]);
    valid.publishers.publishers[0]!.publicKeys[0]!.publicKey = TEST_OTHER_PUBLIC_KEY;
    expect(() =>
      verifyCatalogPlugin(valid.index.plugins[0]!, valid.publishers, valid.revocations),
    ).toThrow(/signature/u);
  });
  it('blocks a root-declared revoked publisher and an invalid plugin signature', () => {
    const revokedFixture = createSignedTestMarketplace({ publisherStatus: 'revoked' });
    const revoked = verifyMarketplaceDocuments(revokedFixture.documents, [revokedFixture.root]);
    expect(() =>
      verifyCatalogPlugin(revoked.index.plugins[0]!, revoked.publishers, revoked.revocations),
    ).toThrow(/revoked/u);

    const fixture = createSignedTestMarketplace();
    const snapshot = verifyMarketplaceDocuments(fixture.documents, [fixture.root]);
    snapshot.index.plugins[0]!.signature = 'aW52YWxpZA==';
    expect(() =>
      verifyCatalogPlugin(snapshot.index.plugins[0]!, snapshot.publishers, snapshot.revocations),
    ).toThrow(/signature/u);
  });
});
