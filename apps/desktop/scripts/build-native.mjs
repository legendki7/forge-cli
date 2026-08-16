import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const appRoot = path.resolve(import.meta.dirname, '..');
const repositoryRoot = path.resolve(appRoot, '..', '..');
const cargoRoot = path.resolve(process.env.CARGO_HOME ?? path.join(os.homedir(), '.cargo'));
const packageManagerCli = process.env.npm_execpath;
const releaseConfig = process.env.FORGEKI_TAURI_RELEASE_CONFIG;

if (!packageManagerCli) {
  throw new Error('The native build must be started through a pnpm workspace script.');
}

const encodedFlags = (process.env.CARGO_ENCODED_RUSTFLAGS ?? '').split('\u001f').filter(Boolean);
encodedFlags.push(
  `--remap-path-prefix=${repositoryRoot}=forgeki-source`,
  `--remap-path-prefix=${cargoRoot}=cargo-home`,
);

const args = [packageManagerCli, 'exec', 'tauri', 'build'];
if (releaseConfig) {
  const resolved = path.resolve(repositoryRoot, releaseConfig);
  if (!resolved.startsWith(`${path.join(repositoryRoot, 'release-staging')}${path.sep}`)) {
    throw new Error('The Tauri release overlay must be inside release-staging.');
  }
  args.push('--config', resolved);
}

execFileSync(process.execPath, args, {
  cwd: appRoot,
  env: {
    ...process.env,
    CARGO_ENCODED_RUSTFLAGS: encodedFlags.join('\u001f'),
  },
  stdio: 'inherit',
});
