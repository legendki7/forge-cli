import { chmod, lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { validatePluginManifest, type ForgeKiPluginManifest } from '@forgecli7/plugin-sdk';
import { canonicalize, MARKETPLACE_LIMITS, MarketplaceError } from './model.js';
import { sha256 } from './crypto.js';

export interface PluginPackageEntry {
  path: string;
  type: 'file';
  content: string;
}
export interface ForgeKiPluginPackage {
  formatVersion: 1;
  pluginId: string;
  version: string;
  files: PluginPackageEntry[];
}
export interface InspectedPluginPackage {
  package: ForgeKiPluginPackage;
  manifest: ForgeKiPluginManifest;
  files: Array<{ path: string; bytes: number }>;
  digest: string;
  bytes: Uint8Array;
}

const executableExtensions = new Set([
  '.exe',
  '.dll',
  '.com',
  '.bat',
  '.cmd',
  '.ps1',
  '.sh',
  '.so',
  '.dylib',
  '.node',
  '.msi',
  '.scr',
]);
const allowedRootFiles = new Set(['forgeki.plugin.json', 'README.md']);

export async function buildPluginPackage(directory: string): Promise<InspectedPluginPackage> {
  const root = path.resolve(directory);
  const stat = await lstat(root).catch(() => undefined);
  if (!stat?.isDirectory() || stat.isSymbolicLink())
    unsafe('Plugin source must be a regular directory.');
  const paths = await collect(root, root);
  if (!paths.includes('forgeki.plugin.json'))
    unsafe('Plugin package requires forgeki.plugin.json.');
  const files: PluginPackageEntry[] = [];
  for (const relative of paths.sort()) {
    const bytes = await readFile(path.join(root, ...relative.split('/')));
    files.push({ path: relative, type: 'file', content: bytes.toString('base64') });
  }
  const manifest = parseManifest(
    Buffer.from(files.find(({ path: file }) => file === 'forgeki.plugin.json')!.content, 'base64'),
  );
  return inspectPluginPackage(
    encodePackage({ formatVersion: 1, pluginId: manifest.id, version: manifest.version, files }),
  );
}

export function encodePackage(bundle: ForgeKiPluginPackage): Uint8Array {
  return Buffer.from(`${canonicalize(bundle)}\n`, 'utf8');
}

export function inspectPluginPackage(bytes: Uint8Array): InspectedPluginPackage {
  if (bytes.byteLength > MARKETPLACE_LIMITS.packageBytes)
    unsafe('Plugin package exceeds the 10 MB limit.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(bytes).toString('utf8'));
  } catch {
    unsafe('Plugin package is not valid JSON.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    unsafe('Plugin package root is invalid.');
  const input = parsed as Record<string, unknown>;
  if (
    Object.keys(input).some(
      (key) => !['formatVersion', 'pluginId', 'version', 'files'].includes(key),
    ) ||
    input.formatVersion !== 1 ||
    typeof input.pluginId !== 'string' ||
    typeof input.version !== 'string' ||
    !Array.isArray(input.files)
  )
    unsafe('Plugin package schema is unsupported.');
  if (input.files.length < 1 || input.files.length > MARKETPLACE_LIMITS.extractedFiles)
    unsafe('Plugin package file count is outside allowed limits.');
  const seen = new Set<string>();
  let total = 0;
  const files = input.files
    .map((candidate) => {
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate))
        unsafe('Plugin package entry is invalid.');
      const entry = candidate as Record<string, unknown>;
      if (
        Object.keys(entry).some((key) => !['path', 'type', 'content'].includes(key)) ||
        entry.type !== 'file' ||
        typeof entry.path !== 'string' ||
        typeof entry.content !== 'string'
      )
        unsafe('Plugin package contains an unsupported entry type.');
      validateArchivePath(entry.path);
      if (seen.has(entry.path)) unsafe('Plugin package contains duplicate paths.');
      seen.add(entry.path);
      let content: Buffer;
      try {
        content = Buffer.from(entry.content, 'base64');
      } catch {
        unsafe('Plugin package contains invalid file encoding.');
      }
      if (
        content.toString('base64') !== entry.content ||
        content.byteLength > MARKETPLACE_LIMITS.extractedFileBytes
      )
        unsafe('Plugin package file is invalid or oversized.');
      total += content.byteLength;
      if (total > MARKETPLACE_LIMITS.packageBytes)
        unsafe('Expanded plugin package exceeds the 10 MB limit.');
      return { path: entry.path, type: 'file' as const, content: entry.content };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
  const manifestEntry = files.find(({ path: file }) => file === 'forgeki.plugin.json');
  if (!manifestEntry) unsafe('Plugin package requires forgeki.plugin.json.');
  const manifest = parseManifest(Buffer.from(manifestEntry.content, 'base64'));
  if (manifest.id !== input.pluginId || manifest.version !== input.version)
    unsafe('Plugin package identity does not match its manifest.');
  const normalized = encodePackage({
    formatVersion: 1,
    pluginId: manifest.id,
    version: manifest.version,
    files,
  });
  if (!Buffer.from(bytes).equals(Buffer.from(normalized)))
    unsafe('Plugin package is not canonically encoded.');
  return {
    package: { formatVersion: 1, pluginId: manifest.id, version: manifest.version, files },
    manifest,
    files: files.map((entry) => ({
      path: entry.path,
      bytes: Buffer.from(entry.content, 'base64').byteLength,
    })),
    digest: sha256(bytes),
    bytes,
  };
}

export async function extractInspectedPackage(
  inspected: InspectedPluginPackage,
  destination: string,
): Promise<void> {
  const root = path.resolve(destination);
  await mkdir(root, { recursive: false });
  for (const entry of inspected.package.files) {
    validateArchivePath(entry.path);
    const target = path.resolve(root, ...entry.path.split('/'));
    if (!target.startsWith(`${root}${path.sep}`)) unsafe('Plugin package path escaped quarantine.');
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, Buffer.from(entry.content, 'base64'), { flag: 'wx' });
    await chmod(target, 0o600).catch(() => undefined);
  }
}

export function validateArchivePath(relative: string): void {
  if (
    !relative ||
    relative.length > 240 ||
    relative.includes('\0') ||
    relative.includes('\\') ||
    relative.startsWith('/') ||
    /^[A-Za-z]:/u.test(relative) ||
    relative.split('/').some((segment) => !segment || segment === '.' || segment === '..') ||
    relative.startsWith('.') ||
    relative.split('/').some((segment) => segment.startsWith('.'))
  )
    unsafe('Plugin package contains an unsafe path.');
  if (executableExtensions.has(path.posix.extname(relative).toLowerCase()))
    unsafe('Executable plugin files are prohibited.');
  const [root] = relative.split('/');
  if (!allowedRootFiles.has(relative) && root !== 'templates')
    unsafe('Plugin package contains an unsupported file.');
}

async function collect(root: string, directory: string): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) unsafe('Hidden plugin files are prohibited.');
    const absolute = path.join(directory, entry.name);
    const relative = path.relative(root, absolute).split(path.sep).join('/');
    const stat = await lstat(absolute);
    if (stat.isSymbolicLink()) unsafe('Symbolic links are prohibited.');
    if (stat.isDirectory()) result.push(...(await collect(root, absolute)));
    else if (stat.isFile()) {
      if (stat.nlink > 1) unsafe('Hard-linked plugin files are prohibited.');
      validateArchivePath(relative);
      if (stat.size > MARKETPLACE_LIMITS.extractedFileBytes)
        unsafe('Plugin file exceeds the 1 MB limit.');
      result.push(relative);
    } else unsafe('Unsupported plugin file type.');
    if (result.length > MARKETPLACE_LIMITS.extractedFiles)
      unsafe('Plugin package has too many files.');
  }
  return result;
}

function parseManifest(bytes: Uint8Array): ForgeKiPluginManifest {
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(bytes).toString('utf8'));
  } catch {
    unsafe('Plugin manifest is invalid JSON.');
  }
  const result = validatePluginManifest(value);
  if (!result.manifest) unsafe(result.errors[0]?.message ?? 'Plugin manifest is invalid.');
  return result.manifest;
}
function unsafe(message: string): never {
  throw new MarketplaceError('UNSAFE_ARCHIVE', message);
}
