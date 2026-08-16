import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createChecksums,
  createGithubReleasePlan,
  createReleaseManifest,
  createUpdaterMetadata,
  orderPackages,
  validateDistTag,
  validateReleaseVersion,
  assertProductionSigningKey,
  auditPrivateReleaseMaterial,
} from '../scripts/beta-release.mjs';
import { formatMarkdownTable } from '../scripts/beta-verify.mjs';

const temporary: string[] = [];
afterEach(async () =>
  Promise.all(temporary.splice(0).map((item) => rm(item, { recursive: true, force: true }))),
);

describe('Phase 7 beta release model', () => {
  it('generates Prettier-stable release report tables', () => {
    expect(
      formatMarkdownTable(
        ['Artifact', 'Size'],
        [
          ['`installer.exe`', '18.62 MiB'],
          ['`manifest.json`', '0.01 MiB'],
        ],
        new Set([1]),
      ),
    ).toBe(
      [
        '| Artifact        |      Size |',
        '| --------------- | --------: |',
        '| `installer.exe` | 18.62 MiB |',
        '| `manifest.json` |  0.01 MiB |',
      ].join('\n'),
    );
  });

  it('enforces beta semantic versions and dist-tags', () => {
    expect(validateReleaseVersion('0.2.0-beta.0')).toBe('0.2.0-beta.0');
    expect(() => validateReleaseVersion('0.2.0')).toThrow('Invalid beta');
    expect(() => validateReleaseVersion('beta')).toThrow('Invalid beta');
    expect(() => validateDistTag('beta', 'latest')).toThrow();
    expect(() => validateDistTag('beta', 'beta')).not.toThrow();
  });

  it('orders internal packages before dependents and models partial publication safely', () => {
    const ordered = orderPackages([
      { name: '@forgecli7/cli', dependencies: { '@forgecli7/core': '^1' } },
      { name: '@forgecli7/core' },
    ]);
    expect(ordered.map(({ name }) => name)).toEqual(['@forgecli7/core', '@forgecli7/cli']);
    const published = new Set(['@forgecli7/core']);
    expect(ordered.filter(({ name }) => !published.has(name)).map(({ name }) => name)).toEqual([
      '@forgecli7/cli',
    ]);
  });

  it('derives deterministic size, digest, and checksums from artifact bytes without paths', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'forgeki-manifest-'));
    temporary.push(root);
    await writeFile(path.join(root, 'ForgeKi_0.2.0-beta.0_x64-setup.exe'), 'installer');
    const input = {
      root,
      version: '0.2.0-beta.0',
      channel: 'beta',
      commit: '691e1b4b5f9c8629771243e67a6487a9fee60777',
      artifacts: [
        {
          file: 'ForgeKi_0.2.0-beta.0_x64-setup.exe',
          filename: 'ForgeKi_0.2.0-beta.0_x64-setup.exe',
          platform: 'windows',
          architecture: 'x86_64',
          type: 'nsis',
        },
      ],
    } as const;
    const first = createReleaseManifest(input);
    expect(first).toEqual(createReleaseManifest(input));
    expect(first.artifacts[0]).toMatchObject({
      size: 9,
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
    });
    expect(JSON.stringify(first)).not.toContain(root);
    expect(createChecksums(first)).toContain('ForgeKi_0.2.0-beta.0_x64-setup.exe');
  });

  it('rejects malformed, unsigned, or arbitrary updater metadata', () => {
    const base = {
      version: '0.2.0-beta.0',
      channel: 'beta',
      notes: 'Beta',
      signature: 'signed',
    } as const;
    expect(() =>
      createUpdaterMetadata({ ...base, artifactUrl: 'http://github.com/a/b.exe' }),
    ).toThrow('HTTPS');
    expect(() =>
      createUpdaterMetadata({ ...base, artifactUrl: 'https://attacker.invalid/a.exe' }),
    ).toThrow('approved');
    expect(() =>
      createUpdaterMetadata({ ...base, signature: '', artifactUrl: 'https://github.com/a/b.exe' }),
    ).toThrow('signature');
    expect(
      createUpdaterMetadata({
        ...base,
        artifactUrl: 'https://github.com/legendki7/forge-cli/releases/download/v/a.exe',
      }).platforms,
    ).toHaveProperty('windows-x86_64');
  });

  it('plans a GitHub prerelease with only intentional assets', () => {
    const assets = [
      'ForgeKi_0.2.0-beta.0_x64-setup.exe',
      'SHA256SUMS.txt',
      'release-manifest.json',
      'forgeki-sbom.cdx.json',
      'THIRD_PARTY_NOTICES.md',
    ];
    expect(createGithubReleasePlan('0.2.0-beta.0', assets)).toMatchObject({
      prerelease: true,
      latest: false,
    });
    expect(() =>
      createGithubReleasePlan('0.2.0-beta.0', [...assets, 'forgeki-worker.exe']),
    ).toThrow('Internal');
  });

  it('fails closed for missing or test Marketplace production keys', () => {
    expect(() => assertProductionSigningKey('')).toThrow('required');
    expect(() => assertProductionSigningKey(`TEST_${'PRIVATE'}_KEY=${'a'.repeat(64)}`)).toThrow(
      'Test',
    );
    expect(() =>
      assertProductionSigningKey('a'.repeat(64), 'packages/marketplace/src/fixtures/test-keys.ts'),
    ).toThrow('Test');
  });

  it('detects certificate/private-key files in a release source tree', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'forgeki-key-audit-'));
    temporary.push(root);
    await writeFile(path.join(root, 'windows-signing.pfx'), 'not a real certificate');
    expect(auditPrivateReleaseMaterial(root)).toEqual(['windows-signing.pfx']);
  });
});
