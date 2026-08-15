import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { MarketplaceCache } from './cache.js';
import { createSignedTestMarketplace } from './fixtures/index.js';
import { verifyMarketplaceDocuments } from './trust.js';

const temporary: string[] = [];
afterEach(async () => {
  const { rm } = await import('node:fs/promises');
  await Promise.all(temporary.splice(0).map((item) => rm(item, { recursive: true, force: true })));
});
async function cache() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'forgeki-cache-'));
  temporary.push(root);
  return new MarketplaceCache(root);
}

describe('verified Marketplace cache', () => {
  it('writes and reads only validated snapshots', async () => {
    const target = await cache();
    const fixture = createSignedTestMarketplace();
    const snapshot = {
      ...verifyMarketplaceDocuments(fixture.documents, [fixture.root]),
      source: 'test-fixture' as const,
    };
    await target.write(snapshot);
    expect((await target.read()).snapshot?.index.plugins).toHaveLength(5);
  });
  it('reports stale data explicitly', async () => {
    const target = await cache();
    const fixture = createSignedTestMarketplace();
    const snapshot = {
      ...verifyMarketplaceDocuments(fixture.documents, [fixture.root], new Date('2020-01-01')),
      source: 'test-fixture' as const,
    };
    await target.write(snapshot);
    expect((await target.read(new Date('2020-01-10'))).freshness).toBe('stale');
  });
  it('handles corrupted cache and clear without throwing', async () => {
    const target = await cache();
    await writeFile(path.join(target.root, 'verified-marketplace-v1.json'), '{bad');
    expect((await target.read()).freshness).toBe('unavailable');
    await target.clear();
    expect((await target.read()).freshness).toBe('unavailable');
  });
  it('does not replace a good cache when remote verification fails', async () => {
    const target = await cache();
    const fixture = createSignedTestMarketplace();
    const snapshot = {
      ...verifyMarketplaceDocuments(fixture.documents, [fixture.root]),
      source: 'test-fixture' as const,
    };
    await target.write(snapshot);
    const before = await readFile(path.join(target.root, 'verified-marketplace-v1.json'), 'utf8');
    fixture.documents.index.signature = 'aW52YWxpZA==';
    expect(() => verifyMarketplaceDocuments(fixture.documents, [fixture.root])).toThrow();
    expect(await readFile(path.join(target.root, 'verified-marketplace-v1.json'), 'utf8')).toBe(
      before,
    );
  });
  it('atomically replaces the cache without leaving temporary files', async () => {
    const target = await cache();
    const fixture = createSignedTestMarketplace();
    const snapshot = {
      ...verifyMarketplaceDocuments(fixture.documents, [fixture.root]),
      source: 'test-fixture' as const,
    };
    await target.write(snapshot);
    await target.write({ ...snapshot, verifiedAt: '2030-01-01T00:00:00.000Z' });
    expect(await readdir(target.root)).toEqual(['verified-marketplace-v1.json']);
    expect((await target.read(new Date('2030-01-01T01:00:00.000Z'))).snapshot?.verifiedAt).toBe(
      '2030-01-01T00:00:00.000Z',
    );
  });
});
