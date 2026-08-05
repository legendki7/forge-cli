import { existsSync, readFileSync } from 'node:fs';
import console from 'node:console';
import path from 'node:path';

const appRoot = path.resolve(import.meta.dirname, '..');
const tauriRoot = path.join(appRoot, 'src-tauri');
const packageMetadata = JSON.parse(readFileSync(path.join(appRoot, 'package.json'), 'utf8'));
const cargoMetadata = readFileSync(path.join(tauriRoot, 'Cargo.toml'), 'utf8');
const config = JSON.parse(readFileSync(path.join(tauriRoot, 'tauri.conf.json'), 'utf8'));
const capability = JSON.parse(
  readFileSync(path.join(tauriRoot, 'capabilities', 'default.json'), 'utf8'),
);
const rustBridge = readFileSync(path.join(tauriRoot, 'src', 'lib.rs'), 'utf8');
const failures = [];

if (config.productName !== 'ForgeKi') failures.push('productName must be ForgeKi.');
if (config.identifier !== 'com.legendki7.forgeki') failures.push('identifier is incorrect.');
if (config.app?.windows?.[0]?.title !== 'ForgeKi') failures.push('window title must be ForgeKi.');
if (config.version !== packageMetadata.version) {
  failures.push('Tauri and desktop package versions must match.');
}
if (
  !new RegExp(`^version = "${config.version.replaceAll('.', '\\.')}"$`, 'mu').test(cargoMetadata)
) {
  failures.push('Tauri and Cargo package versions must match.');
}
if (packageMetadata.repository?.url !== 'git+https://github.com/legendki7/forge-cli.git') {
  failures.push('desktop repository metadata is incorrect.');
}
if (!/^repository = "https:\/\/github\.com\/legendki7\/forge-cli"$/mu.test(cargoMetadata)) {
  failures.push('Cargo repository metadata is incorrect.');
}
if (!config.bundle?.externalBin?.includes('binaries/forgeki-worker')) {
  failures.push('the fixed ForgeKi worker sidecar must be bundled.');
}
if (capability.permissions.some((permission) => String(permission).startsWith('shell:'))) {
  failures.push('the frontend must not receive shell permissions.');
}
if (capability.permissions.some((permission) => permission !== 'core:default')) {
  failures.push('the main window capability must remain core-only.');
}
if (!config.app?.security?.csp) failures.push('the desktop content security policy is missing.');
for (const command of [
  'select_destination',
  'create_project',
  'scan_project',
  'inspect_builtin_plugins',
  'apply_builtin_plugin',
  'check_developer_tools',
  'load_desktop_state',
  'save_desktop_state',
  'open_project_folder',
  'copy_project_path',
]) {
  if (!rustBridge.includes(command)) failures.push(`native command ${command} is missing.`);
}
if (/Command::new\s*\(\s*(?:request|path|plugin)/u.test(rustBridge)) {
  failures.push('the native bridge must not construct frontend-controlled executable commands.');
}
for (const relative of [
  'Cargo.toml',
  'src/lib.rs',
  'src/main.rs',
  'icons/icon.svg',
  'icons/icon.ico',
  'icons/icon.icns',
]) {
  if (!existsSync(path.join(tauriRoot, relative))) failures.push(`${relative} is missing.`);
}

if (failures.length) throw new Error(failures.join('\n'));
console.log('Tauri configuration and least-privilege capability checks passed.');
