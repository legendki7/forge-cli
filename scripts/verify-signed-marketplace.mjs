import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import process from 'node:process';
import {
  validateMarketplaceIndex,
  validatePublisherRegistry,
  validateRevocations,
  verifySignedDocument,
} from '../packages/marketplace/dist/index.js';

const { values } = parseArgs({
  options: {
    input: { type: 'string' },
    type: { type: 'string' },
    'key-id': { type: 'string' },
    'public-key': { type: 'string' },
  },
});
for (const key of ['input', 'type', 'key-id', 'public-key']) {
  if (!values[key]) throw new Error(`Missing --${key}.`);
}
const validators = {
  index: validateMarketplaceIndex,
  publishers: validatePublisherRegistry,
  revocations: validateRevocations,
};
const validate = validators[values.type];
if (!validate) throw new Error('Invalid metadata type.');
const signed = JSON.parse(readFileSync(values.input, 'utf8'));
const document = verifySignedDocument(signed, [
  {
    id: values['key-id'],
    algorithm: 'Ed25519',
    publicKey: values['public-key'],
  },
]);
validate(document);
process.stdout.write('Marketplace metadata signature and schema verified.\n');
