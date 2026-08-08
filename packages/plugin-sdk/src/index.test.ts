import { describe, expect, it } from 'vitest';
import {
  createPluginSafetyReport,
  defineForgeKiPlugin,
  renderPluginTemplate,
  serializePluginManifest,
  validatePluginManifest,
  type ForgeKiPluginManifest,
} from './index.js';

const valid = (): ForgeKiPluginManifest => ({
  manifestVersion: 1,
  id: 'community.editorconfig',
  name: 'EditorConfig',
  version: '0.1.0',
  description: 'Adds deterministic editor settings.',
  author: { name: 'ForgeKi examples' },
  license: 'MIT',
  homepage: 'https://github.com/legendki7/forge-cli',
  repository: 'https://github.com/legendki7/forge-cli',
  compatibility: { forgeki: '>=0.3.0' },
  supportedFrameworks: ['nextjs', 'react-vite', 'express'],
  permissions: ['project:generate-files', 'project:add-stack-components'],
  contributions: {
    stackComponents: [
      {
        id: 'editorconfig',
        name: 'EditorConfig',
        description: 'Editor consistency.',
        category: 'tooling',
        supportedFrameworks: ['nextjs', 'react-vite', 'express'],
      },
    ],
    generatedFiles: [{ path: '.editorconfig', content: 'root = true\n# {{project.name}}\n' }],
  },
});

describe('declarative plugin SDK', () => {
  it('validates and defines a strict versioned manifest', () => {
    expect(validatePluginManifest(valid())).toMatchObject({ valid: true, errors: [] });
    expect(defineForgeKiPlugin(valid()).id).toBe('community.editorconfig');
  });
  it.each([
    ['invalid id', { id: '../evil' }],
    ['invalid version', { version: 'latest' }],
    ['invalid compatibility', { compatibility: { forgeki: '*' } }],
    ['unsupported version', { manifestVersion: 2 }],
  ])('rejects %s', (_label, patch) => {
    expect(validatePluginManifest({ ...valid(), ...patch }).valid).toBe(false);
  });
  it('serializes deterministically', () => {
    expect(serializePluginManifest(valid())).toBe(
      serializePluginManifest(structuredClone(valid())),
    );
  });
  it.each(['shell', 'network', 'native-code'])(
    'rejects unsupported %s permission',
    (permission) => {
      const manifest = valid() as unknown as Record<string, unknown>;
      manifest.permissions = [permission];
      expect(createPluginSafetyReport(manifest).result).toBe('blocked');
    },
  );
  it('requires the permission associated with a contribution', () => {
    const manifest = valid();
    manifest.permissions = [];
    expect(
      validatePluginManifest(manifest).errors.some(({ code }) => code === 'PERMISSION_DENIED'),
    ).toBe(true);
  });
  it.each(['../evil.txt', 'C:\\evil.txt', 'https://evil.test/file', 'tool.exe'])(
    'rejects unsafe file %s',
    (path) => {
      const manifest = valid();
      manifest.contributions.generatedFiles = [{ path, content: 'unsafe' }];
      expect(createPluginSafetyReport(manifest).result).toBe('blocked');
    },
  );
  it.each([
    'https://example.test/pkg.tgz',
    'git+https://example.test/repo',
    'file:../pkg',
    'github:user/repo',
  ])('rejects dependency source %s', (version) => {
    const manifest = valid();
    manifest.permissions = [...manifest.permissions, 'project:add-dependencies'];
    manifest.contributions.dependencies = [{ name: 'zod', version }];
    expect(validatePluginManifest(manifest).valid).toBe(false);
  });
  it.each(['preinstall', 'install', 'postinstall', 'prepare', 'prepublishOnly'])(
    'rejects lifecycle script %s',
    (name) => {
      const manifest = valid();
      manifest.permissions = [...manifest.permissions, 'project:add-scripts'];
      manifest.contributions.scripts = { [name]: 'node setup.js' };
      expect(validatePluginManifest(manifest).valid).toBe(false);
    },
  );
  it('renders only allowlisted variables with deterministic line endings', () => {
    expect(
      renderPluginTemplate('name={{project.name}}\r\n', {
        project: { name: 'demo', framework: 'nextjs', packageManager: 'pnpm' },
      }),
    ).toBe('name=demo\n');
    expect(() =>
      renderPluginTemplate('{{process.env.SECRET}}', {
        project: { name: 'demo', framework: 'nextjs', packageManager: 'pnpm' },
      }),
    ).toThrow('Unknown template variable');
  });
  it('rejects arbitrary code fields and scanner behavior', () => {
    expect(validatePluginManifest({ ...valid(), execute: 'process.exit()' }).valid).toBe(false);
    const manifest = valid();
    manifest.permissions = [...manifest.permissions, 'project:add-scanner-rules'];
    manifest.contributions.scannerRules = [
      { id: 'bad', componentId: 'editorconfig', detect: { any: [{ shell: 'dir' } as never] } },
    ];
    expect(validatePluginManifest(manifest).valid).toBe(false);
  });
});
