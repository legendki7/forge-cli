import { createPrivateKey, createPublicKey } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import {
  signCanonical,
  validateMarketplaceIndex,
  validatePublisherRegistry,
  validateRevocations,
  verifySignedDocument,
} from '../packages/marketplace/dist/index.js';
import { assertProductionSigningKey } from './beta-release.mjs';

const { values } = parseArgs({
  options: {
    source: { type: 'string' },
    output: { type: 'string' },
    'private-key-file': { type: 'string' },
    'key-id': { type: 'string' },
  },
});
for (const key of ['source', 'output', 'private-key-file', 'key-id']) {
  if (!values[key]) throw new Error(`Missing --${key}.`);
}
const privateKey = readFileSync(values['private-key-file'], 'utf8').trim();
assertProductionSigningKey(privateKey, values['private-key-file']);
const publicKey = createPublicKey(
  createPrivateKey({
    key: Buffer.from(privateKey, 'base64'),
    format: 'der',
    type: 'pkcs8',
  }),
)
  .export({ format: 'der', type: 'spki' })
  .toString('base64');
const roots = [{ id: values['key-id'], algorithm: 'Ed25519', publicKey }];
const documents = [
  ['index', validateMarketplaceIndex],
  ['publishers', validatePublisherRegistry],
  ['revocations', validateRevocations],
];
mkdirSync(values.output, { recursive: true });
for (const [name, validate] of documents) {
  const document = validate(
    JSON.parse(readFileSync(path.join(values.source, `${name}.json`), 'utf8')),
  );
  const signed = {
    document,
    keyId: values['key-id'],
    signature: signCanonical(document, privateKey),
  };
  verifySignedDocument(signed, roots);
  writeFileSync(path.join(values.output, `${name}.json`), `${JSON.stringify(signed, null, 2)}\n`, {
    flag: 'wx',
  });
}
process.stdout.write(
  'Signed and self-verified Marketplace metadata. No hosting upload was performed.\n',
);
