import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { run } from './release-validation.mjs';

export const packageDirectories = [
  'packages/core',
  'packages/templates',
  'packages/plugins',
  'packages/plugins/plugin-docker',
  'packages/plugins/plugin-github-actions',
  'packages/cli',
];

const excludedDirectories = new Set(['.git', 'node_modules', 'dist', 'coverage']);
const ownershipPlaceholder = 'YOUR_GITHUB_USERNAME';
const markerPatterns = [
  ['repository owner placeholder', new RegExp(`${ownershipPlaceholder}|YOUR_USERNAME`, 'giu')],
  ['work marker', /\b(?:TODO|FIXME)\b/giu],
  ['Windows user directory', new RegExp(`C:${'\\\\'}Users${'\\\\'}`, 'giu')],
  ['macOS user directory', /\/Users\//gu],
  ['file URL', /file:\/\//giu],
  ['localhost reference', /\blocalhost\b/giu],
  ['example domain', /\bexample\.com\b/giu],
];

export function walkRepository(root) {
  const files = [];
  const pending = [root];
  while (pending.length > 0) {
    const directory = pending.pop();
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!excludedDirectories.has(entry.name)) pending.push(path.join(directory, entry.name));
      } else if (entry.isFile()) {
        files.push(path.join(directory, entry.name));
      }
    }
  }
  return files;
}

export function classifyOccurrence(relativePath, label) {
  const normalized = relativePath.replaceAll('\\', '/');
  if (normalized.startsWith('tests/')) return 'test fixture';
  if (normalized.startsWith('scripts/')) return 'internal development reference';
  if (
    (normalized === 'docs/releasing.md' || normalized === 'docs/release-candidate-report.md') &&
    label === 'repository owner placeholder'
  ) {
    return 'intentional documentation example';
  }
  if (label === 'localhost reference' || label === 'example domain') {
    return 'intentional documentation example';
  }
  return 'must be replaced before release';
}

export function scanRepositoryMarkers(root) {
  const occurrences = [];
  for (const file of walkRepository(root)) {
    let content;
    try {
      content = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const relativePath = path.relative(root, file).replaceAll('\\', '/');
    const lines = content.split(/\r?\n/u);
    for (const [index, line] of lines.entries()) {
      for (const [label, pattern] of markerPatterns) {
        pattern.lastIndex = 0;
        if (pattern.test(line)) {
          occurrences.push({
            file: relativePath,
            line: index + 1,
            label,
            classification: classifyOccurrence(relativePath, label),
          });
        }
      }
    }
  }
  return occurrences;
}

export function auditPackageMetadata(root) {
  const rootMetadata = readJson(path.join(root, 'package.json'));
  const expectedScope = '@forgecli7/';
  const expected = {
    repository: rootMetadata.repository?.url,
    homepage: rootMetadata.homepage,
    bugs: rootMetadata.bugs?.url,
    license: rootMetadata.license,
  };
  const packages = packageDirectories.map((directory) => ({
    directory,
    metadata: readJson(path.join(root, directory, 'package.json')),
  }));
  const errors = [];
  for (const { directory, metadata } of packages) {
    if (!metadata.name?.startsWith(expectedScope)) {
      errors.push(`${directory} uses inconsistent package scope: ${metadata.name ?? '(missing)'}`);
    }
    if (metadata.repository?.url !== expected.repository)
      errors.push(`${metadata.name} repository URL does not match the root metadata.`);
    if (metadata.homepage !== expected.homepage)
      errors.push(`${metadata.name} homepage does not match the root metadata.`);
    if (metadata.bugs?.url !== expected.bugs)
      errors.push(`${metadata.name} bugs URL does not match the root metadata.`);
    if (metadata.license !== expected.license)
      errors.push(`${metadata.name} license does not match the root metadata.`);
    if (metadata.author !== 'ForgeKi contributors')
      errors.push(`${metadata.name} must identify ForgeKi contributors as author.`);
    if (metadata.type !== 'module') errors.push(`${metadata.name} must declare ESM module output.`);
    for (const dependency of Object.keys(metadata.dependencies ?? {})) {
      if (dependency.startsWith('@') && !dependency.startsWith(expectedScope)) {
        errors.push(
          `${metadata.name} has an internal dependency outside ${expectedScope}: ${dependency}`,
        );
      }
    }
  }
  const cli = packages.find(({ metadata }) => metadata.name === '@forgecli7/cli')?.metadata;
  if (cli?.bin?.forge !== './dist/index.js')
    errors.push('The CLI must expose the forge executable.');
  return { scope: expectedScope, packages, errors };
}

export function auditExportMaps(root) {
  const errors = [];
  for (const directory of packageDirectories) {
    const metadata = readJson(path.join(root, directory, 'package.json'));
    const runtime = metadata.exports?.['.']?.import;
    const types = metadata.exports?.['.']?.types;
    if (runtime !== metadata.main || types !== metadata.types) {
      errors.push(`${metadata.name} export map does not match main/types metadata.`);
    }
    for (const target of [runtime, types]) {
      if (typeof target !== 'string' || target.includes('/src/') || !target.startsWith('./dist/')) {
        errors.push(`${metadata.name} has an invalid public export target: ${String(target)}`);
      } else if (!existsSync(path.join(root, directory, target))) {
        errors.push(`${metadata.name} export target is missing: ${target}`);
      }
    }
  }
  return errors;
}

export function auditGeneratedArtifacts(root) {
  const suspicious = [];
  for (const file of walkRepository(root)) {
    const relative = path.relative(root, file).replaceAll('\\', '/');
    const name = path.basename(file);
    if (
      name.endsWith('.tgz') ||
      name === '.npmrc' ||
      name === '.DS_Store' ||
      name.endsWith('.log') ||
      relative.includes('/coverage/') ||
      relative.includes('packed-installation')
    ) {
      suspicious.push(relative);
    }
  }
  return suspicious;
}

export function auditPotentialSecrets(root) {
  const findings = [];
  const fragments = ['_auth' + 'Token=', 'npm_' + '[A-Za-z0-9]{20,}', 'ghp_' + '[A-Za-z0-9]'];
  const patterns = fragments.map((fragment) => new RegExp(fragment, 'u'));
  for (const file of walkRepository(root)) {
    const relative = path.relative(root, file).replaceAll('\\', '/');
    if (relative === 'scripts/release-audit.mjs') continue;
    let content;
    try {
      content = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    if (patterns.some((pattern) => pattern.test(content))) findings.push(relative);
  }
  return findings;
}

export function inspectChangesets(root) {
  const directory = path.join(root, '.changeset');
  return readdirSync(directory)
    .filter((file) => file.endsWith('.md'))
    .sort()
    .map((file) => {
      const content = readFileSync(path.join(directory, file), 'utf8');
      const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/u.exec(content);
      if (!match) throw new Error(`Invalid Changeset frontmatter: ${file}`);
      const releases = [...match[1].matchAll(/^'([^']+)':\s*(major|minor|patch)$/gmu)].map(
        ([, name, type]) => ({ name, type }),
      );
      const summary = match[2].trim().replace(/\s+/gu, ' ');
      return {
        file,
        releases,
        summary,
        userFacing: releases.some(({ name }) => name === '@forgecli7/cli'),
      };
    });
}

export async function withTemporaryDirectory(prefix, task, dependencies = {}) {
  const create = dependencies.create ?? (() => mkdtempSync(path.join(tmpdir(), prefix)));
  const remove =
    dependencies.remove ?? ((directory) => rmSync(directory, { recursive: true, force: true }));
  const directory = create();
  try {
    return await task(directory);
  } finally {
    remove(directory);
  }
}

export async function planPrerelease(root) {
  return withTemporaryDirectory('forgecli-changesets-plan-', async (temporaryDirectory) => {
    const copy = path.join(temporaryDirectory, 'repository');
    cpSync(root, copy, {
      recursive: true,
      filter(source) {
        const name = path.basename(source);
        return !excludedDirectories.has(name) && !name.endsWith('.tgz');
      },
    });
    const changesets = path.join(root, 'node_modules', '@changesets', 'cli', 'bin.js');
    run(process.execPath, [changesets, 'pre', 'enter', 'beta'], { cwd: copy, capture: true });
    run(process.execPath, [changesets, 'version'], { cwd: copy, capture: true });
    return Object.fromEntries(
      packageDirectories.map((directory) => {
        const metadata = readJson(path.join(copy, directory, 'package.json'));
        return [metadata.name, metadata.version];
      }),
    );
  });
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}
