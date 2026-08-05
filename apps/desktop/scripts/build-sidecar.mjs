import { execFileSync } from 'node:child_process';
import console from 'node:console';
import { mkdirSync, renameSync, rmSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const appRoot = path.resolve(import.meta.dirname, '..');
const binaryDirectory = path.join(appRoot, 'src-tauri', 'binaries');
const extension = process.platform === 'win32' ? '.exe' : '';
const temporaryOutput = path.join(binaryDirectory, `forgeki-worker${extension}`);
const packageManagerCli = process.env.npm_execpath;

if (!packageManagerCli) {
  throw new Error('The sidecar build must be started through a pnpm workspace script.');
}

let targetTriple;
try {
  targetTriple = execFileSync('rustc', ['--print', 'host-tuple'], { encoding: 'utf8' }).trim();
} catch {
  throw new Error(
    'Rust is required to prepare the Tauri sidecar. Install a supported Rust toolchain and retry.',
  );
}

const pkgPlatform = { win32: 'win', darwin: 'macos', linux: 'linux' }[process.platform];
const pkgArch = { x64: 'x64', arm64: 'arm64' }[process.arch];
const sidecarNodeVersion = '22.23.2';
if (!pkgPlatform || !pkgArch) {
  throw new Error(`Sidecar packaging is not configured for ${process.platform}/${process.arch}.`);
}

mkdirSync(binaryDirectory, { recursive: true });
rmSync(temporaryOutput, { force: true });
execFileSync(
  process.execPath,
  [
    packageManagerCli,
    'exec',
    'pkg',
    path.join(appRoot, 'dist-worker', 'worker.cjs'),
    '--target',
    `node${sidecarNodeVersion}-${pkgPlatform}-${pkgArch}`,
    '--output',
    temporaryOutput,
  ],
  { cwd: appRoot, stdio: 'inherit' },
);

const finalOutput = path.join(binaryDirectory, `forgeki-worker-${targetTriple}${extension}`);
rmSync(finalOutput, { force: true });
renameSync(temporaryOutput, finalOutput);
console.log(`Prepared Tauri sidecar: ${path.relative(appRoot, finalOutput)}`);
