import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { syncDesktopVersion } from '../scripts/sync-release-version.mjs';

describe('Desktop release version synchronization', () => {
  it('updates package, Tauri, and Cargo versions from one reviewed beta version', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'forgeki-version-'));
    try {
      await mkdir(path.join(root, 'apps/desktop/src-tauri'), { recursive: true });
      await writeFile(path.join(root, 'apps/desktop/package.json'), '{"version":"0.1.0"}');
      await writeFile(
        path.join(root, 'apps/desktop/src-tauri/tauri.conf.json'),
        '{"version":"0.1.0"}',
      );
      await writeFile(
        path.join(root, 'apps/desktop/src-tauri/Cargo.toml'),
        '[package]\nname = "desktop"\nversion = "0.1.0"\n',
      );
      syncDesktopVersion(root, '0.2.0-beta.0');
      expect(
        JSON.parse(await readFile(path.join(root, 'apps/desktop/package.json'), 'utf8')).version,
      ).toBe('0.2.0-beta.0');
      expect(
        await readFile(path.join(root, 'apps/desktop/src-tauri/Cargo.toml'), 'utf8'),
      ).toContain('version = "0.2.0-beta.0"');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
