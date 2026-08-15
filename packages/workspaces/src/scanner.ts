import { lstat, readFile, readdir } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import {
  MAX_WORKSPACE_BYTES,
  WORKSPACE_SCHEMA_VERSION,
  createWorkspaceConnection,
  createWorkspaceService,
  parseWorkspaceDefinition,
  type ForgeWorkspace,
  type WorkspaceEvidenceState,
  type WorkspaceService,
} from './model.js';

export interface WorkspaceScanEvidence {
  state: WorkspaceEvidenceState;
  subject: string;
  detail: string;
  path?: string;
}

export interface WorkspaceScanResult {
  directory: string;
  name: string;
  definition: ForgeWorkspace;
  evidence: WorkspaceScanEvidence[];
  warnings: string[];
  source: 'forgeki-config' | 'inferred';
}

export async function scanWorkspace(directory: string): Promise<WorkspaceScanResult> {
  const root = resolve(directory);
  const stat = await lstat(root);
  if (!stat.isDirectory()) throw new Error(`Workspace path is not a directory: ${root}`);

  const configPath = join(root, 'forgeki.workspace.json');
  const configured = await readBoundedJson(configPath);
  if (configured !== undefined) {
    const definition = parseWorkspaceDefinition(configured);
    const evidence: WorkspaceScanEvidence[] = [];
    const warnings: string[] = [];
    for (const service of definition.services) {
      const manifest = join(root, service.path, 'package.json');
      const exists =
        service.type === 'database' || service.type === 'infrastructure'
          ? await pathExists(join(root, service.path))
          : await pathExists(manifest);
      evidence.push({
        state: exists ? 'detected' : 'conflicting',
        subject: service.id,
        detail: exists
          ? `${service.implementation} path exists.`
          : 'Configured service path is missing.',
        path: service.path,
      });
      if (!exists)
        warnings.push(`Configured service ${service.name} is missing at ${service.path}.`);
    }
    return {
      directory: root,
      name: definition.name,
      definition,
      evidence,
      warnings,
      source: 'forgeki-config',
    };
  }

  const evidence: WorkspaceScanEvidence[] = [];
  const warnings: string[] = [];
  const services: WorkspaceService[] = [];
  for (const parent of ['apps', 'packages'] as const) {
    for (const child of await safeDirectories(join(root, parent))) {
      if (services.length >= 20) {
        warnings.push('Service inference stopped at the 20-service safety limit.');
        break;
      }
      const relativePath = `${parent}/${child}`;
      const manifest = await readBoundedJson(join(root, relativePath, 'package.json'));
      if (!isRecord(manifest)) continue;
      const dependencies = dependencyNames(manifest);
      const implementation = dependencies.has('next')
        ? 'nextjs'
        : dependencies.has('vite') && dependencies.has('react')
          ? 'react-vite'
          : dependencies.has('express')
            ? 'express'
            : parent === 'packages'
              ? 'shared-types'
              : undefined;
      if (!implementation) continue;
      const service = createWorkspaceService(implementation, child);
      services.push({ ...service, path: relativePath });
      evidence.push({
        state: 'detected',
        subject: service.id,
        detail: `${implementation} dependencies found.`,
        path: `${relativePath}/package.json`,
      });
    }
  }

  const compose =
    (await readBoundedText(join(root, 'docker-compose.yml'))) ??
    (await readBoundedText(join(root, 'compose.yml')));
  if (compose) {
    for (const implementation of ['postgres', 'redis'] as const) {
      if (
        !new RegExp(`(?:image|service|container_name):?[^\n]*${implementation}`, 'iu').test(
          compose,
        ) &&
        !compose.toLowerCase().includes(`${implementation}:`)
      )
        continue;
      const service = createWorkspaceService(implementation, implementation);
      if (!services.some(({ implementation: current }) => current === implementation))
        services.push(service);
      evidence.push({
        state: 'likely',
        subject: service.id,
        detail: `${implementation} appears in Docker Compose.`,
        path: 'docker-compose.yml',
      });
    }
  }

  const web = services.find(({ type }) => type === 'web');
  const api = services.find(({ type }) => type === 'api');
  const database = services.find(({ type }) => type === 'database');
  const cache = services.find(({ type }) => type === 'infrastructure');
  const shared = services.find(({ type }) => type === 'shared-package');
  const connections = [
    web && api ? createWorkspaceConnection(web.id, api.id, 'HTTP') : undefined,
    api && database ? createWorkspaceConnection(api.id, database.id, 'DATABASE') : undefined,
    api && cache ? createWorkspaceConnection(api.id, cache.id, 'CACHE') : undefined,
    web && shared ? createWorkspaceConnection(web.id, shared.id, 'SHARED_PACKAGE') : undefined,
    api && shared ? createWorkspaceConnection(api.id, shared.id, 'SHARED_PACKAGE') : undefined,
  ].filter((connection) => connection !== undefined);
  const rootManifest = await readBoundedJson(join(root, 'package.json'));
  const packageManager = detectPackageManager(rootManifest);
  const name = safeName(
    isRecord(rootManifest) && typeof rootManifest.name === 'string'
      ? rootManifest.name
      : basename(root),
  );
  if (services.length === 0) warnings.push('No supported services could be inferred.');
  return {
    directory: root,
    name,
    source: 'inferred',
    evidence,
    warnings,
    definition: {
      schemaVersion: WORKSPACE_SCHEMA_VERSION,
      id: name,
      name,
      packageManager,
      services,
      connections,
      tooling: {
        initializeGit: await pathExists(join(root, '.git')),
        docker: Boolean(compose),
        githubActions: await pathExists(join(root, '.github', 'workflows')),
      },
    },
  };
}

async function readBoundedJson(path: string): Promise<unknown | undefined> {
  const text = await readBoundedText(path);
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`Invalid JSON in ${path}.`);
  }
}

async function readBoundedText(path: string): Promise<string | undefined> {
  try {
    const stat = await lstat(path);
    if (!stat.isFile()) return undefined;
    if (stat.size > MAX_WORKSPACE_BYTES)
      throw new Error(`File exceeds ${MAX_WORKSPACE_BYTES} bytes: ${path}`);
    return await readFile(path, 'utf8');
  } catch (error) {
    if (isNotFound(error)) return undefined;
    throw error;
  }
}

async function safeDirectories(path: string): Promise<string[]> {
  try {
    const entries = await readdir(path, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
      .map(({ name }) => name)
      .sort();
  } catch (error) {
    if (isNotFound(error)) return [];
    throw error;
  }
}

function dependencyNames(manifest: Record<string, unknown>): Set<string> {
  const result = new Set<string>();
  for (const key of ['dependencies', 'devDependencies']) {
    const value = manifest[key];
    if (isRecord(value)) for (const name of Object.keys(value)) result.add(name);
  }
  return result;
}

function detectPackageManager(manifest: unknown): ForgeWorkspace['packageManager'] {
  if (isRecord(manifest) && typeof manifest.packageManager === 'string') {
    const value = manifest.packageManager.split('@')[0];
    if (value === 'npm' || value === 'yarn' || value === 'bun' || value === 'pnpm') return value;
  }
  return 'pnpm';
}

function safeName(value: string): string {
  const candidate = value
    .toLowerCase()
    .replace(/^@[^/]+\//u, '')
    .replace(/[^a-z0-9-]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 50);
  return candidate || 'workspace';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNotFound(error: unknown): boolean {
  return isRecord(error) && error.code === 'ENOENT';
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (isNotFound(error)) return false;
    throw error;
  }
}
