import {
  compareVersions,
  MarketplaceError,
  validateUpdateMetadata,
  type ApplicationUpdateCheck,
  type ApplicationUpdateMetadata,
  type SignedDocument,
  type UpdateChannel,
} from './model.js';
import { sha256, verifyBytes, verifySignedDocument, type TrustedRootKey } from './crypto.js';

export interface UpdateProvider {
  readonly configured: boolean;
  check(channel: UpdateChannel): Promise<SignedDocument<unknown> | undefined>;
  download?(metadata: ApplicationUpdateMetadata): Promise<Uint8Array>;
}

export class UnconfiguredUpdateProvider implements UpdateProvider {
  readonly configured = false;
  async check(): Promise<undefined> {
    return undefined;
  }
}

export class ApplicationUpdateService {
  constructor(
    private readonly provider: UpdateProvider,
    private readonly roots: readonly TrustedRootKey[],
  ) {}
  async check(currentVersion: string, channel: UpdateChannel): Promise<ApplicationUpdateCheck> {
    if (!this.provider.configured)
      return {
        configured: false,
        channel,
        currentVersion,
        state: 'unconfigured',
        signatureStatus: 'unavailable',
        message: 'Update service not configured.',
      };
    try {
      const signed = await this.provider.check(channel);
      if (!signed)
        return {
          configured: true,
          channel,
          currentVersion,
          state: 'no-update',
          signatureStatus: 'verified',
          message: 'No update is available.',
        };
      const metadata = validateUpdateMetadata(verifySignedDocument(signed, this.roots));
      if (metadata.channel !== channel || Date.parse(metadata.expiresAt) <= Date.now())
        throw new MarketplaceError(
          'INVALID_SCHEMA',
          'Update metadata is expired or for another channel.',
        );
      const available = compareVersions(metadata.version, currentVersion) > 0;
      return {
        configured: true,
        channel,
        currentVersion,
        state: available ? 'available' : 'no-update',
        signatureStatus: 'verified',
        latestVersion: metadata.version,
        releaseNotes: metadata.releaseNotes,
        packageSize: metadata.packageSize,
        message: available
          ? 'A verified update is available. Download and installation require confirmation.'
          : 'ForgeKi is up to date.',
      };
    } catch {
      return {
        configured: true,
        channel,
        currentVersion,
        state: 'invalid',
        signatureStatus: 'invalid',
        message: 'Update metadata could not be verified.',
      };
    }
  }
  async verifyDownloadedArtifact(
    metadata: ApplicationUpdateMetadata,
    bytes: Uint8Array,
    artifactPublicKey: string,
  ): Promise<void> {
    if (bytes.byteLength !== metadata.packageSize)
      throw new MarketplaceError(
        'DIGEST_MISMATCH',
        'Update artifact size does not match signed metadata.',
      );
    if (sha256(bytes) !== metadata.artifactSha256)
      throw new MarketplaceError(
        'DIGEST_MISMATCH',
        'Update artifact digest does not match signed metadata.',
      );
    if (!verifyBytes(bytes, metadata.artifactSignature, artifactPublicKey))
      throw new MarketplaceError(
        'INVALID_SIGNATURE',
        'Update artifact signature verification failed.',
      );
  }
  async prepareVerifiedArtifact(
    metadata: ApplicationUpdateMetadata,
    artifactPublicKey: string,
    userConfirmed = false,
  ): Promise<Uint8Array> {
    if (!userConfirmed)
      throw new MarketplaceError(
        'CONFIRMATION_REQUIRED',
        'Downloading a verified update requires user confirmation.',
      );
    if (!this.provider.download)
      throw new MarketplaceError('UNCONFIGURED', 'Update artifact download is not configured.');
    const bytes = await this.provider.download(metadata);
    await this.verifyDownloadedArtifact(metadata, bytes, artifactPublicKey);
    return bytes;
  }
}
