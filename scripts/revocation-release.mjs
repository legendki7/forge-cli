import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import process from 'node:process';
import { validateRevocations } from '../packages/marketplace/dist/index.js';

const { values } = parseArgs({
  options: { type: { type: 'string' }, value: { type: 'string' }, reason: { type: 'string' } },
});
if (!['publisher', 'publisher-key', 'plugin-version', 'package-digest'].includes(values.type))
  throw new Error('Invalid revocation type.');
if (!values.value?.trim()) throw new Error('Revocation value is required.');
if (!values.reason || values.reason.trim().length < 20)
  throw new Error('A meaningful public reason is required.');
const source = path.resolve('marketplace/source/v1/revocations.json');
const document = JSON.parse(readFileSync(source, 'utf8'));
document.revocations.push({
  type: values.type,
  value: values.value.trim(),
  reason: values.reason.trim(),
});
const validated = validateRevocations(document);
mkdirSync(path.resolve('release-staging'), { recursive: true });
writeFileSync(
  path.resolve('release-staging/revocations.json'),
  `${JSON.stringify(validated, null, 2)}\n`,
  { flag: 'wx' },
);
process.stdout.write(
  'Prepared unsigned revocation metadata for protected review. Nothing was published.\n',
);
