import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { URL } from 'node:url';

const publicKey = process.env.FORGEKI_TAURI_UPDATER_PUBLIC_KEY?.trim();
const endpoint = process.env.FORGEKI_TAURI_UPDATER_ENDPOINT?.trim();
if (!publicKey || !endpoint) {
  throw new Error('Owner-supplied updater public key and endpoint are required.');
}
const parsed = new URL(endpoint);
if (parsed.protocol !== 'https:') throw new Error('The updater endpoint must use HTTPS.');
const output = path.resolve('release-staging/tauri.release.conf.json');
mkdirSync(path.dirname(output), { recursive: true });
writeFileSync(
  output,
  `${JSON.stringify(
    {
      bundle: { createUpdaterArtifacts: true },
      plugins: { updater: { pubkey: publicKey, endpoints: [endpoint] } },
    },
    null,
    2,
  )}\n`,
  { encoding: 'utf8', mode: 0o600 },
);
process.stdout.write('Prepared owner-configured Tauri updater overlay.\n');
