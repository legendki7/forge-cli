import {
  access,
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import {
  MAX_PLUGIN_BUNDLE_BYTES,
  MAX_TEMPLATE_FILE_BYTES,
  createPluginSafetyReport,
  defineForgeKiPlugin,
  isSafeRelativePluginPath,
  serializePluginManifest,
  validatePluginManifest,
  type ForgeKiPluginManifest,
  type PluginSafetyReport,
  type PluginScannerEvidence,
} from '@forgecli7/plugin-sdk';

export type PluginSourceType = 'built-in' | 'local' | 'bundled-curated' | 'remote';
export type PluginIntegrityState = 'valid' | 'corrupted' | 'not-installed' | 'revoked';

export interface PluginIntegrityMetadata {
  schemaVersion: 1;
  pluginId: string;
  version: string;
  sourceType: PluginSourceType;
  installedAt: string;
  manifestHash: string;
  fileHashes: Record<string, string>;
  publisherId?: string;
  packageSha256?: string;
  signatureStatus?: 'verified';
  disabledReason?: string;
}

export interface InstalledPlugin {
  manifest: ForgeKiPluginManifest;
  metadata: PluginIntegrityMetadata;
  directory: string;
  integrity: PluginIntegrityState;
  disabledReason?: string;
}

export interface PluginCatalogEntry {
  id: string;
  name: string;
  description: string;
  publisher: string;
  version: string;
  category: string;
  supportedFrameworks: readonly string[];
  permissions: readonly string[];
  sourceType: PluginSourceType;
  builtIn: boolean;
  trusted: boolean;
  declarative: boolean;
  installed: boolean;
  integrity: PluginIntegrityState;
  installedAt?: string;
  manifest?: ForgeKiPluginManifest;
  warning?: string;
  publisherStatus?: 'forgeki' | 'verified' | 'community' | 'revoked';
  signatureStatus?: 'verified' | 'invalid' | 'unavailable';
  updateAvailable?: boolean;
  compatible?: boolean;
  packageSha256?: string;
  permissionExpansion?: readonly string[];
}

export interface PluginCatalogProvider {
  list(): Promise<PluginCatalogEntry[]>;
  get(id: string): Promise<PluginCatalogEntry | undefined>;
}

export const BUILTIN_PLUGIN_CATALOG: readonly PluginCatalogEntry[] = [
  {
    id: 'forgeki.docker',
    name: 'Docker',
    description: 'Trusted Docker configuration shipped with ForgeKi.',
    publisher: 'ForgeKi',
    version: '0.1.0',
    category: 'Tooling',
    supportedFrameworks: ['nextjs', 'react-vite', 'express', 'node'],
    permissions: ['Trusted native implementation'],
    sourceType: 'built-in',
    builtIn: true,
    trusted: true,
    declarative: false,
    installed: true,
    integrity: 'valid',
  },
  {
    id: 'forgeki.github-actions',
    name: 'GitHub Actions',
    description: 'Trusted CI workflow generation shipped with ForgeKi.',
    publisher: 'ForgeKi',
    version: '0.1.0',
    category: 'Tooling',
    supportedFrameworks: ['nextjs', 'react-vite', 'express', 'node'],
    permissions: ['Trusted native implementation'],
    sourceType: 'built-in',
    builtIn: true,
    trusted: true,
    declarative: false,
    installed: true,
    integrity: 'valid',
  },
] as const;

function bundled(manifest: ForgeKiPluginManifest): ForgeKiPluginManifest {
  return defineForgeKiPlugin(manifest);
}

export const BUNDLED_COMMUNITY_PLUGINS: readonly ForgeKiPluginManifest[] = [
  bundled({
    manifestVersion: 1,
    id: 'community.editorconfig',
    name: 'EditorConfig',
    version: '0.1.0',
    description: 'Adds deterministic cross-editor formatting defaults.',
    author: { name: 'ForgeKi bundled examples' },
    license: 'MIT',
    repository: 'https://github.com/legendki7/forge-cli',
    category: 'Tooling',
    compatibility: { forgeki: '>=0.3.0' },
    supportedFrameworks: ['nextjs', 'react-vite', 'express'],
    permissions: [
      'project:generate-files',
      'project:add-stack-components',
      'project:add-scanner-rules',
    ],
    contributions: {
      stackComponents: [
        {
          id: 'editorconfig',
          name: 'EditorConfig',
          description: 'Keep editor indentation and line endings consistent.',
          category: 'tooling',
          supportedFrameworks: ['nextjs', 'react-vite', 'express'],
          provides: ['editor-configuration'],
        },
      ],
      generatedFiles: [
        {
          path: '.editorconfig',
          content:
            'root = true\n\n[*]\ncharset = utf-8\nend_of_line = lf\ninsert_final_newline = true\nindent_style = space\nindent_size = 2\n',
          condition: { component: 'editorconfig' },
        },
      ],
      scannerRules: [
        {
          id: 'editorconfig-file',
          componentId: 'editorconfig',
          detect: { any: [{ file: '.editorconfig' }] },
        },
      ],
    },
  }),
  bundled({
    manifestVersion: 1,
    id: 'community.zod',
    name: 'Zod Validation',
    version: '0.1.0',
    description: 'Adds typed runtime validation foundations.',
    author: 'ForgeKi bundled examples',
    license: 'MIT',
    category: 'Validation',
    compatibility: { forgeki: '>=0.3.0' },
    supportedFrameworks: ['nextjs', 'react-vite', 'express'],
    permissions: [
      'project:generate-files',
      'project:add-dependencies',
      'project:add-stack-components',
      'project:add-scanner-rules',
    ],
    contributions: {
      stackComponents: [
        {
          id: 'zod',
          name: 'Zod',
          description: 'Validate untrusted data with TypeScript schemas.',
          category: 'tooling',
          supportedFrameworks: ['nextjs', 'react-vite', 'express'],
          provides: ['runtime-validation'],
        },
      ],
      dependencies: { zod: '^4.0.0' },
      generatedFiles: [
        {
          path: 'src/lib/validation.ts',
          content:
            "import { z } from 'zod';\n\nexport const exampleSchema = z.object({ name: z.string().min(1) });\n",
          condition: { component: 'zod' },
        },
      ],
      scannerRules: [
        {
          id: 'zod-dependency',
          componentId: 'zod',
          detect: { any: [{ dependency: 'zod' }] },
        },
      ],
    },
  }),
  bundled({
    manifestVersion: 1,
    id: 'community.pino',
    name: 'Pino Logging',
    version: '0.1.0',
    description: 'Adds structured logging to Express services.',
    author: 'ForgeKi bundled examples',
    license: 'MIT',
    category: 'Observability',
    compatibility: { forgeki: '>=0.3.0' },
    supportedFrameworks: ['express'],
    permissions: [
      'project:generate-files',
      'project:add-dependencies',
      'project:add-stack-components',
    ],
    contributions: {
      stackComponents: [
        {
          id: 'pino',
          name: 'Pino',
          description: 'Fast structured application logging.',
          category: 'tooling',
          supportedFrameworks: ['express'],
        },
      ],
      dependencies: { pino: '^9.9.0' },
      generatedFiles: [
        {
          path: 'src/lib/logger.ts',
          content: "import pino from 'pino';\nexport const logger = pino();\n",
          condition: { component: 'pino' },
        },
      ],
    },
  }),
  bundled({
    manifestVersion: 1,
    id: 'community.cors',
    name: 'CORS Setup',
    version: '0.1.0',
    description: 'Adds explicit CORS middleware configuration to Express.',
    author: 'ForgeKi bundled examples',
    license: 'MIT',
    category: 'Web API',
    compatibility: { forgeki: '>=0.3.0' },
    supportedFrameworks: ['express'],
    permissions: [
      'project:generate-files',
      'project:add-dependencies',
      'project:add-stack-components',
    ],
    contributions: {
      stackComponents: [
        {
          id: 'cors',
          name: 'CORS',
          description: 'Explicit browser-origin middleware foundation.',
          category: 'tooling',
          supportedFrameworks: ['express'],
        },
      ],
      dependencies: { cors: '^2.8.5' },
      devDependencies: { '@types/cors': '^2.8.19' },
      generatedFiles: [
        {
          path: 'src/lib/cors.ts',
          content:
            "import cors from 'cors';\nexport const corsMiddleware = cors({ origin: false });\n",
          condition: { component: 'cors' },
        },
      ],
    },
  }),
  bundled({
    manifestVersion: 1,
    id: 'community.redis',
    name: 'Redis Configuration',
    version: '0.1.0',
    description: 'Adds a Redis client configuration foundation without starting a server.',
    author: 'ForgeKi bundled examples',
    license: 'MIT',
    category: 'Infrastructure',
    compatibility: { forgeki: '>=0.3.0' },
    supportedFrameworks: ['nextjs', 'express'],
    permissions: [
      'project:generate-files',
      'project:add-dependencies',
      'project:add-env-schema',
      'project:add-stack-components',
      'project:add-scanner-rules',
    ],
    contributions: {
      stackComponents: [
        {
          id: 'redis',
          name: 'Redis',
          description: 'Server-side Redis client configuration.',
          category: 'infrastructure',
          supportedFrameworks: ['nextjs', 'express'],
          requiresCapabilities: ['server-runtime'],
        },
      ],
      dependencies: { redis: '^5.8.2' },
      environmentVariables: [
        {
          name: 'REDIS_URL',
          description: 'Redis connection URL.',
          required: true,
          secret: true,
          exampleValue: 'redis://localhost:6379',
        },
      ],
      generatedFiles: [
        {
          path: 'src/lib/redis.ts',
          content:
            "import { createClient } from 'redis';\nexport const redis = createClient({ url: process.env.REDIS_URL });\n",
          condition: { component: 'redis' },
        },
      ],
      scannerRules: [
        {
          id: 'redis-evidence',
          componentId: 'redis',
          detect: { any: [{ dependency: 'redis' }, { file: 'src/lib/redis.ts' }] },
        },
      ],
    },
  }),
] as const;

export class PluginStorageError extends Error {
  constructor(
    readonly code:
      | 'INVALID_MANIFEST'
      | 'UNSAFE_CONTRIBUTION'
      | 'INTEGRITY_FAILURE'
      | 'DUPLICATE_PLUGIN'
      | 'STORAGE_FAILURE'
      | 'PLUGIN_DISABLED',
    message: string,
    readonly report?: PluginSafetyReport,
  ) {
    super(message);
    this.name = 'PluginStorageError';
  }
}

export function defaultPluginStorageRoot(): string {
  const local = process.env.LOCALAPPDATA;
  return local
    ? path.join(local, 'ForgeKi', 'plugins')
    : path.join(os.homedir(), '.forgeki', 'plugins');
}

export class PluginStore {
  constructor(readonly root = defaultPluginStorageRoot()) {}

  async validate(sourceDirectory: string): Promise<{
    manifest?: ForgeKiPluginManifest;
    report: PluginSafetyReport;
    files: string[];
    bytes: number;
  }> {
    const source = path.resolve(sourceDirectory);
    await assertRealDirectory(source);
    const manifestPath = path.join(source, 'forgeki.plugin.json');
    const manifestStat = await lstat(manifestPath).catch(() => undefined);
    if (!manifestStat?.isFile() || manifestStat.isSymbolicLink()) {
      return {
        report: createPluginSafetyReport(undefined),
        files: [],
        bytes: 0,
      };
    }
    if (manifestStat.size > MAX_TEMPLATE_FILE_BYTES) {
      const report = createPluginSafetyReport({ manifestVersion: 1 });
      report.errors = [
        ...report.errors,
        {
          code: 'UNSAFE_CONTRIBUTION',
          path: 'forgeki.plugin.json',
          message: 'Manifest file exceeds the file-size limit.',
        },
      ];
      report.result = 'blocked';
      return { report, files: [], bytes: manifestStat.size };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(manifestPath, 'utf8'));
    } catch {
      return {
        report: createPluginSafetyReport(undefined),
        files: [],
        bytes: manifestStat.size,
      };
    }
    const report = createPluginSafetyReport(parsed);
    const validation = validatePluginManifest(parsed);
    if (!validation.manifest) return { report, files: [], bytes: manifestStat.size };
    const files = referencedFiles(validation.manifest);
    let bytes = manifestStat.size;
    for (const relative of files) {
      const target = path.resolve(source, relative);
      if (!target.startsWith(`${source}${path.sep}`)) {
        report.errors = [
          ...report.errors,
          {
            code: 'UNSAFE_CONTRIBUTION',
            path: relative,
            message: 'Plugin file escaped the selected source directory.',
          },
        ];
        report.result = 'blocked';
        continue;
      }
      const stat = await lstat(target).catch(() => undefined);
      if (!stat?.isFile() || stat.isSymbolicLink()) {
        report.errors = [
          ...report.errors,
          {
            code: 'UNSAFE_CONTRIBUTION',
            path: relative,
            message: 'Plugin template source must be a regular file and cannot be a symlink.',
          },
        ];
        report.result = 'blocked';
        continue;
      }
      if (stat.size > MAX_TEMPLATE_FILE_BYTES) {
        report.errors = [
          ...report.errors,
          {
            code: 'UNSAFE_CONTRIBUTION',
            path: relative,
            message: 'Plugin template exceeds the single-file size limit.',
          },
        ];
        report.result = 'blocked';
      }
      bytes += stat.size;
    }
    if (bytes > MAX_PLUGIN_BUNDLE_BYTES) {
      report.errors = [
        ...report.errors,
        {
          code: 'UNSAFE_CONTRIBUTION',
          path: '$',
          message: 'Plugin bundle exceeds the 10 MB size limit.',
        },
      ];
      report.result = 'blocked';
    }
    return { manifest: validation.manifest, report, files, bytes };
  }

  async install(
    sourceDirectory: string,
    options: {
      sourceType?: Exclude<PluginSourceType, 'built-in'>;
      installedAt?: string;
      publisherId?: string;
      packageSha256?: string;
      signatureStatus?: 'verified';
    } = {},
  ): Promise<InstalledPlugin> {
    const inspected = await this.validate(sourceDirectory);
    if (!inspected.manifest || inspected.report.result === 'blocked') {
      throw new PluginStorageError(
        'INVALID_MANIFEST',
        inspected.report.errors[0]?.message ?? 'Plugin installation was blocked.',
        inspected.report,
      );
    }
    const source = path.resolve(sourceDirectory);
    const pluginId = inspected.manifest.id;
    await mkdir(this.root, { recursive: true });
    const stage = path.join(this.root, `.install-${pluginId}-${randomUUID()}`);
    const destination = path.join(this.root, pluginId);
    const backup = path.join(this.root, `.backup-${pluginId}-${randomUUID()}`);
    await mkdir(path.join(stage, 'files'), { recursive: true });
    try {
      const serialized = serializePluginManifest(inspected.manifest);
      await writeFile(path.join(stage, 'manifest.json'), serialized, 'utf8');
      const fileHashes: Record<string, string> = {};
      for (const relative of inspected.files) {
        const output = path.join(stage, 'files', relative);
        await mkdir(path.dirname(output), { recursive: true });
        await copyFile(path.join(source, relative), output);
        fileHashes[relative] = await hashFile(output);
      }
      const metadata: PluginIntegrityMetadata = {
        schemaVersion: 1,
        pluginId,
        version: inspected.manifest.version,
        sourceType: options.sourceType ?? 'local',
        installedAt: options.installedAt ?? new Date().toISOString(),
        manifestHash: hashText(serialized),
        fileHashes,
        ...(options.publisherId ? { publisherId: options.publisherId } : {}),
        ...(options.packageSha256 ? { packageSha256: options.packageSha256 } : {}),
        ...(options.signatureStatus ? { signatureStatus: options.signatureStatus } : {}),
      };
      await writeFile(
        path.join(stage, 'metadata.json'),
        `${JSON.stringify(metadata, null, 2)}\n`,
        'utf8',
      );
      const existing = await exists(destination);
      if (existing) await rename(destination, backup);
      try {
        await rename(stage, destination);
      } catch (error) {
        if (existing) await rename(backup, destination).catch(() => undefined);
        throw error;
      }
      if (existing) await rm(backup, { recursive: true, force: true });
      return this.inspect(pluginId).then((plugin) => {
        if (!plugin || plugin.integrity !== 'valid')
          throw new PluginStorageError(
            'INTEGRITY_FAILURE',
            'Plugin failed integrity verification after installation.',
          );
        return plugin;
      });
    } catch (error) {
      await rm(stage, { recursive: true, force: true });
      if (error instanceof PluginStorageError) throw error;
      throw new PluginStorageError(
        'STORAGE_FAILURE',
        `Plugin could not be installed: ${publicMessage(error)}`,
      );
    }
  }

  async installBundled(id: string): Promise<InstalledPlugin> {
    const manifest = BUNDLED_COMMUNITY_PLUGINS.find((candidate) => candidate.id === id);
    if (!manifest) throw new PluginStorageError('INVALID_MANIFEST', 'Unknown bundled plugin.');
    const temporary = path.join(this.root, `.bundled-${id}-${randomUUID()}`);
    await mkdir(temporary, { recursive: true });
    try {
      await writeFile(
        path.join(temporary, 'forgeki.plugin.json'),
        serializePluginManifest(manifest),
        'utf8',
      );
      return await this.install(temporary, { sourceType: 'bundled-curated' });
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  }

  async list(): Promise<InstalledPlugin[]> {
    const entries = await readdir(this.root, { withFileTypes: true }).catch(() => []);
    const plugins = await Promise.all(
      entries
        .filter(
          (entry) =>
            entry.isDirectory() &&
            !entry.isSymbolicLink() &&
            /^[a-z0-9-]+\.[a-z0-9-]+$/u.test(entry.name),
        )
        .map((entry) => this.inspect(entry.name)),
    );
    return plugins.filter((plugin): plugin is InstalledPlugin => plugin !== undefined);
  }

  async loadPlanSources(): Promise<
    Array<{ manifest: ForgeKiPluginManifest; files: Record<string, string> }>
  > {
    const sources = [];
    for (const plugin of await this.list()) {
      if (plugin.integrity !== 'valid' || plugin.metadata.disabledReason) continue;
      const files: Record<string, string> = {};
      for (const relative of Object.keys(plugin.metadata.fileHashes).sort()) {
        files[relative] = await readFile(path.join(plugin.directory, 'files', relative), 'utf8');
      }
      sources.push({ manifest: plugin.manifest, files });
    }
    return sources.sort((a, b) => a.manifest.id.localeCompare(b.manifest.id));
  }

  async inspect(id: string): Promise<InstalledPlugin | undefined> {
    if (!/^[a-z0-9-]+\.[a-z0-9-]+$/u.test(id)) return undefined;
    const directory = path.join(this.root, id);
    if (!(await exists(directory))) return undefined;
    try {
      const manifestText = await readFile(path.join(directory, 'manifest.json'), 'utf8');
      const metadata = JSON.parse(
        await readFile(path.join(directory, 'metadata.json'), 'utf8'),
      ) as PluginIntegrityMetadata;
      const validation = validatePluginManifest(JSON.parse(manifestText));
      if (!validation.manifest || metadata.pluginId !== id || metadata.schemaVersion !== 1) {
        throw new Error('Installed manifest metadata is invalid.');
      }
      const integrityErrors: string[] = [];
      if (hashText(manifestText) !== metadata.manifestHash)
        integrityErrors.push('manifest hash changed');
      for (const [relative, expected] of Object.entries(metadata.fileHashes)) {
        if (!isSafeRelativePluginPath(relative)) {
          integrityErrors.push('unsafe integrity path');
          continue;
        }
        const file = path.join(directory, 'files', relative);
        const stat = await lstat(file).catch(() => undefined);
        if (!stat?.isFile() || stat.isSymbolicLink())
          integrityErrors.push(`${relative} is missing`);
        else if ((await hashFile(file)) !== expected) integrityErrors.push(`${relative} changed`);
      }
      return {
        manifest: validation.manifest,
        metadata,
        directory,
        integrity: integrityErrors.length ? 'corrupted' : 'valid',
        ...(integrityErrors.length || metadata.disabledReason
          ? {
              disabledReason:
                metadata.disabledReason ??
                'Plugin disabled because its installed files changed unexpectedly. Remove and reinstall it.',
            }
          : {}),
      };
    } catch {
      return {
        manifest: corruptPlaceholder(id),
        metadata: {
          schemaVersion: 1,
          pluginId: id,
          version: '0.0.0',
          sourceType: 'local',
          installedAt: '',
          manifestHash: '',
          fileHashes: {},
        },
        directory,
        integrity: 'corrupted',
        disabledReason:
          'Plugin disabled because its installed manifest or integrity metadata is corrupted.',
      };
    }
  }

  async remove(id: string): Promise<void> {
    if (BUILTIN_PLUGIN_CATALOG.some((plugin) => plugin.id === id)) {
      throw new PluginStorageError('PLUGIN_DISABLED', 'Built-in plugins cannot be removed.');
    }
    if (!/^[a-z0-9-]+\.[a-z0-9-]+$/u.test(id)) {
      throw new PluginStorageError('INVALID_MANIFEST', 'Invalid plugin id.');
    }
    await rm(path.join(this.root, id), { recursive: true, force: true });
  }

  async disable(id: string, reason: string): Promise<void> {
    const plugin = await this.inspect(id);
    if (!plugin || plugin.metadata.sourceType !== 'remote')
      throw new PluginStorageError(
        'PLUGIN_DISABLED',
        'Only installed remote plugins can be revoked.',
      );
    const metadata = { ...plugin.metadata, disabledReason: reason.slice(0, 300) };
    const target = path.join(plugin.directory, 'metadata.json');
    const temporary = path.join(plugin.directory, `.metadata-${randomUUID()}.tmp`);
    await writeFile(temporary, `${JSON.stringify(metadata, null, 2)}\n`, { flag: 'wx' });
    await rename(temporary, target);
  }
}

export class BuiltInCatalogProvider implements PluginCatalogProvider {
  async list() {
    return BUILTIN_PLUGIN_CATALOG.map((entry) => ({ ...entry }));
  }
  async get(id: string) {
    return (await this.list()).find((entry) => entry.id === id);
  }
}

export class BundledCommunityCatalogProvider implements PluginCatalogProvider {
  constructor(private readonly store?: PluginStore) {}
  async list() {
    const installed = new Map(
      ((await this.store?.list().catch(() => [])) ?? []).map((plugin) => [
        plugin.manifest.id,
        plugin,
      ]),
    );
    return BUNDLED_COMMUNITY_PLUGINS.map((manifest) =>
      catalogFromManifest(manifest, 'bundled-curated', installed.get(manifest.id)),
    );
  }
  async get(id: string) {
    return (await this.list()).find((entry) => entry.id === id);
  }
}

export class LocalInstalledCatalogProvider implements PluginCatalogProvider {
  constructor(private readonly store: PluginStore) {}
  async list() {
    return (await this.store.list()).map((plugin) =>
      catalogFromManifest(
        plugin.manifest,
        plugin.metadata.sourceType === 'built-in' ? 'local' : plugin.metadata.sourceType,
        plugin,
      ),
    );
  }
  async get(id: string) {
    return (await this.list()).find((entry) => entry.id === id);
  }
}

export async function composePluginCatalog(
  providers: readonly PluginCatalogProvider[],
): Promise<PluginCatalogEntry[]> {
  const entries = new Map<string, PluginCatalogEntry>();
  for (const provider of providers) {
    for (const entry of await provider.list()) {
      const current = entries.get(entry.id);
      if (current?.builtIn || (current && entry.builtIn)) {
        if (current && current.builtIn !== entry.builtIn)
          throw new PluginStorageError(
            'DUPLICATE_PLUGIN',
            `Community plugin cannot override built-in ${entry.id}.`,
          );
      }
      if (!current || entry.installed) entries.set(entry.id, entry);
    }
  }
  return [...entries.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function createPluginStarter(parent: string, name: string): Promise<string> {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/gu, '-')
    .replace(/^-|-$/gu, '');
  if (!slug) throw new PluginStorageError('INVALID_MANIFEST', 'Plugin name is invalid.');
  const destination = path.resolve(parent, slug);
  if (path.dirname(destination) !== path.resolve(parent) || (await exists(destination))) {
    throw new PluginStorageError(
      'STORAGE_FAILURE',
      'Plugin project destination is unsafe or exists.',
    );
  }
  await mkdir(path.join(destination, 'templates'), { recursive: true });
  await mkdir(path.join(destination, 'tests'), { recursive: true });
  const manifest: ForgeKiPluginManifest = {
    manifestVersion: 1,
    id: `community.${slug}`,
    name: title(slug),
    version: '0.1.0',
    description: 'A restricted declarative ForgeKi plugin.',
    author: { name: 'Plugin author' },
    license: 'MIT',
    compatibility: { forgeki: '>=0.3.0' },
    supportedFrameworks: ['nextjs', 'react-vite', 'express'],
    permissions: ['project:generate-files'],
    contributions: {
      generatedFiles: [
        {
          path: 'forgeki-plugin-example.txt',
          source: 'templates/example.txt',
        },
      ],
    },
  };
  await writeFile(
    path.join(destination, 'forgeki.plugin.json'),
    serializePluginManifest(manifest),
    'utf8',
  );
  await writeFile(
    path.join(destination, 'templates', 'example.txt'),
    'Generated for {{project.name}} by a restricted ForgeKi plugin.\n',
    'utf8',
  );
  await writeFile(
    path.join(destination, 'README.md'),
    `# ${title(slug)}\n\nValidate with \`forge plugins validate .\`. No plugin code is executed.\n`,
    'utf8',
  );
  await writeFile(
    path.join(destination, 'tests', 'README.md'),
    '# Tests\n\nAdd manifest fixtures and validate them with the ForgeKi CLI.\n',
    'utf8',
  );
  return destination;
}

export async function evaluatePluginScannerRules(
  plugin: InstalledPlugin,
  project: {
    directory: string;
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
    scripts: Record<string, string>;
  },
): Promise<Array<{ pluginId: string; componentId: string; evidence: string[] }>> {
  if (plugin.integrity !== 'valid' || plugin.metadata.disabledReason) return [];
  const results = [];
  for (const rule of plugin.manifest.contributions.scannerRules ?? []) {
    const evidence: string[] = [];
    for (const predicate of rule.detect.any) {
      const match = await scannerEvidence(predicate, project);
      if (match) evidence.push(match);
    }
    if (evidence.length)
      results.push({
        pluginId: plugin.manifest.id,
        componentId: rule.componentId,
        evidence,
      });
  }
  return results;
}

async function scannerEvidence(
  evidence: PluginScannerEvidence,
  project: {
    directory: string;
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
    scripts: Record<string, string>;
  },
): Promise<string | undefined> {
  if ('dependency' in evidence)
    return evidence.dependency in project.dependencies
      ? `dependency:${evidence.dependency}`
      : undefined;
  if ('devDependency' in evidence)
    return evidence.devDependency in project.devDependencies
      ? `devDependency:${evidence.devDependency}`
      : undefined;
  if ('script' in evidence)
    return evidence.script in project.scripts ? `script:${evidence.script}` : undefined;
  if ('environmentVariable' in evidence) {
    const content = await readFile(path.join(project.directory, '.env.example'), 'utf8').catch(
      () => '',
    );
    return content
      .split(/\r?\n/u)
      .some((line) => line.startsWith(`${evidence.environmentVariable}=`))
      ? `environment:${evidence.environmentVariable}`
      : undefined;
  }
  const target = path.resolve(project.directory, evidence.file);
  if (!target.startsWith(`${path.resolve(project.directory)}${path.sep}`)) return undefined;
  return (await exists(target)) ? `file:${evidence.file}` : undefined;
}

function catalogFromManifest(
  manifest: ForgeKiPluginManifest,
  sourceType: Exclude<PluginSourceType, 'built-in'>,
  installed?: InstalledPlugin,
): PluginCatalogEntry {
  const author = typeof manifest.author === 'string' ? manifest.author : manifest.author.name;
  return {
    id: manifest.id,
    name: manifest.name,
    description: manifest.description,
    publisher: author,
    version: manifest.version,
    category: manifest.category ?? 'Community',
    supportedFrameworks: manifest.supportedFrameworks,
    permissions: manifest.permissions,
    sourceType,
    builtIn: false,
    trusted: false,
    declarative: true,
    installed: Boolean(installed),
    integrity: installed?.metadata.disabledReason
      ? 'revoked'
      : (installed?.integrity ?? 'not-installed'),
    ...(installed ? { installedAt: installed.metadata.installedAt } : {}),
    ...(installed?.metadata.publisherId ? { publisherStatus: 'community' as const } : {}),
    ...(installed?.metadata.signatureStatus
      ? { signatureStatus: installed.metadata.signatureStatus }
      : {}),
    ...(installed?.metadata.packageSha256
      ? { packageSha256: installed.metadata.packageSha256 }
      : {}),
    manifest,
    ...(installed?.disabledReason ? { warning: installed.disabledReason } : {}),
  };
}

function referencedFiles(manifest: ForgeKiPluginManifest): string[] {
  const files = [
    ...(manifest.contributions.generatedFiles ?? []),
    ...(manifest.contributions.templates ?? []).flatMap((template) => template.files),
  ];
  return [...new Set(files.flatMap((file) => (file.source ? [file.source] : [])))].sort();
}

function corruptPlaceholder(id: string): ForgeKiPluginManifest {
  return {
    manifestVersion: 1,
    id,
    name: id,
    version: '0.0.0',
    description: 'Corrupted installed plugin.',
    author: 'Unknown',
    license: 'Unknown',
    compatibility: { forgeki: '>=0.3.0' },
    supportedFrameworks: ['nextjs'],
    permissions: [],
    contributions: {},
  };
}

async function assertRealDirectory(directory: string) {
  const stat = await lstat(directory).catch(() => undefined);
  if (!stat?.isDirectory() || stat.isSymbolicLink())
    throw new PluginStorageError(
      'UNSAFE_CONTRIBUTION',
      'Plugin source must be a real local directory, not a symlink.',
    );
}
async function hashFile(file: string) {
  return hashText(await readFile(file));
}
function hashText(value: string | Buffer) {
  return createHash('sha256').update(value).digest('hex');
}
async function exists(target: string) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}
function publicMessage(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 300) : 'Storage operation failed.';
}
function title(slug: string) {
  return slug
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
