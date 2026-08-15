import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import {
  canonicalize,
  MarketplaceError,
  type MarketplacePluginEntry,
  type SignedDocument,
} from './model.js';

export interface TrustedRootKey {
  id: string;
  algorithm: 'Ed25519';
  publicKey: string;
}

export function sha256(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function signCanonical(document: unknown, privateKey: string): string {
  return sign(null, Buffer.from(canonicalize(document)), importPrivateKey(privateKey)).toString(
    'base64',
  );
}
export const signCanonicalForFixture = signCanonical;

export function verifySignedDocument<T>(
  signed: SignedDocument<T>,
  roots: readonly TrustedRootKey[],
): T {
  const root = roots.find(({ id }) => id === signed.keyId);
  if (
    !root ||
    root.algorithm !== 'Ed25519' ||
    !verifyBytes(canonicalize(signed.document), signed.signature, root.publicKey)
  ) {
    throw new MarketplaceError(
      'INVALID_SIGNATURE',
      'Marketplace metadata signature verification failed.',
    );
  }
  return signed.document;
}

export function pluginSignaturePayload(
  entry: Pick<
    MarketplacePluginEntry,
    'id' | 'version' | 'publisherId' | 'publisherKeyId' | 'packageSha256'
  >,
): string {
  return canonicalize({
    id: entry.id,
    packageSha256: entry.packageSha256,
    publisherId: entry.publisherId,
    publisherKeyId: entry.publisherKeyId,
    version: entry.version,
  });
}

export function verifyPluginSignature(entry: MarketplacePluginEntry, publicKey: string): void {
  if (!verifyBytes(pluginSignaturePayload(entry), entry.signature, publicKey))
    throw new MarketplaceError(
      'INVALID_SIGNATURE',
      'Plugin publisher signature verification failed.',
    );
}

export function verifyBytes(
  bytes: Uint8Array | string,
  signature: string,
  publicKey: string,
): boolean {
  try {
    return verify(
      null,
      Buffer.from(bytes),
      importPublicKey(publicKey),
      Buffer.from(signature, 'base64'),
    );
  } catch {
    return false;
  }
}

export function signBytes(bytes: Uint8Array | string, privateKey: string): string {
  return sign(null, Buffer.from(bytes), importPrivateKey(privateKey)).toString('base64');
}
export const signBytesForFixture = signBytes;

function publicKey(value: string) {
  return createPublicKey({ key: Buffer.from(value, 'base64'), format: 'der', type: 'spki' });
}
function privateKey(value: string) {
  return createPrivateKey({ key: Buffer.from(value, 'base64'), format: 'der', type: 'pkcs8' });
}
function importPublicKey(value: string) {
  return publicKey(value);
}
function importPrivateKey(value: string) {
  return privateKey(value);
}
