import { describe, expect, it } from 'vitest';
import { sha256, signBytesForFixture } from './crypto.js';
import { TestUpdateProvider } from './fixtures/index.js';
import { TEST_UPDATE_PRIVATE_KEY, TEST_UPDATE_ROOT } from './fixtures/test-keys.js';
import type { ApplicationUpdateMetadata } from './model.js';
import { ApplicationUpdateService, UnconfiguredUpdateProvider } from './updater.js';

const artifact = Buffer.from('TEST ONLY signed update artifact');
function metadata(channel: 'stable' | 'beta' = 'beta'): ApplicationUpdateMetadata {
  return {
    schemaVersion: 1,
    channel,
    version: '0.2.0-beta.1',
    releaseNotes: 'Test fixture update.',
    packageSize: artifact.byteLength,
    artifactUrl: 'https://fixtures.forgeki.invalid/update.exe',
    artifactSha256: sha256(artifact),
    artifactSignature: signBytesForFixture(artifact, TEST_UPDATE_PRIVATE_KEY),
    expiresAt: '2099-01-01T00:00:00.000Z',
  };
}

describe('secure application update checking', () => {
  it('reports production provider unconfigured and never installs silently', async () => {
    const service = new ApplicationUpdateService(new UnconfiguredUpdateProvider(), []);
    await expect(service.check('0.1.0', 'beta')).resolves.toMatchObject({
      state: 'unconfigured',
      signatureStatus: 'unavailable',
    });
    expect('install' in service).toBe(false);
  });
  it('handles no update and verified stable/beta updates', async () => {
    await expect(
      new ApplicationUpdateService(new TestUpdateProvider(), [TEST_UPDATE_ROOT]).check(
        '0.1.0',
        'beta',
      ),
    ).resolves.toMatchObject({ state: 'no-update' });
    await expect(
      new ApplicationUpdateService(new TestUpdateProvider(metadata('stable')), [
        TEST_UPDATE_ROOT,
      ]).check('0.1.0', 'stable'),
    ).resolves.toMatchObject({
      state: 'available',
      signatureStatus: 'verified',
      channel: 'stable',
    });
  });
  it('rejects invalid metadata signatures and channel mismatch', async () => {
    await expect(
      new ApplicationUpdateService(new TestUpdateProvider(metadata(), true), [
        TEST_UPDATE_ROOT,
      ]).check('0.1.0', 'beta'),
    ).resolves.toMatchObject({ state: 'invalid' });
    await expect(
      new ApplicationUpdateService(new TestUpdateProvider(metadata('stable')), [
        TEST_UPDATE_ROOT,
      ]).check('0.1.0', 'beta'),
    ).resolves.toMatchObject({ state: 'invalid' });
  });
  it('verifies artifact digest and signature before pre-install state', async () => {
    const service = new ApplicationUpdateService(new TestUpdateProvider(metadata()), [
      TEST_UPDATE_ROOT,
    ]);
    await expect(
      service.verifyDownloadedArtifact(metadata(), artifact, TEST_UPDATE_ROOT.publicKey),
    ).resolves.toBeUndefined();
    await expect(
      service.verifyDownloadedArtifact(
        metadata(),
        Buffer.from('corrupt'),
        TEST_UPDATE_ROOT.publicKey,
      ),
    ).rejects.toThrow(/size|digest/iu);
    await expect(
      service.verifyDownloadedArtifact(
        { ...metadata(), artifactSignature: 'aW52YWxpZA==' },
        artifact,
        TEST_UPDATE_ROOT.publicKey,
      ),
    ).rejects.toThrow(/signature/u);
  });
  it('requires confirmation, handles download failure, and never installs an artifact', async () => {
    const downloadable = new ApplicationUpdateService(
      new TestUpdateProvider(metadata(), false, artifact),
      [TEST_UPDATE_ROOT],
    );
    await expect(
      downloadable.prepareVerifiedArtifact(metadata(), TEST_UPDATE_ROOT.publicKey),
    ).rejects.toThrow(/confirmation/u);
    await expect(
      downloadable.prepareVerifiedArtifact(metadata(), TEST_UPDATE_ROOT.publicKey, true),
    ).resolves.toEqual(artifact);
    const failure = new ApplicationUpdateService(
      new TestUpdateProvider(metadata(), false, new Error('TEST ONLY download failure')),
      [TEST_UPDATE_ROOT],
    );
    await expect(
      failure.prepareVerifiedArtifact(metadata(), TEST_UPDATE_ROOT.publicKey, true),
    ).rejects.toThrow(/download failure/u);
    expect('install' in downloadable).toBe(false);
  });
});
