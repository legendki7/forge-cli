import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { validateReleaseVersion } from './beta-release.mjs';

export function syncDesktopVersion(root, version) {
  validateReleaseVersion(version, 'beta');
  const desktopFile = path.join(root, 'apps/desktop/package.json');
  const tauriFile = path.join(root, 'apps/desktop/src-tauri/tauri.conf.json');
  const cargoFile = path.join(root, 'apps/desktop/src-tauri/Cargo.toml');
  for (const file of [desktopFile, tauriFile]) {
    const value = JSON.parse(readFileSync(file, 'utf8'));
    value.version = version;
    writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  }
  const cargo = readFileSync(cargoFile, 'utf8').replace(
    /^(\[package\][\s\S]*?^version\s*=\s*)"[^"]+"/mu,
    `$1"${version}"`,
  );
  writeFileSync(cargoFile, cargo, 'utf8');
}

const script = fileURLToPath(import.meta.url);
if (path.resolve(process.argv[1] ?? '') === script) {
  const { values } = parseArgs({ options: { version: { type: 'string' } } });
  if (!values.version) throw new Error('Pass --version <x.y.z-beta.n>.');
  syncDesktopVersion(path.resolve(path.dirname(script), '..'), values.version);
}
