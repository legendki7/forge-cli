export const PLUGIN_MANIFEST_VERSION = 1 as const;
export const MAX_MANIFEST_BYTES = 256 * 1024;
export const MAX_TEMPLATE_FILE_BYTES = 1024 * 1024;
export const MAX_PLUGIN_BUNDLE_BYTES = 10 * 1024 * 1024;

export type PluginFramework = 'nextjs' | 'react-vite' | 'express';
export type PluginPermission =
  | 'project:generate-files'
  | 'project:add-dependencies'
  | 'project:add-scripts'
  | 'project:add-env-schema'
  | 'project:add-stack-components'
  | 'project:add-scanner-rules';

export const SUPPORTED_PLUGIN_PERMISSIONS: readonly PluginPermission[] = [
  'project:generate-files',
  'project:add-dependencies',
  'project:add-scripts',
  'project:add-env-schema',
  'project:add-stack-components',
  'project:add-scanner-rules',
] as const;

export interface PluginAuthor {
  name: string;
  url?: string;
}

export interface PluginCondition {
  framework?: PluginFramework | readonly PluginFramework[];
  component?: string;
}

export interface PluginGeneratedFile {
  id?: string;
  path: string;
  content?: string;
  source?: string;
  condition?: PluginCondition;
}

export interface PluginDependency {
  name: string;
  version: string;
}

export interface PluginEnvironmentVariable {
  name: string;
  description: string;
  required: boolean;
  secret: boolean;
  exampleValue?: string;
}

export interface PluginStackComponent {
  id: string;
  name: string;
  description: string;
  category: 'styling' | 'database' | 'orm' | 'testing' | 'tooling' | 'runtime' | 'infrastructure';
  supportedFrameworks: readonly PluginFramework[];
  requires?: readonly string[];
  conflictsWith?: readonly string[];
  provides?: readonly string[];
  requiresCapabilities?: readonly string[];
}

export type PluginScannerEvidence =
  | { dependency: string }
  | { devDependency: string }
  | { file: string }
  | { script: string }
  | { environmentVariable: string };

export interface PluginScannerRule {
  id: string;
  componentId: string;
  detect: { any: readonly PluginScannerEvidence[] };
}

export interface PluginTemplateContribution {
  id: string;
  name: string;
  description: string;
  framework: PluginFramework;
  files: readonly PluginGeneratedFile[];
}

export interface PluginContributions {
  stackComponents?: readonly PluginStackComponent[];
  templates?: readonly PluginTemplateContribution[];
  generatedFiles?: readonly PluginGeneratedFile[];
  dependencies?: readonly PluginDependency[] | Readonly<Record<string, string>>;
  devDependencies?: readonly PluginDependency[] | Readonly<Record<string, string>>;
  scripts?: Readonly<Record<string, string>>;
  environmentVariables?: readonly PluginEnvironmentVariable[];
  scannerRules?: readonly PluginScannerRule[];
}

export interface ForgeKiPluginManifest {
  manifestVersion: 1;
  id: string;
  name: string;
  version: string;
  description: string;
  author: PluginAuthor | string;
  license: string;
  homepage?: string;
  repository?: string;
  category?: string;
  compatibility: { forgeki: string };
  supportedFrameworks: readonly PluginFramework[];
  permissions: readonly PluginPermission[];
  contributions: PluginContributions;
}

export type PluginErrorCode =
  | 'INVALID_MANIFEST'
  | 'UNSUPPORTED_MANIFEST_VERSION'
  | 'COMPATIBILITY_FAILURE'
  | 'PERMISSION_DENIED'
  | 'UNSAFE_CONTRIBUTION'
  | 'INTEGRITY_FAILURE'
  | 'DUPLICATE_PLUGIN'
  | 'DUPLICATE_CONTRIBUTION'
  | 'STORAGE_FAILURE'
  | 'UNSUPPORTED_CAPABILITY'
  | 'PLUGIN_DISABLED';

export interface PluginValidationIssue {
  code: PluginErrorCode;
  path: string;
  message: string;
}

export interface PluginValidationResult {
  valid: boolean;
  errors: PluginValidationIssue[];
  warnings: PluginValidationIssue[];
  manifest?: ForgeKiPluginManifest;
}

export interface PluginSafetyReport {
  result: 'safe' | 'warnings' | 'blocked';
  manifestValid: boolean;
  forgekiCompatible: boolean;
  permissions: readonly string[];
  generatedFiles: number;
  dependencies: number;
  scripts: number;
  environmentVariables: number;
  scannerRules: number;
  unsupportedCapabilities: readonly string[];
  suspiciousPaths: readonly string[];
  errors: readonly PluginValidationIssue[];
  warnings: readonly PluginValidationIssue[];
}

const permissionForContribution = {
  stackComponents: 'project:add-stack-components',
  generatedFiles: 'project:generate-files',
  templates: 'project:generate-files',
  dependencies: 'project:add-dependencies',
  devDependencies: 'project:add-dependencies',
  scripts: 'project:add-scripts',
  environmentVariables: 'project:add-env-schema',
  scannerRules: 'project:add-scanner-rules',
} as const satisfies Record<keyof PluginContributions, PluginPermission>;

const frameworks = new Set<PluginFramework>(['nextjs', 'react-vite', 'express']);
const lifecycleScripts = new Set([
  'preinstall',
  'install',
  'postinstall',
  'prepare',
  'prepublish',
  'prepublishonly',
]);
const allowedVariables = new Set(['project.name', 'project.framework', 'project.packageManager']);

export class PluginManifestError extends Error {
  constructor(
    readonly code: PluginErrorCode,
    message: string,
    readonly issues: readonly PluginValidationIssue[] = [],
  ) {
    super(message);
    this.name = 'PluginManifestError';
  }
}

export function defineForgeKiPlugin<const T extends ForgeKiPluginManifest>(manifest: T): T {
  const result = validatePluginManifest(manifest);
  if (!result.valid)
    throw new PluginManifestError('INVALID_MANIFEST', result.errors[0]!.message, result.errors);
  return deepFreeze(structuredClone(manifest));
}

export function defineStackComponent<const T extends PluginStackComponent>(value: T): T {
  return deepFreeze(structuredClone(value));
}

export function defineTemplateContribution<const T extends PluginTemplateContribution>(
  value: T,
): T {
  return deepFreeze(structuredClone(value));
}

export function defineCompatibilityRule<
  const T extends Pick<
    PluginStackComponent,
    'supportedFrameworks' | 'requires' | 'conflictsWith' | 'provides' | 'requiresCapabilities'
  >,
>(value: T): T {
  return deepFreeze(structuredClone(value));
}

export function defineScannerRule<const T extends PluginScannerRule>(value: T): T {
  return deepFreeze(structuredClone(value));
}

export function validatePluginManifest(value: unknown): PluginValidationResult {
  const errors: PluginValidationIssue[] = [];
  const warnings: PluginValidationIssue[] = [];
  const error = (code: PluginErrorCode, path: string, message: string) =>
    errors.push({ code, path, message });
  const size = byteLength(value);
  if (size > MAX_MANIFEST_BYTES)
    error('UNSAFE_CONTRIBUTION', '$', `Manifest exceeds ${MAX_MANIFEST_BYTES} bytes.`);
  if (!isRecord(value))
    return {
      valid: false,
      errors: [
        { code: 'INVALID_MANIFEST', path: '$', message: 'Plugin manifest must be an object.' },
      ],
      warnings,
    };
  const allowedTop = new Set([
    'manifestVersion',
    'id',
    'name',
    'version',
    'description',
    'author',
    'license',
    'homepage',
    'repository',
    'category',
    'compatibility',
    'supportedFrameworks',
    'permissions',
    'contributions',
  ]);
  for (const key of Object.keys(value))
    if (!allowedTop.has(key))
      error(
        'UNSUPPORTED_CAPABILITY',
        key,
        `Unknown or executable manifest field "${key}" is not supported.`,
      );
  if (value.manifestVersion !== PLUGIN_MANIFEST_VERSION)
    error(
      'UNSUPPORTED_MANIFEST_VERSION',
      'manifestVersion',
      'Only plugin manifest version 1 is supported.',
    );
  if (!isPluginId(value.id))
    error('INVALID_MANIFEST', 'id', 'Plugin id must use the publisher.plugin namespace format.');
  for (const key of ['name', 'description', 'license'] as const)
    if (!safeText(value[key], key === 'description' ? 1000 : 120))
      error('INVALID_MANIFEST', key, `${key} is required and contains invalid characters.`);
  if (!isSemver(value.version))
    error('INVALID_MANIFEST', 'version', 'Plugin version must be semantic versioning.');
  if (
    !(typeof value.author === 'string'
      ? safeText(value.author, 120)
      : isRecord(value.author) && safeText(value.author.name, 120))
  )
    error('INVALID_MANIFEST', 'author', 'Plugin author is required.');
  for (const key of ['homepage', 'repository'] as const)
    if (value[key] !== undefined && !isHttpUrl(value[key]))
      error('INVALID_MANIFEST', key, `${key} must be an http(s) URL.`);
  if (!isRecord(value.compatibility) || !isSemverRange(value.compatibility.forgeki))
    error(
      'INVALID_MANIFEST',
      'compatibility.forgeki',
      'ForgeKi compatibility must be a supported semantic-version range.',
    );
  if (
    !Array.isArray(value.supportedFrameworks) ||
    value.supportedFrameworks.length === 0 ||
    value.supportedFrameworks.some((item) => !frameworks.has(item as PluginFramework))
  )
    error(
      'INVALID_MANIFEST',
      'supportedFrameworks',
      'At least one supported ForgeKi framework is required.',
    );
  const permissionValues = Array.isArray(value.permissions) ? value.permissions : [];
  if (!Array.isArray(value.permissions))
    error('INVALID_MANIFEST', 'permissions', 'Permissions must be an array.');
  const permissions = new Set(
    permissionValues.filter((item): item is string => typeof item === 'string'),
  );
  for (const permission of permissions)
    if (!SUPPORTED_PLUGIN_PERMISSIONS.includes(permission as PluginPermission))
      error('PERMISSION_DENIED', 'permissions', `Unsupported permission "${permission}".`);
  if (permissions.size !== permissionValues.length)
    error('DUPLICATE_CONTRIBUTION', 'permissions', 'Permissions must be unique strings.');
  if (!isRecord(value.contributions))
    error('INVALID_MANIFEST', 'contributions', 'Contributions must be an object.');
  else validateContributions(value.contributions, permissions, error);
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    ...(errors.length === 0
      ? { manifest: structuredClone(value) as unknown as ForgeKiPluginManifest }
      : {}),
  };
}

function validateContributions(
  value: Record<string, unknown>,
  permissions: Set<string>,
  error: (code: PluginErrorCode, path: string, message: string) => void,
) {
  for (const key of Object.keys(value))
    if (!(key in permissionForContribution))
      error(
        'UNSUPPORTED_CAPABILITY',
        `contributions.${key}`,
        `Unsupported contribution type "${key}".`,
      );
  for (const [key, required] of Object.entries(permissionForContribution)) {
    const contribution = value[key];
    const present = Array.isArray(contribution)
      ? contribution.length > 0
      : isRecord(contribution)
        ? Object.keys(contribution).length > 0
        : contribution !== undefined;
    if (present && !permissions.has(required))
      error('PERMISSION_DENIED', `contributions.${key}`, `${required} permission is required.`);
  }
  validateFiles(value.generatedFiles, 'contributions.generatedFiles', error);
  if (Array.isArray(value.templates))
    value.templates.forEach((template, index) => {
      if (
        !isRecord(template) ||
        !safeIdentifier(template.id) ||
        !safeText(template.name, 120) ||
        !safeText(template.description, 500) ||
        !frameworks.has(template.framework as PluginFramework)
      )
        error(
          'INVALID_MANIFEST',
          `contributions.templates.${index}`,
          'Template contribution is invalid.',
        );
      else validateFiles(template.files, `contributions.templates.${index}.files`, error);
    });
  else if (value.templates !== undefined)
    error('INVALID_MANIFEST', 'contributions.templates', 'Templates must be an array.');
  validateDependencies(value.dependencies, 'contributions.dependencies', error);
  validateDependencies(value.devDependencies, 'contributions.devDependencies', error);
  if (value.scripts !== undefined) {
    if (!isRecord(value.scripts))
      error('INVALID_MANIFEST', 'contributions.scripts', 'Scripts must be an object.');
    else
      for (const [name, command] of Object.entries(value.scripts)) {
        if (!/^[a-z0-9][a-z0-9:_-]{0,63}$/iu.test(name) || lifecycleScripts.has(name.toLowerCase()))
          error(
            'UNSAFE_CONTRIBUTION',
            `contributions.scripts.${name}`,
            `Lifecycle or invalid script "${name}" is not allowed.`,
          );
        if (
          typeof command !== 'string' ||
          command.length > 300 ||
          /[\r\n\0]|(?:^|\s)(?:curl|wget|powershell|cmd|bash|sh)(?:\s|$)|&&|\|\||[;|<>]|\$\(/iu.test(
            command,
          )
        )
          error(
            'UNSAFE_CONTRIBUTION',
            `contributions.scripts.${name}`,
            'Script contains unsupported shell behavior.',
          );
      }
  }
  if (value.environmentVariables !== undefined) {
    if (!Array.isArray(value.environmentVariables))
      error(
        'INVALID_MANIFEST',
        'contributions.environmentVariables',
        'Environment variables must be an array.',
      );
    else
      uniqueBy(value.environmentVariables, 'name', 'environment variable', error, (item, index) => {
        if (
          !isRecord(item) ||
          !/^[A-Z][A-Z0-9_]{0,127}$/u.test(String(item.name)) ||
          !safeText(item.description, 500) ||
          typeof item.required !== 'boolean' ||
          typeof item.secret !== 'boolean' ||
          (item.exampleValue !== undefined &&
            (typeof item.exampleValue !== 'string' || item.exampleValue.length > 500))
        )
          error(
            'INVALID_MANIFEST',
            `contributions.environmentVariables.${index}`,
            'Environment-variable definition is invalid.',
          );
      });
  }
  if (value.stackComponents !== undefined) {
    if (!Array.isArray(value.stackComponents))
      error(
        'INVALID_MANIFEST',
        'contributions.stackComponents',
        'Stack components must be an array.',
      );
    else
      uniqueBy(value.stackComponents, 'id', 'stack component', error, (item, index) => {
        if (
          !isRecord(item) ||
          !safeIdentifier(item.id) ||
          !safeText(item.name, 120) ||
          !safeText(item.description, 500) ||
          !Array.isArray(item.supportedFrameworks) ||
          item.supportedFrameworks.some((entry) => !frameworks.has(entry as PluginFramework))
        )
          error(
            'INVALID_MANIFEST',
            `contributions.stackComponents.${index}`,
            'Stack component is invalid.',
          );
      });
  }
  if (value.scannerRules !== undefined) {
    if (!Array.isArray(value.scannerRules))
      error('INVALID_MANIFEST', 'contributions.scannerRules', 'Scanner rules must be an array.');
    else
      uniqueBy(value.scannerRules, 'id', 'scanner rule', error, (item, index) =>
        validateScannerRule(item, index, error),
      );
  }
}

function validateFiles(
  value: unknown,
  location: string,
  error: (code: PluginErrorCode, path: string, message: string) => void,
) {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    error('INVALID_MANIFEST', location, 'Generated files must be an array.');
    return;
  }
  const paths = new Set<string>();
  value.forEach((item, index) => {
    const at = `${location}.${index}`;
    if (!isRecord(item) || !isSafeRelativePath(item.path)) {
      error(
        'UNSAFE_CONTRIBUTION',
        `${at}.path`,
        'Generated file path must be a safe relative text path.',
      );
      return;
    }
    const normalized = String(item.path).replaceAll('\\', '/').toLowerCase();
    if (paths.has(normalized))
      error(
        'DUPLICATE_CONTRIBUTION',
        `${at}.path`,
        `Duplicate generated-file ownership for ${String(item.path)}.`,
      );
    paths.add(normalized);
    if ((item.content === undefined) === (item.source === undefined))
      error(
        'INVALID_MANIFEST',
        at,
        'Generated file must provide exactly one of content or source.',
      );
    if (typeof item.content === 'string') {
      if (Buffer.byteLength(item.content, 'utf8') > MAX_TEMPLATE_FILE_BYTES)
        error(
          'UNSAFE_CONTRIBUTION',
          `${at}.content`,
          'Generated file exceeds the single-file size limit.',
        );
      for (const variable of templateVariables(item.content))
        if (!allowedVariables.has(variable))
          error(
            'UNSAFE_CONTRIBUTION',
            `${at}.content`,
            `Unknown template variable {{${variable}}}.`,
          );
    }
    if (item.source !== undefined && !isSafeRelativePath(item.source))
      error('UNSAFE_CONTRIBUTION', `${at}.source`, 'Template source must be a safe relative path.');
  });
}

function validateDependencies(
  value: unknown,
  location: string,
  error: (code: PluginErrorCode, path: string, message: string) => void,
) {
  if (value === undefined) return;
  const entries = Array.isArray(value)
    ? value.map((item) => (isRecord(item) ? [item.name, item.version] : [undefined, undefined]))
    : isRecord(value)
      ? Object.entries(value)
      : [];
  if (!Array.isArray(value) && !isRecord(value)) {
    error('INVALID_MANIFEST', location, 'Dependencies must be an array or object.');
    return;
  }
  const names = new Set<string>();
  entries.forEach(([name, version], index) => {
    if (!isPackageName(name) || !isSemverRange(version))
      error(
        'UNSAFE_CONTRIBUTION',
        `${location}.${index}`,
        'Dependencies require a registry package name and semantic-version range.',
      );
    if (typeof name === 'string') {
      if (names.has(name))
        error('DUPLICATE_CONTRIBUTION', `${location}.${index}`, `Duplicate dependency ${name}.`);
      names.add(name);
    }
  });
}

function validateScannerRule(
  value: unknown,
  index: number,
  error: (code: PluginErrorCode, path: string, message: string) => void,
) {
  const at = `contributions.scannerRules.${index}`;
  if (
    !isRecord(value) ||
    !safeIdentifier(value.id) ||
    !safeIdentifier(value.componentId) ||
    !isRecord(value.detect) ||
    !Array.isArray(value.detect.any) ||
    value.detect.any.length === 0 ||
    value.detect.any.length > 20
  ) {
    error('INVALID_MANIFEST', at, 'Scanner rule is invalid.');
    return;
  }
  value.detect.any.forEach((evidence, evidenceIndex) => {
    if (!isRecord(evidence) || Object.keys(evidence).length !== 1) {
      error(
        'UNSAFE_CONTRIBUTION',
        `${at}.detect.any.${evidenceIndex}`,
        'Scanner evidence must use one supported predicate.',
      );
      return;
    }
    const [kind, target] = Object.entries(evidence)[0]!;
    if (!['dependency', 'devDependency', 'file', 'script', 'environmentVariable'].includes(kind))
      error(
        'UNSUPPORTED_CAPABILITY',
        `${at}.detect.any.${evidenceIndex}`,
        `Unsupported scanner evidence "${kind}".`,
      );
    else if (
      kind === 'file'
        ? !isSafeRelativePath(target)
        : kind === 'environmentVariable'
          ? !/^[A-Z][A-Z0-9_]*$/u.test(String(target))
          : kind === 'script'
            ? !/^[a-z0-9:_-]+$/iu.test(String(target))
            : !isPackageName(target)
    )
      error(
        'UNSAFE_CONTRIBUTION',
        `${at}.detect.any.${evidenceIndex}`,
        'Scanner evidence target is unsafe.',
      );
  });
}

export function createPluginSafetyReport(
  value: unknown,
  forgekiVersion = '0.3.0',
): PluginSafetyReport {
  const validation = validatePluginManifest(value);
  const manifest = validation.manifest;
  const contributions = manifest?.contributions;
  const unsupported = validation.errors
    .filter(({ code }) => code === 'PERMISSION_DENIED' || code === 'UNSUPPORTED_CAPABILITY')
    .map(({ message }) => message);
  const suspicious = validation.errors
    .filter(({ path }) => path.includes('path') || path.includes('source'))
    .map(({ message }) => message);
  const forgekiCompatible = manifest
    ? satisfiesForgeKiVersion(forgekiVersion, manifest.compatibility.forgeki)
    : false;
  const errors = [
    ...validation.errors,
    ...(!forgekiCompatible && manifest
      ? [
          {
            code: 'COMPATIBILITY_FAILURE' as const,
            path: 'compatibility.forgeki',
            message: `Plugin does not support ForgeKi ${forgekiVersion}.`,
          },
        ]
      : []),
  ];
  return {
    result: errors.length ? 'blocked' : validation.warnings.length ? 'warnings' : 'safe',
    manifestValid: validation.valid,
    forgekiCompatible,
    permissions: manifest?.permissions ?? [],
    generatedFiles: contributions?.generatedFiles?.length ?? 0,
    dependencies:
      dependencyCount(contributions?.dependencies) +
      dependencyCount(contributions?.devDependencies),
    scripts: Object.keys(contributions?.scripts ?? {}).length,
    environmentVariables: contributions?.environmentVariables?.length ?? 0,
    scannerRules: contributions?.scannerRules?.length ?? 0,
    unsupportedCapabilities: unsupported,
    suspiciousPaths: suspicious,
    errors,
    warnings: validation.warnings,
  };
}

export function renderPluginTemplate(
  template: string,
  context: { project: { name: string; framework: PluginFramework; packageManager: string } },
): string {
  for (const variable of templateVariables(template))
    if (!allowedVariables.has(variable))
      throw new PluginManifestError(
        'UNSAFE_CONTRIBUTION',
        `Unknown template variable {{${variable}}}.`,
      );
  const values: Record<string, string> = {
    'project.name': context.project.name,
    'project.framework': context.project.framework,
    'project.packageManager': context.project.packageManager,
  };
  return `${template
    .replace(/\{\{\s*([A-Za-z.]+)\s*\}\}/gu, (_match, variable: string) => values[variable] ?? '')
    .replace(/\r\n?/gu, '\n')
    .replace(/\n*$/u, '')}\n`;
}

export function serializePluginManifest(manifest: ForgeKiPluginManifest): string {
  const result = validatePluginManifest(manifest);
  if (!result.valid)
    throw new PluginManifestError('INVALID_MANIFEST', result.errors[0]!.message, result.errors);
  return `${JSON.stringify(sortDeep(manifest), null, 2)}\n`;
}

export function normalizeDependencies(
  value: PluginContributions['dependencies'],
): PluginDependency[] {
  const entries = Array.isArray(value)
    ? value
    : Object.entries(value ?? {}).map(([name, version]) => ({ name, version }));
  return [...entries].sort((a, b) => a.name.localeCompare(b.name));
}

export function isSafeRelativePluginPath(value: unknown): value is string {
  return isSafeRelativePath(value);
}
export function isSafePackageName(value: unknown): value is string {
  return isPackageName(value);
}

function isPluginId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?\.[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/u.test(value)
  );
}
function safeIdentifier(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[a-z0-9][a-z0-9._-]{0,127}$/u.test(value) &&
    !value.includes('..')
  );
}
function safeText(value: unknown, max: number): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= max &&
    !hasControlCharacters(value, true)
  );
}
function isSemver(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u.test(
      value,
    )
  );
}
function isSemverRange(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 80 &&
    /^(?:[~^]|>=?|<=?)?\s*(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\s+(?:<|<=|>|>=)\s*(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))?$/u.test(
      value,
    )
  );
}
function isHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 500) return false;
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') && Boolean(url.hostname);
  } catch {
    return false;
  }
}
function isPackageName(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 214 &&
    /^(?:@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*|[a-z0-9][a-z0-9._-]*)$/u.test(value) &&
    !value.includes('..')
  );
}
function isSafeRelativePath(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    !value ||
    value.length > 240 ||
    hasControlCharacters(value, false) ||
    /^[a-z][a-z+.-]*:/iu.test(value) ||
    /^[\\/]|^[A-Za-z]:/u.test(value)
  )
    return false;
  const parts = value.replaceAll('\\', '/').split('/');
  const extension = parts.at(-1)?.split('.').at(-1)?.toLowerCase();
  return (
    !parts.some((part) => !part || part === '.' || part === '..') &&
    !['exe', 'dll', 'node', 'bat', 'cmd', 'ps1', 'sh', 'com', 'msi'].includes(extension ?? '')
  );
}
function hasControlCharacters(value: string, allowWhitespace: boolean): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    if (allowWhitespace && (code === 9 || code === 10 || code === 13)) return false;
    return code < 32 || code === 127;
  });
}
function templateVariables(value: string): string[] {
  return [...value.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/gu)].map((match) => match[1]!);
}
function byteLength(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value), 'utf8');
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}
function dependencyCount(value: PluginContributions['dependencies']): number {
  return Array.isArray(value) ? value.length : Object.keys(value ?? {}).length;
}
function satisfiesForgeKiVersion(version: string, range: string): boolean {
  const parse = (input: string) => input.match(/\d+/gu)?.slice(0, 3).map(Number) ?? [];
  const current = parse(version);
  const target = parse(range);
  const compare =
    current[0] !== target[0]
      ? current[0]! - target[0]!
      : current[1] !== target[1]
        ? current[1]! - target[1]!
        : current[2]! - target[2]!;
  if (range.startsWith('>=')) return compare >= 0;
  if (range.startsWith('>')) return compare > 0;
  if (range.startsWith('<=')) return compare <= 0;
  if (range.startsWith('<')) return compare < 0;
  if (range.startsWith('^')) return current[0] === target[0] && compare >= 0;
  if (range.startsWith('~'))
    return current[0] === target[0] && current[1] === target[1] && compare >= 0;
  return compare === 0;
}
function uniqueBy(
  items: unknown[],
  key: string,
  label: string,
  error: (code: PluginErrorCode, path: string, message: string) => void,
  validate: (item: unknown, index: number) => void,
) {
  const seen = new Set<string>();
  items.forEach((item, index) => {
    validate(item, index);
    if (isRecord(item) && typeof item[key] === 'string') {
      const id = String(item[key]).toLowerCase();
      if (seen.has(id))
        error(
          'DUPLICATE_CONTRIBUTION',
          `contributions.${label}.${index}`,
          `Duplicate ${label} ${String(item[key])}.`,
        );
      seen.add(id);
    }
  });
}
function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (isRecord(value))
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortDeep(value[key])]),
    );
  return value;
}
function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    Object.values(value as Record<string, unknown>).forEach(deepFreeze);
  }
  return value;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
