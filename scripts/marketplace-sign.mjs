import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import process from 'node:process';
import {
  signCanonical,
  validateMarketplaceIndex,
  validatePublisherRegistry,
  validateRevocations,
  validateUpdateMetadata,
} from '../packages/marketplace/dist/index.js';

const { values } = parseArgs({
  options: {
    input: { type: 'string' },
    output: { type: 'string' },
    type: { type: 'string' },
    'key-id': { type: 'string' },
    'private-key-file': { type: 'string' },
  },
  strict: true,
});

for (const required of ['input', 'output', 'type', 'key-id', 'private-key-file']) {
  if (!values[required]) throw new Error(`Missing required --${required} argument.`);
}
const validators = {
  index: validateMarketplaceIndex,
  publishers: validatePublisherRegistry,
  revocations: validateRevocations,
  update: validateUpdateMetadata,
};
const validate = validators[values.type];
if (!validate) throw new Error('--type must be index, publishers, revocations, or update.');

const document = validate(JSON.parse(readFileSync(values.input, 'utf8')));
const privateKey = readFileSync(values['private-key-file'], 'utf8').trim();
if (!privateKey) throw new Error('The explicitly supplied private-key file is empty.');
const signature = signCanonical(document, privateKey);
writeFileSync(
  values.output,
  `${JSON.stringify({ document, keyId: values['key-id'], signature }, null, 2)}\n`,
  { flag: 'wx', mode: 0o600 },
);
process.stdout.write(`Wrote signed ${values.type} metadata to the requested new output file.\n`);
