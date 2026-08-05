import type { Framework as DetectedFramework } from './project-detection.js';

export type ForgeCommandName = 'create' | 'add' | 'check';

export interface PlaceholderResult {
  command: ForgeCommandName;
  implemented: false;
  message: string;
}

export function placeholderResult(command: ForgeCommandName): PlaceholderResult {
  return {
    command,
    implemented: false,
    message: `The ${command} command is registered but not implemented yet.`,
  };
}

export interface PluginContext {
  /** Absolute path to the project the plugin should inspect or modify. */
  cwd: string;
}

export interface PluginDetectionResult {
  /** True when every artifact managed by the plugin is already configured. */
  detected: boolean;
  state?: 'not-configured' | 'configured' | 'partial';
  message: string;
  /** Existing artifacts recognized by the plugin, relative to `cwd`. */
  files: readonly string[];
}

export type PluginApplyStatus = 'applied' | 'skipped' | 'unsupported';

export interface PluginApplyResult {
  status: PluginApplyStatus;
  message: string;
  /** Artifacts created by this invocation, relative to `cwd`. */
  createdFiles: readonly string[];
  /** Artifacts preserved because they already existed, relative to `cwd`. */
  skippedFiles: readonly string[];
}

export interface ForgePlugin {
  id: string;
  name: string;
  description: string;
  /** Version derived from the package that owns the plugin when available. */
  version?: string;
  /** Frameworks the trusted plugin is designed to configure. */
  supportedFrameworks?: readonly DetectedFramework[];
  /** Relative paths managed by this plugin. */
  managedFiles?: readonly string[];
  detect(context: PluginContext): Promise<PluginDetectionResult>;
  apply(context: PluginContext): Promise<PluginApplyResult>;
}

export {
  detectProject,
  type Framework,
  type PackageManager,
  type ProjectDetectionResult,
  type ProjectLanguage,
} from './project-detection.js';
export { createFileSafely } from './file-safety.js';
export {
  packageManagerCommand,
  SUPPORTED_PACKAGE_MANAGER_VERSIONS,
  type SupportedPackageManager,
} from './package-managers.js';
export { validateProjectName, type ProjectNameValidationResult } from './project-name.js';
