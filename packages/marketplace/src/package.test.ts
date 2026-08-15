import { link, mkdtemp, mkdir, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { BUNDLED_COMMUNITY_PLUGINS } from '@forgecli7/plugins';
import { canonicalize } from './model.js';
import { buildPluginPackage, inspectPluginPackage, validateArchivePath } from './package.js';
import { packageFixture } from './fixtures/index.js';

const temporary: string[] = [];
afterEach(async () => {
  const { rm } = await import('node:fs/promises');
  await Promise.all(temporary.splice(0).map((item) => rm(item, { recursive: true, force: true })));
});

describe('deterministic declarative plugin packages', () => {
  it('produces identical bytes and digest for unchanged input', () => {
    const manifest = BUNDLED_COMMUNITY_PLUGINS[0]!;
    const first = inspectPluginPackage(packageFixture(manifest));
    const second = inspectPluginPackage(packageFixture(manifest));
    expect(first.digest).toBe(second.digest);
    expect(Buffer.from(first.bytes)).toEqual(Buffer.from(second.bytes));
  });
  it('detects modified packages, wrong version, and wrong plugin id', () => {
    const bytes = packageFixture(BUNDLED_COMMUNITY_PLUGINS[0]!);
    expect(() =>
      inspectPluginPackage(Buffer.concat([Buffer.from(bytes), Buffer.from(' ')])),
    ).toThrow();
    const object = JSON.parse(Buffer.from(bytes).toString('utf8'));
    object.version = '9.9.9';
    expect(() => inspectPluginPackage(Buffer.from(`${canonicalize(object)}\n`))).toThrow(
      /identity/u,
    );
    object.version = '0.1.0';
    object.pluginId = 'evil.plugin';
    expect(() => inspectPluginPackage(Buffer.from(`${canonicalize(object)}\n`))).toThrow(
      /identity/u,
    );
  });
  it.each([
    '../evil',
    '../../escape',
    '/absolute/path',
    'C:/absolute',
    'templates/../evil',
    '.hidden',
    'templates/.hidden',
  ])('rejects malicious archive path %s', (value) =>
    expect(() => validateArchivePath(value)).toThrow(),
  );
  it.each(['symlink', 'hardlink', 'device', 'directory'])(
    'rejects unsupported archive entry type %s',
    (type) => {
      const bundle = {
        formatVersion: 1,
        pluginId: 'community.editorconfig',
        version: '0.1.0',
        files: [{ path: 'forgeki.plugin.json', type, content: '' }],
      };
      expect(() => inspectPluginPackage(Buffer.from(`${canonicalize(bundle)}\n`))).toThrow(
        /entry type/u,
      );
    },
  );
  it('rejects executable, oversized, and excessive file entries', () => {
    expect(() => validateArchivePath('templates/run.exe')).toThrow(/Executable/u);
    const manifest = BUNDLED_COMMUNITY_PLUGINS[0]!;
    const object = JSON.parse(Buffer.from(packageFixture(manifest)).toString('utf8'));
    object.files.push({
      path: 'templates/large.txt',
      type: 'file',
      content: Buffer.alloc(1024 * 1024 + 1).toString('base64'),
    });
    expect(() => inspectPluginPackage(Buffer.from(`${canonicalize(object)}\n`))).toThrow(
      /oversized/u,
    );
    object.files = Array.from({ length: 201 }, (_, index) => ({
      path: `templates/${index}.txt`,
      type: 'file',
      content: '',
    }));
    expect(() => inspectPluginPackage(Buffer.from(`${canonicalize(object)}\n`))).toThrow(
      /file count/u,
    );
  });
  it('rejects symlinks while building from disk', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'forgeki-package-'));
    temporary.push(root);
    const outside = await mkdtemp(path.join(os.tmpdir(), 'forgeki-package-target-'));
    temporary.push(outside);
    await writeFile(path.join(root, 'forgeki.plugin.json'), '{}');
    await mkdir(path.join(root, 'templates'));
    await writeFile(path.join(outside, 'outside.txt'), 'x');
    await symlink(path.join(outside, 'outside.txt'), path.join(root, 'templates', 'link.txt'));
    await expect(buildPluginPackage(root)).rejects.toThrow(/links/u);
  });
  it('rejects hard links while building from disk', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'forgeki-package-hardlink-'));
    temporary.push(root);
    await writeFile(path.join(root, 'forgeki.plugin.json'), '{}');
    await mkdir(path.join(root, 'templates'));
    await link(
      path.join(root, 'forgeki.plugin.json'),
      path.join(root, 'templates', 'duplicate.json'),
    );
    await expect(buildPluginPackage(root)).rejects.toThrow(/Hard-linked/u);
  });
});
