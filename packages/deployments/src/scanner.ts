import { createHash } from 'node:crypto';
import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { createWorkspaceService, scanWorkspace, type ForgeWorkspace } from '@forgecli7/workspaces';
import {
  DEPLOYMENT_SCHEMA_VERSION,
  deploymentProjectFromWorkspace,
  type DeploymentProject,
  type PlannedEnvironmentVariable,
} from './model.js';

export const MAX_DEPLOYMENT_SCAN_BYTES = 256 * 1024;

export type DeploymentDriftState = 'matches' | 'modified' | 'missing' | 'unknown';

export interface DeploymentScanEvidence {
  kind:
    | 'dockerfile'
    | 'compose'
    | 'kubernetes'
    | 'environment-example'
    | 'metadata'
    | 'bundle'
    | 'target-hint'
    | 'security-warning';
  path: string;
  detail: string;
}

export interface DeploymentDriftEntry {
  path: string;
  state: DeploymentDriftState;
  expectedHash?: string;
  actualHash?: string;
}

export interface DeploymentScanResult {
  directory: string;
  project: DeploymentProject;
  evidence: DeploymentScanEvidence[];
  drift: DeploymentDriftEntry[];
  architectureFingerprint?: string;
  warnings: string[];
}

export async function scanDeploymentProject(directory: string): Promise<DeploymentScanResult> {
  const root = path.resolve(directory);
  const stat = await lstat(root);
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw new Error('Deployment scan path must be a real directory.');
  const workspace = await scanWorkspace(root);
  const project = workspace.definition.services.length
    ? deploymentProjectFromWorkspace(workspace.definition)
    : await rootProject(root);
  const evidence: DeploymentScanEvidence[] = [];
  const warnings: string[] = [...workspace.warnings];
  await collectKnown(root, '', evidence, warnings, 0);
  const metadata = await readMetadata(path.join(root, 'forgeki.deployment.json'), warnings);
  const drift: DeploymentDriftEntry[] = [];
  if (metadata) {
    evidence.push({
      kind: 'metadata',
      path: 'forgeki.deployment.json',
      detail: 'ForgeKi deployment metadata detected.',
    });
    for (const [filePath, expectedHash] of Object.entries(metadata.generatedFiles)) {
      if (!safeRelative(filePath)) {
        drift.push({ path: filePath, state: 'unknown', expectedHash });
        continue;
      }
      const file = path.join(root, ...filePath.split('/'));
      const fileStat = await safeLstat(file);
      if (!fileStat) drift.push({ path: filePath, state: 'missing', expectedHash });
      else if (
        !fileStat.isFile() ||
        fileStat.isSymbolicLink() ||
        fileStat.size > MAX_DEPLOYMENT_SCAN_BYTES
      )
        drift.push({ path: filePath, state: 'unknown', expectedHash });
      else {
        const actualHash = createHash('sha256')
          .update(await readFile(file))
          .digest('hex');
        drift.push({
          path: filePath,
          state: actualHash === expectedHash ? 'matches' : 'modified',
          expectedHash,
          actualHash,
        });
      }
    }
  }
  return {
    directory: root,
    project,
    evidence: evidence.sort((a, b) => a.path.localeCompare(b.path)),
    drift: drift.sort((a, b) => a.path.localeCompare(b.path)),
    ...(metadata ? { architectureFingerprint: metadata.architectureFingerprint } : {}),
    warnings,
  };
}

async function rootProject(root: string): Promise<DeploymentProject> {
  const manifest = await readJson(path.join(root, 'package.json'));
  if (!isRecord(manifest)) throw new Error('No supported project or workspace could be detected.');
  const dependencies = new Set([
    ...Object.keys(isRecord(manifest.dependencies) ? manifest.dependencies : {}),
    ...Object.keys(isRecord(manifest.devDependencies) ? manifest.devDependencies : {}),
  ]);
  const implementation = dependencies.has('next')
    ? 'nextjs'
    : dependencies.has('vite') && dependencies.has('react')
      ? 'react-vite'
      : dependencies.has('express')
        ? 'express'
        : undefined;
  if (!implementation) throw new Error('No supported deployment framework could be detected.');
  const rawName =
    typeof manifest.name === 'string'
      ? manifest.name.replace(/^@[^/]+\//u, '')
      : path.basename(root);
  const name = safeName(rawName);
  const scripts = isRecord(manifest.scripts) ? manifest.scripts : {};
  const packageManager = readPackageManager(manifest.packageManager);
  const service = createWorkspaceService(implementation, name, {
    port: implementation === 'react-vite' ? 5173 : implementation === 'express' ? 4000 : 3000,
  });
  const nextConfig =
    implementation === 'nextjs'
      ? await readOptionalText(root, ['next.config.js', 'next.config.mjs', 'next.config.ts'])
      : undefined;
  const workspace: ForgeWorkspace = {
    schemaVersion: 1,
    id: name,
    name,
    packageManager,
    services: [{ ...service, path: '.' }],
    connections: [],
    tooling: {
      initializeGit: Boolean(await safeLstat(path.join(root, '.git'))),
      docker: Boolean(await safeLstat(path.join(root, 'Dockerfile'))),
      githubActions: Boolean(await safeLstat(path.join(root, '.github', 'workflows'))),
    },
  };
  const base = deploymentProjectFromWorkspace({ ...workspace, services: [service] });
  return {
    ...base,
    services: [
      {
        ...base.services[0]!,
        path: '.',
        ...(typeof scripts.build === 'string' ? { buildScript: 'build' } : {}),
        ...(typeof scripts.start === 'string' ? { startScript: 'start' } : {}),
        ...(implementation === 'react-vite' ||
        (nextConfig?.includes('output') && nextConfig.includes('export'))
          ? { staticExportCompatible: true }
          : {}),
      },
    ],
    variables: await scanExampleVariables(root, name),
  };
}

async function scanExampleVariables(
  root: string,
  owner: string,
): Promise<PlannedEnvironmentVariable[]> {
  const files = [
    '.env.example',
    '.env.local.example',
    '.env.staging.example',
    '.env.production.example',
  ];
  const variables = new Map<string, PlannedEnvironmentVariable>();
  for (const file of files) {
    const text = await boundedText(path.join(root, file));
    if (!text) continue;
    const profile = file.includes('production')
      ? 'production'
      : file.includes('staging')
        ? 'staging'
        : 'local';
    for (const line of text.split(/\r?\n/u)) {
      const match = /^([A-Z_][A-Z0-9_]*)=/u.exec(line.trim());
      if (!match) continue;
      const name = match[1]!;
      const publicVariable = /^(?:NEXT_PUBLIC_|VITE_|PUBLIC_)/u.test(name);
      const secret = /(?:SECRET|PASSWORD|TOKEN|PRIVATE|DATABASE_URL)/u.test(name);
      const existing = variables.get(name);
      if (existing) {
        if (!existing.profiles.includes(profile)) existing.profiles.push(profile);
      } else {
        variables.set(name, {
          name,
          owner: `service:${owner}`,
          description: `Detected from ${file}.`,
          required: true,
          secret,
          browserVisible: publicVariable,
          profiles: [profile],
          ...(secret ? {} : { exampleValue: '' }),
        });
      }
    }
  }
  return [...variables.values()].sort((a, b) => a.name.localeCompare(b.name));
}

async function collectKnown(
  root: string,
  relative: string,
  evidence: DeploymentScanEvidence[],
  warnings: string[],
  depth: number,
): Promise<void> {
  if (depth > 4) return;
  const directory = path.join(root, ...relative.split('/').filter(Boolean));
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isSymbolicLink() || ['node_modules', '.git', 'dist', 'target'].includes(entry.name))
      continue;
    const rel = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (entry.name === 'forgeki-deployment' || entry.name === 'deployment')
        evidence.push({
          kind: 'bundle',
          path: rel,
          detail: 'Deployment bundle directory detected.',
        });
      await collectKnown(root, rel, evidence, warnings, depth + 1);
      continue;
    }
    const kind = classify(entry.name, rel);
    if (!kind) continue;
    const stat = await lstat(path.join(root, ...rel.split('/')));
    if (stat.size > MAX_DEPLOYMENT_SCAN_BYTES) {
      warnings.push(`${rel} exceeds the safe deployment scan size and was not parsed.`);
      continue;
    }
    evidence.push({ kind, path: rel, detail: `${label(kind)} detected.` });
    if (kind === 'compose' || kind === 'kubernetes') {
      const yaml = await readFile(path.join(root, ...rel.split('/')), 'utf8');
      if (/!!|!<|(?:^|\s)!\w/mu.test(yaml)) {
        evidence.push({
          kind: 'security-warning',
          path: rel,
          detail: 'Custom YAML tags were not parsed and require manual review.',
        });
        warnings.push(`${rel} contains unsupported custom YAML tags.`);
      }
    }
  }
}

function classify(name: string, rel: string): DeploymentScanEvidence['kind'] | undefined {
  if (/^Dockerfile(?:\.|$)/u.test(name)) return 'dockerfile';
  if (
    /^(?:docker-)?compose(?:\.[a-z]+)?\.ya?ml$/u.test(name) ||
    /^docker-compose(?:\.[a-z]+)?\.ya?ml$/u.test(name)
  )
    return 'compose';
  if (
    /\.ya?ml$/u.test(name) &&
    (rel.startsWith('k8s/') || /(?:deployment|service|configmap|pvc)/u.test(name))
  )
    return 'kubernetes';
  if (/^\.env(?:\.[a-z]+)?\.example$/u.test(name)) return 'environment-example';
  if (name === 'forgeki.deployment.json') return 'metadata';
  if (name === 'DEPLOYMENT.md' || name === 'forgeki.node-server.json' || name === 'static.json')
    return 'target-hint';
  return undefined;
}

function label(kind: DeploymentScanEvidence['kind']): string {
  return {
    dockerfile: 'Dockerfile',
    compose: 'Docker Compose configuration',
    kubernetes: 'Kubernetes manifest',
    'environment-example': 'Environment example',
    metadata: 'Deployment metadata',
    bundle: 'Deployment bundle',
    'target-hint': 'Deployment target hint',
    'security-warning': 'YAML security warning',
  }[kind];
}

async function readMetadata(
  file: string,
  warnings: string[],
): Promise<
  { architectureFingerprint: string; generatedFiles: Record<string, string> } | undefined
> {
  const value = await readJson(file);
  if (value === undefined) return undefined;
  if (
    !isRecord(value) ||
    value.schemaVersion !== DEPLOYMENT_SCHEMA_VERSION ||
    typeof value.architectureFingerprint !== 'string' ||
    !isRecord(value.generatedFiles) ||
    Object.values(value.generatedFiles).some(
      (hash) => typeof hash !== 'string' || !/^[a-f0-9]{64}$/u.test(hash),
    )
  ) {
    warnings.push('forgeki.deployment.json is invalid and was ignored for drift comparison.');
    return undefined;
  }
  return {
    architectureFingerprint: value.architectureFingerprint,
    generatedFiles: value.generatedFiles as Record<string, string>,
  };
}

async function readJson(file: string): Promise<unknown | undefined> {
  const text = await boundedText(file);
  if (text === undefined) return undefined;
  return JSON.parse(text) as unknown;
}

async function boundedText(file: string): Promise<string | undefined> {
  const stat = await safeLstat(file);
  if (!stat) return undefined;
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Unsafe file encountered: ${file}.`);
  if (stat.size > MAX_DEPLOYMENT_SCAN_BYTES)
    throw new Error(`File exceeds ${MAX_DEPLOYMENT_SCAN_BYTES} bytes: ${file}.`);
  return readFile(file, 'utf8');
}

async function readOptionalText(root: string, names: string[]): Promise<string | undefined> {
  for (const name of names) {
    const text = await boundedText(path.join(root, name));
    if (text !== undefined) return text;
  }
  return undefined;
}

async function safeLstat(file: string) {
  try {
    return await lstat(file);
  } catch (error) {
    if (isRecord(error) && error.code === 'ENOENT') return undefined;
    throw error;
  }
}

function readPackageManager(value: unknown): DeploymentProject['packageManager'] {
  const manager = typeof value === 'string' ? value.split('@')[0] : 'pnpm';
  return manager === 'npm' || manager === 'yarn' || manager === 'bun' ? manager : 'pnpm';
}

function safeName(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9-]+/gu, '-')
      .replace(/^-+|-+$/gu, '')
      .slice(0, 48) || 'project'
  );
}

function safeRelative(value: string): boolean {
  return (
    value.length > 0 &&
    value === value.replaceAll('\\', '/') &&
    !value.startsWith('/') &&
    !/^[A-Za-z]:/u.test(value) &&
    value.split('/').every((part) => part && part !== '.' && part !== '..')
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
