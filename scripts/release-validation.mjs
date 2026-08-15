import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

export const publishablePackages = [
  'packages/core',
  'packages/plugin-sdk',
  'packages/plugins/plugin-docker',
  'packages/plugins/plugin-github-actions',
  'packages/templates',
  'packages/workspaces',
  'packages/deployments',
  'packages/marketplace',
  'packages/plugins',
  'packages/cli',
];

export const requiredCliFiles = [
  'package/package.json',
  'package/dist/index.js',
  'package/dist/index.d.ts',
  'package/README.md',
  'package/LICENSE',
];

const forbiddenPatterns = [
  /^package\/src\//,
  /^package\/tests?\//,
  /^package\/coverage\//,
  /^package\/.changeset\//,
  /(?:^|\/)node_modules\//,
  /\.test\.[cm]?[jt]sx?$/,
];

export function validateTarballEntries(entries, required = requiredCliFiles) {
  const normalized = entries.map((entry) => entry.replaceAll('\\', '/'));
  const missing = required.filter((file) => !normalized.includes(file));
  const forbidden = normalized.filter((file) =>
    forbiddenPatterns.some((pattern) => pattern.test(file)),
  );
  if (missing.length > 0 || forbidden.length > 0) {
    throw new Error(
      [
        missing.length > 0 ? `Missing required package files: ${missing.join(', ')}` : '',
        forbidden.length > 0 ? `Development files included: ${forbidden.join(', ')}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }
}

export function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
    shell: process.platform === 'win32' && command.endsWith('.cmd'),
    env: { ...process.env, ...options.env },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed with exit code ${result.status}.\n${result.stderr ?? ''}`,
    );
  }
  return result.stdout ?? '';
}

export function packWorkspace(root, destination, { build = true } = {}) {
  const pnpmScript = process.env.npm_execpath;
  const useCurrentPnpm = pnpmScript && path.basename(pnpmScript).toLowerCase().includes('pnpm');
  const pnpm = useCurrentPnpm
    ? { command: process.execPath, prefix: [pnpmScript] }
    : { command: process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', prefix: [] };
  if (build) run(pnpm.command, [...pnpm.prefix, 'build'], { cwd: root });
  const archives = [];
  for (const packageDirectory of publishablePackages) {
    const before = new Set(readdirSync(destination));
    run(pnpm.command, [...pnpm.prefix, 'pack', '--pack-destination', destination], {
      cwd: path.join(root, packageDirectory),
      capture: true,
    });
    const archive = readdirSync(destination).find(
      (file) => file.endsWith('.tgz') && !before.has(file),
    );
    if (!archive) throw new Error(`pnpm pack did not create an archive for ${packageDirectory}.`);
    archives.push(path.join(destination, archive));
  }
  return archives;
}

export function listTarball(archive) {
  return run('tar', ['-tf', archive], { capture: true })
    .split(/\r?\n/u)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function readTarballFile(archive, file) {
  return run('tar', ['-xOf', archive, file], { capture: true });
}

export function validatePackedWorkspace(archives) {
  for (const archive of archives) {
    const entries = listTarball(archive);
    const metadata = JSON.parse(readTarballFile(archive, 'package/package.json'));
    const isCli = metadata.bin?.forge === './dist/index.js';
    validateTarballEntries(
      entries,
      isCli ? requiredCliFiles : ['package/package.json', 'package/dist/index.js'],
    );
    const serialized = JSON.stringify(metadata.dependencies ?? {});
    if (serialized.includes('workspace:')) {
      throw new Error(`${metadata.name} contains an unresolved workspace dependency.`);
    }
    if (isCli) {
      if (metadata.bin?.forge !== './dist/index.js') {
        throw new Error('The packed CLI does not map the forge executable to dist/index.js.');
      }
      const executable = readTarballFile(archive, 'package/dist/index.js');
      if (!executable.startsWith('#!/usr/bin/env node')) {
        throw new Error('The packed CLI executable is missing its Node.js shebang.');
      }
    }
  }
}
