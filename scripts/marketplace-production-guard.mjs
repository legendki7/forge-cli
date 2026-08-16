import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import process from 'node:process';
import { assertProductionSigningKey } from './beta-release.mjs';

const { values } = parseArgs({ options: { 'private-key-file': { type: 'string' } } });
if (!values['private-key-file']) throw new Error('Pass the protected production private-key file.');
assertProductionSigningKey(
  readFileSync(values['private-key-file'], 'utf8'),
  values['private-key-file'],
);
process.stdout.write('Production signing key passed the non-fixture guard.\n');
