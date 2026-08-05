import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

export type Framework = 'nextjs' | 'react-vite' | 'express' | 'node' | 'unknown';
export type PackageManager = 'pnpm' | 'npm' | 'yarn' | 'bun' | 'unknown';
export type ProjectLanguage = 'typescript' | 'javascript' | 'unknown';

export interface ProjectDetectionResult {
  directory: string;
  projectName?: string;
  framework: Framework;
  packageManager: PackageManager;
  language: ProjectLanguage;
  scripts: Record<string, string>;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  detectedFiles: string[];
  warnings: string[];
}

interface PackageMetadata {
  name?: unknown;
  packageManager?: unknown;
  scripts?: unknown;
  dependencies?: unknown;
  devDependencies?: unknown;
}

const packageManagerLockfiles = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['package-lock.json', 'npm'],
  ['yarn.lock', 'yarn'],
  ['bun.lock', 'bun'],
  ['bun.lockb', 'bun'],
] as const satisfies readonly (readonly [string, Exclude<PackageManager, 'unknown'>])[];

const frameworkConfigFiles = [
  'next.config.js',
  'next.config.mjs',
  'next.config.ts',
  'vite.config.js',
  'vite.config.mjs',
  'vite.config.ts',
] as const;

const ignoredDirectories = new Set(['node_modules', '.git', 'dist', 'coverage', '.next']);

export async function detectProject(directory: string): Promise<ProjectDetectionResult> {
  const resolvedDirectory = path.resolve(directory);
  const detectedFiles: string[] = [];
  const warnings: string[] = [];
  const packagePath = path.join(resolvedDirectory, 'package.json');
  const packageExists = await exists(packagePath);
  let packageMetadata: PackageMetadata | undefined;

  if (packageExists) {
    detectedFiles.push('package.json');
    try {
      const parsed: unknown = JSON.parse(await readFile(packagePath, 'utf8'));
      if (isRecord(parsed)) {
        packageMetadata = parsed;
      } else {
        warnings.push('package.json must contain a JSON object.');
      }
    } catch {
      warnings.push('package.json is malformed and could not be parsed.');
    }
  } else {
    warnings.push('No package.json was found.');
  }

  const scripts = stringRecord(packageMetadata?.scripts);
  const dependencies = stringRecord(packageMetadata?.dependencies);
  const devDependencies = stringRecord(packageMetadata?.devDependencies);
  const allDependencies = { ...dependencies, ...devDependencies };

  const presentLockfiles: Array<{
    file: string;
    manager: Exclude<PackageManager, 'unknown'>;
  }> = [];
  for (const [file, manager] of packageManagerLockfiles) {
    if (await exists(path.join(resolvedDirectory, file))) {
      detectedFiles.push(file);
      presentLockfiles.push({ file, manager });
    }
  }

  const declaredPackageManager = parsePackageManager(packageMetadata?.packageManager, warnings);
  const lockfilePackageManager = presentLockfiles[0]?.manager;
  const packageManager = lockfilePackageManager ?? declaredPackageManager ?? 'unknown';
  const distinctManagers = new Set(presentLockfiles.map(({ manager }) => manager));
  if (presentLockfiles.length > 1) {
    warnings.push(
      `Multiple package-manager lockfiles found (${presentLockfiles.map(({ file }) => file).join(', ')}). ` +
        `Using ${packageManager} by priority: pnpm, npm, yarn, bun.`,
    );
  } else if (distinctManagers.size === 0 && packageMetadata && !declaredPackageManager) {
    warnings.push('No supported package-manager lockfile was found.');
  }
  if (
    lockfilePackageManager &&
    declaredPackageManager &&
    lockfilePackageManager !== declaredPackageManager
  ) {
    warnings.push(
      `Lockfile indicates ${lockfilePackageManager}, but package.json declares ${declaredPackageManager}. ` +
        `Using ${lockfilePackageManager}.`,
    );
  }

  const presentFrameworkConfigs = new Set<string>();
  for (const file of frameworkConfigFiles) {
    if (await exists(path.join(resolvedDirectory, file))) {
      detectedFiles.push(file);
      presentFrameworkConfigs.add(file);
    }
  }

  const hasTsconfig = await exists(path.join(resolvedDirectory, 'tsconfig.json'));
  if (hasTsconfig) detectedFiles.push('tsconfig.json');

  const sourceLanguage = await detectSourceLanguage(resolvedDirectory);
  const framework = detectFramework(
    packageMetadata !== undefined,
    allDependencies,
    presentFrameworkConfigs,
  );
  const language = detectLanguage(
    packageMetadata !== undefined,
    hasTsconfig,
    allDependencies,
    sourceLanguage,
  );

  return {
    directory: resolvedDirectory,
    ...(typeof packageMetadata?.name === 'string' ? { projectName: packageMetadata.name } : {}),
    framework,
    packageManager,
    language,
    scripts,
    dependencies,
    devDependencies,
    detectedFiles,
    warnings,
  };
}

function parsePackageManager(value: unknown, warnings: string[]): PackageManager | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') {
    warnings.push('packageManager in package.json must be a string.');
    return undefined;
  }
  const manager = value.split('@')[0];
  if (manager === 'pnpm' || manager === 'npm' || manager === 'yarn' || manager === 'bun') {
    return manager;
  }
  warnings.push(`Unsupported packageManager declaration: ${value}.`);
  return undefined;
}

function detectFramework(
  hasValidPackage: boolean,
  dependencies: Record<string, string>,
  configs: ReadonlySet<string>,
): Framework {
  if ('next' in dependencies || [...configs].some((file) => file.startsWith('next.config.'))) {
    return 'nextjs';
  }
  const hasViteConfig = [...configs].some((file) => file.startsWith('vite.config.'));
  if ('react' in dependencies && ('vite' in dependencies || hasViteConfig)) return 'react-vite';
  if ('express' in dependencies) return 'express';
  return hasValidPackage ? 'node' : 'unknown';
}

function detectLanguage(
  hasValidPackage: boolean,
  hasTsconfig: boolean,
  dependencies: Record<string, string>,
  sourceLanguage: ProjectLanguage,
): ProjectLanguage {
  if (hasTsconfig || 'typescript' in dependencies || sourceLanguage === 'typescript') {
    return 'typescript';
  }
  if (hasValidPackage || sourceLanguage === 'javascript') return 'javascript';
  return 'unknown';
}

async function detectSourceLanguage(directory: string): Promise<ProjectLanguage> {
  let javascriptFound = false;
  const pending = [directory];

  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) break;

    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!ignoredDirectories.has(entry.name)) pending.push(path.join(current, entry.name));
        continue;
      }
      if (!entry.isFile()) continue;
      const extension = path.extname(entry.name).toLowerCase();
      if (extension === '.ts' || extension === '.tsx') return 'typescript';
      if (
        extension === '.js' ||
        extension === '.jsx' ||
        extension === '.mjs' ||
        extension === '.cjs'
      ) {
        javascriptFound = true;
      }
    }
  }

  return javascriptFound ? 'javascript' : 'unknown';
}

function stringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
