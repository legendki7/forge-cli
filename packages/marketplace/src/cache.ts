import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import {
  MarketplaceError,
  validateMarketplaceIndex,
  validatePublisherRegistry,
  validateRevocations,
  type MarketplaceFreshness,
  type TrustedMarketplaceSnapshot,
} from './model.js';

const CACHE_FILE = 'verified-marketplace-v1.json';
const MAX_CACHE_BYTES = 10 * 1024 * 1024;

export class MarketplaceCache {
  constructor(readonly root: string) {}
  async read(
    now = new Date(),
  ): Promise<{ snapshot?: TrustedMarketplaceSnapshot; freshness: MarketplaceFreshness }> {
    try {
      const file = path.join(this.root, CACHE_FILE);
      const encoded = await readFile(file);
      if (encoded.byteLength > MAX_CACHE_BYTES) return { freshness: 'unavailable' };
      const input = JSON.parse(encoded.toString('utf8')) as TrustedMarketplaceSnapshot;
      if (input.schemaVersion !== 1 || !['remote', 'test-fixture'].includes(input.source))
        return { freshness: 'unavailable' };
      const snapshot: TrustedMarketplaceSnapshot = {
        ...input,
        index: validateMarketplaceIndex(input.index),
        publishers: validatePublisherRegistry(input.publishers),
        revocations: validateRevocations(input.revocations),
      };
      const age = now.getTime() - Date.parse(snapshot.verifiedAt);
      const expired = Date.parse(snapshot.expiresAt) <= now.getTime();
      return {
        snapshot,
        freshness:
          expired || age > 7 * 86_400_000 ? 'stale' : age > 24 * 3_600_000 ? 'cached' : 'fresh',
      };
    } catch {
      return { freshness: 'unavailable' };
    }
  }
  async write(snapshot: TrustedMarketplaceSnapshot): Promise<void> {
    const encoded = `${JSON.stringify(snapshot, null, 2)}\n`;
    if (Buffer.byteLength(encoded) > MAX_CACHE_BYTES)
      throw new MarketplaceError(
        'CACHE_FAILURE',
        'Verified Marketplace cache exceeds its size limit.',
      );
    await mkdir(this.root, { recursive: true });
    const target = path.join(this.root, CACHE_FILE);
    const temporary = path.join(this.root, `.cache-${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, encoded, { flag: 'wx' });
      await rename(temporary, target);
    } catch {
      await rm(temporary, { force: true });
      throw new MarketplaceError(
        'CACHE_FAILURE',
        'Verified Marketplace cache could not be updated atomically.',
      );
    }
  }
  async clear(): Promise<void> {
    await rm(path.join(this.root, CACHE_FILE), { force: true });
  }
}
