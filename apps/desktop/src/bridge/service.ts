import path from 'node:path';
import {
  detectProject,
  isStackComponentId,
  isStackFramework,
  validateProjectName,
  validateStack,
  type StackDefinition,
  type SupportedPackageManager,
} from '@forgecli7/core';
import {
  applyBuiltinPlugin,
  BuiltInCatalogProvider,
  BundledCommunityCatalogProvider,
  inspectBuiltinPlugins,
  isBuiltinPluginId,
  LocalInstalledCatalogProvider,
  loadPlugins,
  PluginStore,
  composePluginCatalog,
  createPluginStarter,
  evaluatePluginScannerRules,
} from '@forgecli7/plugins';
import {
  createGenerationPlan,
  createProject,
  CreateProjectError,
  isTemplateId,
  type ProjectGenerationPlan,
} from '@forgecli7/templates';
import { checkDeveloperTools } from './developer-tools.js';
import {
  createWorkspaceGenerationPlan,
  executeWorkspaceGenerationPlan,
  parseWorkspaceDefinition,
  scanWorkspace,
  type WorkspaceGenerationPlan,
} from '@forgecli7/workspaces';
import type {
  DesktopCreateRequest,
  DesktopCreateResult,
  DesktopProjectScan,
  PluginApplyResponse,
  ProgressEvent,
  ProgressStepId,
} from '../types';
import {
  createDeploymentPlan,
  exportDeploymentPlan,
  parseDeploymentTargetId,
  parseEnvironmentProfileId,
  scanDeploymentProject,
  type DeploymentPlanOptions,
  type DeploymentProfile,
} from '@forgecli7/deployments';
import {
  ApplicationUpdateService,
  MarketplaceCache,
  MarketplaceService,
  RemoteMarketplaceCatalogProvider,
  UnconfiguredMarketplaceProvider,
  UnconfiguredUpdateProvider,
  defaultMarketplaceCacheRoot,
} from '@forgecli7/marketplace';

export interface WorkerEnvelope {
  operationId: string;
  operation?:
    | 'create'
    | 'plan-stack'
    | 'scan'
    | 'inspect-plugins'
    | 'apply-plugin'
    | 'check-tools'
    | 'plugins-catalog'
    | 'plugin-validate'
    | 'plugin-install'
    | 'plugin-install-bundled'
    | 'plugin-remove'
    | 'plugin-create'
    | 'plan-workspace'
    | 'create-workspace'
    | 'scan-workspace'
    | 'scan-deployment'
    | 'plan-deployment'
    | 'export-deployment'
    | 'marketplace-status'
    | 'marketplace-refresh'
    | 'marketplace-cache-clear'
    | 'marketplace-search'
    | 'marketplace-show'
    | 'marketplace-review-install'
    | 'plugin-install-remote'
    | 'plugin-updates'
    | 'plugin-update-remote'
    | 'application-update-check';
  request: unknown;
}

export type WorkerMessage =
  | { type: 'progress'; payload: ProgressEvent }
  | { type: 'result'; payload: DesktopCreateResult }
  | { type: 'operation-result'; payload: unknown }
  | { type: 'error'; payload: { code: string; message: string; details?: string } };

let quarantineStartupCleanup: Promise<void> | undefined;

const requestKeys = new Set([
  'projectName',
  'destinationDirectory',
  'framework',
  'templateId',
  'packageManager',
  'initializeGit',
  'addDocker',
  'addGitHubActions',
  'stack',
  'generationPlan',
]);

export async function handleWorkerEnvelope(
  envelope: WorkerEnvelope,
  send: (message: WorkerMessage) => void,
): Promise<void> {
  quarantineStartupCleanup ??= marketplaceService()
    .cleanupQuarantine()
    .catch(() => undefined);
  await quarantineStartupCleanup;
  const operation = envelope.operation ?? 'create';
  if (operation !== 'create') {
    await handleOperation(operation, envelope.request, send);
    return;
  }
  let currentStep: ProgressStepId = 'validate';
  const progress = (step: ProgressStepId, state: ProgressEvent['state'], message: string) => {
    if (state === 'running') currentStep = step;
    send({
      type: 'progress',
      payload: { operationId: envelope.operationId, step, state, message },
    });
  };

  try {
    const request = validateRequest(envelope.request);
    const generationPlan = request.stack
      ? await createGenerationPlan(request.stack, {
          projectName: request.projectName,
          destinationDirectory: request.destinationDirectory,
          templateId: request.templateId,
          declarativePlugins: await declarativeSources(request.stack),
        })
      : undefined;
    if (
      request.generationPlan &&
      JSON.stringify(request.generationPlan) !== JSON.stringify(generationPlan)
    ) {
      throw new CreateProjectError(
        'SCAFFOLD_FAILED',
        'The reviewed generation plan no longer matches the trusted stack plan.',
      );
    }
    progress('validate', 'running', 'Checking project configuration');
    progress('validate', 'succeeded', 'Project configuration is valid');
    progress('prepare', 'running', 'Checking the selected destination');
    progress('scaffold', 'running', `Writing the ${request.framework} project safely`);

    const result = await createProject({
      ...request,
      ...(generationPlan ? { generationPlan } : {}),
      plugins: loadPlugins().list(),
    });
    progress('prepare', 'succeeded', 'Destination passed safety checks');
    progress('scaffold', 'succeeded', `${request.framework} project files were created`);
    if (request.initializeGit) {
      progress('git', 'running', 'Checking Git initialization');
      progress(
        'git',
        result.gitInitialized ? 'succeeded' : 'warning',
        result.gitInitialized ? 'Git repository initialized' : gitWarning(result.warnings),
      );
    } else progress('git', 'skipped', 'Git was not requested');
    if (request.addDocker) {
      progress('docker', 'running', 'Checking Docker plugin output');
      reportPlugin(progress, result, 'docker', 'Docker');
    } else progress('docker', 'skipped', 'Docker was not requested');
    if (request.addGitHubActions) {
      progress('github-actions', 'running', 'Checking GitHub Actions plugin output');
      reportPlugin(progress, result, 'github-actions', 'GitHub Actions');
    } else progress('github-actions', 'skipped', 'GitHub Actions was not requested');
    progress('finish', 'running', 'Verifying the generated project');
    const detection = await detectProject(result.projectDirectory);
    if (detection.framework !== request.framework) {
      throw new CreateProjectError(
        'SCAFFOLD_FAILED',
        'The generated project framework could not be verified.',
      );
    }
    progress('finish', 'succeeded', 'Project creation finished');
    send({
      type: 'result',
      payload: {
        projectName: request.projectName,
        projectDirectory: result.projectDirectory,
        framework: request.framework,
        templateId: request.templateId,
        packageManager: request.packageManager,
        initializedFeatures: [
          ...(result.gitInitialized ? ['Git'] : []),
          ...(result.appliedPlugins.includes('docker') ? ['Docker'] : []),
          ...(result.appliedPlugins.includes('github-actions') ? ['GitHub Actions'] : []),
        ],
        warnings: result.warnings,
        ...(generationPlan ? { generationPlan } : {}),
      },
    });
  } catch (error) {
    progress(currentStep, 'failed', `${stepLabel(currentStep)} failed`);
    send({ type: 'error', payload: publicError(error) });
  }
}

export function validateRequest(value: unknown): DesktopCreateRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalidPayload();
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => !requestKeys.has(key))) invalidPayload();
  const projectName = typeof input.projectName === 'string' ? input.projectName.trim() : '';
  const validation = validateProjectName(projectName);
  if (!validation.valid)
    throw new CreateProjectError(
      'INVALID_PROJECT_NAME',
      validation.message ?? 'Invalid project name.',
    );
  if (
    typeof input.destinationDirectory !== 'string' ||
    !path.isAbsolute(input.destinationDirectory) ||
    input.destinationDirectory.includes('\0')
  ) {
    throw new CreateProjectError(
      'UNSAFE_DESTINATION',
      'A selected absolute destination is required.',
    );
  }
  if (!isStackFramework(input.framework))
    throw new CreateProjectError('UNSUPPORTED_FRAMEWORK', 'Unsupported built-in framework.');
  const templateId =
    input.templateId ?? (input.framework === 'nextjs' ? 'nextjs-blank' : input.framework);
  if (
    typeof templateId !== 'string' ||
    (input.framework === 'nextjs' && !isTemplateId(templateId)) ||
    (input.framework !== 'nextjs' && templateId !== input.framework)
  )
    invalidPayload();
  if (!isPackageManager(input.packageManager)) invalidPayload();
  const initializeGit = readBoolean(input, 'initializeGit');
  const addDocker = readBoolean(input, 'addDocker');
  const addGitHubActions = readBoolean(input, 'addGitHubActions');
  return {
    projectName,
    destinationDirectory: input.destinationDirectory,
    framework: input.framework,
    templateId: templateId as DesktopCreateRequest['templateId'],
    packageManager: input.packageManager,
    initializeGit,
    addDocker,
    addGitHubActions,
    ...(input.stack === undefined ? {} : { stack: readStackDefinition(input.stack) }),
    ...(input.generationPlan === undefined
      ? {}
      : { generationPlan: input.generationPlan as ProjectGenerationPlan }),
  };
}

export async function scanProjectDirectory(directory: string): Promise<DesktopProjectScan> {
  const safeDirectory = validateAbsoluteDirectory(directory);
  const project = await detectProject(safeDirectory);
  const plugins = await inspectBuiltinPlugins(safeDirectory);
  const recommendations = [];
  const docker = plugins.find(({ id }) => id === 'docker');
  const actions = plugins.find(({ id }) => id === 'github-actions');
  if (docker?.status === 'available') {
    recommendations.push({
      id: 'docker-missing',
      severity: 'info' as const,
      message: 'Docker configuration is missing.',
      pluginId: 'docker' as const,
    });
  }
  if (actions?.status === 'available') {
    recommendations.push({
      id: 'github-actions-missing',
      severity: 'info' as const,
      message: 'GitHub Actions CI is missing.',
      pluginId: 'github-actions' as const,
    });
  }
  if (!Object.keys(project.scripts).some((script) => /^(?:test|lint|typecheck)$/u.test(script))) {
    recommendations.push({
      id: 'test-script-missing',
      severity: 'warning' as const,
      message: 'No recognized test, lint, or typecheck script was found.',
    });
  }
  if (project.warnings.some((warning) => warning.startsWith('Multiple package-manager'))) {
    recommendations.push({
      id: 'multiple-lockfiles',
      severity: 'warning' as const,
      message: 'Multiple package-manager lockfiles were detected.',
    });
  }
  if (project.language === 'typescript') {
    recommendations.push({
      id: 'typescript-present',
      severity: 'info' as const,
      message: 'TypeScript configuration is present.',
    });
  }
  const installed = await new PluginStore().list().catch(() => []);
  const pluginEvidence = (
    await Promise.all(
      installed.map((plugin) =>
        evaluatePluginScannerRules(plugin, {
          directory: safeDirectory,
          dependencies: project.dependencies,
          devDependencies: project.devDependencies,
          scripts: project.scripts,
        }),
      ),
    )
  ).flat();
  const pluginStack = pluginEvidence.map((item) => ({
    id: item.componentId,
    state: 'detected' as const,
    evidence: item.evidence.map((value) => `Detected via plugin: ${item.pluginId} (${value})`),
  }));
  return {
    ...project,
    projectName: project.projectName ?? path.basename(safeDirectory),
    plugins,
    recommendations,
    stackComponents: [...project.stackComponents, ...pluginStack],
    pluginEvidence,
  };
}

async function handleOperation(
  operation: Exclude<NonNullable<WorkerEnvelope['operation']>, 'create'>,
  request: unknown,
  send: (message: WorkerMessage) => void,
): Promise<void> {
  try {
    let result: unknown;
    if (operation === 'plan-stack') {
      const input = readStackPlanRequest(request);
      result = await createGenerationPlan(input.stack, {
        ...input,
        declarativePlugins: await declarativeSources(input.stack),
      });
    } else if (operation === 'plan-workspace') {
      const input = readWorkspaceRequest(request, false);
      result = await createWorkspaceGenerationPlan(input.definition, {
        destinationDirectory: input.destinationDirectory,
      });
    } else if (operation === 'create-workspace') {
      const input = readWorkspaceRequest(request, true);
      const trustedPlan = await createWorkspaceGenerationPlan(input.definition, {
        destinationDirectory: input.destinationDirectory,
      });
      if (JSON.stringify(trustedPlan) !== JSON.stringify(input.reviewedPlan))
        throw new Error('The reviewed workspace plan no longer matches the trusted plan.');
      result = await executeWorkspaceGenerationPlan(trustedPlan);
    } else if (operation === 'scan-workspace') {
      result = await scanWorkspace(readDirectoryRequest(request));
    } else if (operation === 'scan-deployment') {
      result = await scanDeploymentProject(readDirectoryRequest(request));
    } else if (operation === 'plan-deployment') {
      const input = readDeploymentRequest(request, false);
      const scan = await scanDeploymentProject(input.projectDirectory);
      result = createDeploymentPlan(
        scan.project,
        parseEnvironmentProfileId(input.environment),
        parseDeploymentTargetId(input.target, scan.project),
        input.options,
      );
    } else if (operation === 'export-deployment') {
      const input = readDeploymentRequest(request, true);
      const scan = await scanDeploymentProject(input.projectDirectory);
      const trusted = createDeploymentPlan(
        scan.project,
        parseEnvironmentProfileId(input.environment),
        parseDeploymentTargetId(input.target, scan.project),
        input.options,
      );
      if (JSON.stringify(trusted) !== JSON.stringify(input.reviewedPlan))
        throw new Error('The reviewed deployment plan no longer matches the trusted plan.');
      result = await exportDeploymentPlan(trusted, input.destinationDirectory!);
    } else if (operation === 'scan') {
      result = await scanProjectDirectory(readDirectoryRequest(request));
    } else if (operation === 'inspect-plugins') {
      const directory = readOptionalDirectoryRequest(request);
      result = await inspectBuiltinPlugins(directory);
    } else if (operation === 'apply-plugin') {
      const input = readPluginRequest(request);
      const applied = await applyBuiltinPlugin(input.projectDirectory, input.pluginId);
      result = {
        ...applied,
        scan: await scanProjectDirectory(input.projectDirectory),
      } satisfies PluginApplyResponse;
    } else if (operation === 'plugins-catalog') {
      if (!isEmptyRecord(request)) invalidPayload();
      const store = new PluginStore();
      result = await composePluginCatalog([
        new BuiltInCatalogProvider(),
        new BundledCommunityCatalogProvider(store),
        new LocalInstalledCatalogProvider(store),
        new RemoteMarketplaceCatalogProvider(marketplaceService(store)),
      ]);
    } else if (operation === 'marketplace-status') {
      if (!isEmptyRecord(request)) invalidPayload();
      result = await marketplaceService().status();
    } else if (operation === 'marketplace-refresh') {
      if (!isEmptyRecord(request)) invalidPayload();
      const snapshot = await marketplaceService().refresh();
      result = { pluginCount: snapshot.index.plugins.length, verifiedAt: snapshot.verifiedAt };
    } else if (operation === 'marketplace-cache-clear') {
      if (!isEmptyRecord(request)) invalidPayload();
      await marketplaceService().cache.clear();
      result = { cleared: true };
    } else if (operation === 'marketplace-search') {
      result = await marketplaceService().search(readMarketplaceSearch(request));
    } else if (operation === 'marketplace-show') {
      result = await marketplaceService().show(readPluginIdRequest(request));
    } else if (operation === 'marketplace-review-install') {
      result = await marketplaceService().prepareInstall(readPluginIdRequest(request));
    } else if (operation === 'plugin-install-remote') {
      const input = readRemotePluginMutation(request);
      result = catalogInstalled(await marketplaceService().install(input.id, input.confirmed));
    } else if (operation === 'plugin-updates') {
      if (!isEmptyRecord(request)) invalidPayload();
      result = await marketplaceService().updates();
    } else if (operation === 'plugin-update-remote') {
      const input = readRemotePluginMutation(request);
      result = catalogInstalled(
        await marketplaceService().update(input.id, input.confirmed, input.confirmPermissions),
      );
    } else if (operation === 'application-update-check') {
      const input = readUpdateRequest(request);
      result = await applicationUpdateService().check(input.currentVersion, input.channel);
    } else if (operation === 'plugin-validate') {
      result = await new PluginStore().validate(readPluginDirectoryRequest(request));
    } else if (operation === 'plugin-install') {
      result = catalogInstalled(
        await new PluginStore().install(readPluginDirectoryRequest(request)),
      );
    } else if (operation === 'plugin-install-bundled') {
      result = catalogInstalled(
        await new PluginStore().installBundled(readPluginIdRequest(request)),
      );
    } else if (operation === 'plugin-remove') {
      await new PluginStore().remove(readPluginIdRequest(request));
      result = { removed: true };
    } else if (operation === 'plugin-create') {
      const input = readPluginCreateRequest(request);
      result = { directory: await createPluginStarter(input.parent, input.name) };
    } else {
      if (!isEmptyRecord(request)) invalidPayload();
      result = await checkDeveloperTools();
    }
    send({ type: 'operation-result', payload: result });
  } catch (error) {
    send({ type: 'error', payload: publicError(error) });
  }
}

function marketplaceService(store = new PluginStore()): MarketplaceService {
  return new MarketplaceService(
    new UnconfiguredMarketplaceProvider(),
    [],
    new MarketplaceCache(defaultMarketplaceCacheRoot()),
    store,
  );
}

function applicationUpdateService(): ApplicationUpdateService {
  return new ApplicationUpdateService(new UnconfiguredUpdateProvider(), []);
}

function readMarketplaceSearch(value: unknown) {
  if (
    !isRecord(value) ||
    Object.keys(value).some(
      (key) =>
        ![
          'text',
          'category',
          'framework',
          'publisher',
          'installed',
          'compatible',
          'verifiedPublisher',
        ].includes(key),
    )
  )
    invalidPayload();
  const result: Record<string, string | boolean> = {};
  for (const key of ['text', 'category', 'framework', 'publisher'] as const) {
    if (value[key] !== undefined) {
      if (typeof value[key] !== 'string' || value[key].length > 200) invalidPayload();
      result[key] = value[key];
    }
  }
  for (const key of ['installed', 'compatible', 'verifiedPublisher'] as const) {
    if (value[key] !== undefined) {
      if (typeof value[key] !== 'boolean') invalidPayload();
      result[key] = value[key];
    }
  }
  return result;
}

function readRemotePluginMutation(value: unknown): {
  id: string;
  confirmed: boolean;
  confirmPermissions: boolean;
} {
  if (
    !isRecord(value) ||
    Object.keys(value).some(
      (key) => !['pluginId', 'confirmed', 'confirmPermissions'].includes(key),
    ) ||
    typeof value.confirmed !== 'boolean' ||
    (value.confirmPermissions !== undefined && typeof value.confirmPermissions !== 'boolean')
  )
    invalidPayload();
  return {
    id: readPluginIdRequest({ pluginId: value.pluginId }),
    confirmed: value.confirmed,
    confirmPermissions: value.confirmPermissions === true,
  };
}

function readUpdateRequest(value: unknown): { channel: 'stable' | 'beta'; currentVersion: string } {
  if (
    !isRecord(value) ||
    Object.keys(value).some((key) => !['channel', 'currentVersion'].includes(key)) ||
    !['stable', 'beta'].includes(String(value.channel)) ||
    typeof value.currentVersion !== 'string' ||
    value.currentVersion.length > 100
  )
    invalidPayload();
  return { channel: value.channel as 'stable' | 'beta', currentVersion: value.currentVersion };
}

function readDeploymentRequest(
  value: unknown,
  exporting: boolean,
): {
  projectDirectory: string;
  environment: string;
  target: string;
  options: DeploymentPlanOptions;
  destinationDirectory?: string;
  reviewedPlan?: DeploymentProfile;
} {
  if (
    !isRecord(value) ||
    Object.keys(value).some(
      (key) =>
        ![
          'projectDirectory',
          'environment',
          'target',
          'options',
          'destinationDirectory',
          'reviewedPlan',
        ].includes(key),
    ) ||
    typeof value.environment !== 'string' ||
    typeof value.target !== 'string' ||
    (value.options !== undefined && !isRecord(value.options)) ||
    (exporting &&
      (!isRecord(value.reviewedPlan) || typeof value.destinationDirectory !== 'string')) ||
    (!exporting && (value.reviewedPlan !== undefined || value.destinationDirectory !== undefined))
  )
    invalidPayload();
  const rawOptions = isRecord(value.options) ? value.options : {};
  if (
    Object.keys(rawOptions).some(
      (key) => !['replicas', 'resources', 'includeMetadata'].includes(key),
    ) ||
    (rawOptions.replicas !== undefined && typeof rawOptions.replicas !== 'number') ||
    (rawOptions.includeMetadata !== undefined && typeof rawOptions.includeMetadata !== 'boolean') ||
    (rawOptions.resources !== undefined && !isRecord(rawOptions.resources))
  )
    invalidPayload();
  return {
    projectDirectory: validateAbsoluteDirectory(value.projectDirectory),
    environment: value.environment,
    target: value.target,
    options: rawOptions as DeploymentPlanOptions,
    ...(exporting
      ? {
          destinationDirectory: validateAbsoluteDirectory(value.destinationDirectory),
          reviewedPlan: value.reviewedPlan as unknown as DeploymentProfile,
        }
      : {}),
  };
}

function readWorkspaceRequest(
  value: unknown,
  requiresPlan: boolean,
): {
  definition: ReturnType<typeof parseWorkspaceDefinition>;
  destinationDirectory: string;
  reviewedPlan?: WorkspaceGenerationPlan;
} {
  if (
    !isRecord(value) ||
    Object.keys(value).some(
      (key) => key !== 'definition' && key !== 'destinationDirectory' && key !== 'reviewedPlan',
    ) ||
    (requiresPlan && !isRecord(value.reviewedPlan)) ||
    (!requiresPlan && value.reviewedPlan !== undefined)
  )
    invalidPayload();
  return {
    definition: parseWorkspaceDefinition(value.definition),
    destinationDirectory: validateAbsoluteDirectory(value.destinationDirectory),
    ...(requiresPlan
      ? { reviewedPlan: value.reviewedPlan as unknown as WorkspaceGenerationPlan }
      : {}),
  };
}

function readStackPlanRequest(value: unknown): {
  projectName: string;
  destinationDirectory: string;
  templateId?: string;
  stack: StackDefinition;
} {
  if (
    !isRecord(value) ||
    Object.keys(value).some(
      (key) =>
        key !== 'projectName' &&
        key !== 'destinationDirectory' &&
        key !== 'templateId' &&
        key !== 'stack',
    )
  )
    invalidPayload();
  const projectName = typeof value.projectName === 'string' ? value.projectName.trim() : '';
  if (!validateProjectName(projectName).valid) invalidPayload();
  return {
    projectName,
    destinationDirectory: validateAbsoluteDirectory(value.destinationDirectory),
    ...(typeof value.templateId === 'string' ? { templateId: value.templateId } : {}),
    stack: readStackDefinition(value.stack),
  };
}

function readStackDefinition(value: unknown): StackDefinition {
  if (
    !isRecord(value) ||
    Object.keys(value).some(
      (key) =>
        ![
          'framework',
          'components',
          'packageManager',
          'initializeGit',
          'addDocker',
          'addGitHubActions',
          'templateId',
          'pluginComponents',
        ].includes(key),
    ) ||
    !isStackFramework(value.framework) ||
    !Array.isArray(value.components)
  )
    invalidPayload();
  if (!value.components.every(isStackComponentId)) invalidPayload();
  if (!isPackageManager(value.packageManager)) invalidPayload();
  if (
    value.pluginComponents !== undefined &&
    (!Array.isArray(value.pluginComponents) ||
      value.pluginComponents.length > 30 ||
      value.pluginComponents.some(
        (id) =>
          typeof id !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,127}$/u.test(id) || id.includes('..'),
      ))
  )
    invalidPayload();
  if (
    typeof value.initializeGit !== 'boolean' ||
    typeof value.addDocker !== 'boolean' ||
    typeof value.addGitHubActions !== 'boolean'
  )
    invalidPayload();
  const definition: StackDefinition = {
    framework: value.framework,
    components: value.components,
    packageManager: value.packageManager,
    initializeGit: value.initializeGit,
    addDocker: value.addDocker,
    addGitHubActions: value.addGitHubActions,
    ...(typeof value.templateId === 'string' ? { templateId: value.templateId } : {}),
    ...(Array.isArray(value.pluginComponents)
      ? {
          pluginComponents: value.pluginComponents.filter(
            (id): id is string =>
              typeof id === 'string' &&
              /^[a-z0-9][a-z0-9._-]{0,127}$/u.test(id) &&
              !id.includes('..'),
          ),
        }
      : {}),
  };
  if (!validateStack(definition).valid) invalidPayload();
  return definition;
}

async function declarativeSources(stack: StackDefinition) {
  return stack.pluginComponents?.length ? new PluginStore().loadPlanSources() : [];
}

function catalogInstalled(installed: Awaited<ReturnType<PluginStore['install']>>) {
  const manifest = installed.manifest;
  return {
    id: manifest.id,
    name: manifest.name,
    description: manifest.description,
    publisher: typeof manifest.author === 'string' ? manifest.author : manifest.author.name,
    version: manifest.version,
    category: manifest.category ?? 'Community',
    supportedFrameworks: manifest.supportedFrameworks,
    permissions: manifest.permissions,
    sourceType: installed.metadata.sourceType,
    builtIn: false,
    trusted: false,
    declarative: true,
    installed: true,
    integrity: installed.integrity,
    installedAt: installed.metadata.installedAt,
    manifest,
  };
}

function readPluginDirectoryRequest(value: unknown): string {
  if (!isRecord(value) || Object.keys(value).length !== 1) invalidPayload();
  return validateAbsoluteDirectory(value.sourceDirectory);
}

function readPluginIdRequest(value: unknown): string {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 1 ||
    typeof value.pluginId !== 'string' ||
    !/^[a-z0-9-]+\.[a-z0-9-]+$/u.test(value.pluginId)
  )
    invalidPayload();
  return value.pluginId;
}

function readPluginCreateRequest(value: unknown): { parent: string; name: string } {
  if (
    !isRecord(value) ||
    Object.keys(value).some((key) => key !== 'parent' && key !== 'name') ||
    typeof value.name !== 'string' ||
    !value.name.trim() ||
    value.name.length > 100
  )
    invalidPayload();
  return { parent: validateAbsoluteDirectory(value.parent), name: value.name };
}

function readDirectoryRequest(value: unknown): string {
  if (!isRecord(value) || Object.keys(value).length !== 1) invalidPayload();
  return validateAbsoluteDirectory(value.projectDirectory);
}

function readOptionalDirectoryRequest(value: unknown): string | undefined {
  if (!isRecord(value) || Object.keys(value).some((key) => key !== 'projectDirectory')) {
    invalidPayload();
  }
  return value.projectDirectory === undefined
    ? undefined
    : validateAbsoluteDirectory(value.projectDirectory);
}

function readPluginRequest(value: unknown): {
  projectDirectory: string;
  pluginId: 'docker' | 'github-actions';
} {
  if (
    !isRecord(value) ||
    Object.keys(value).some((key) => key !== 'projectDirectory' && key !== 'pluginId') ||
    !isBuiltinPluginId(value.pluginId)
  ) {
    invalidPayload();
  }
  return {
    projectDirectory: validateAbsoluteDirectory(value.projectDirectory),
    pluginId: value.pluginId,
  };
}

function validateAbsoluteDirectory(value: unknown): string {
  if (typeof value !== 'string' || !path.isAbsolute(value) || value.includes('\0')) {
    throw new Error('A selected absolute project directory is required.');
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isEmptyRecord(value: unknown): boolean {
  return isRecord(value) && Object.keys(value).length === 0;
}

function reportPlugin(
  progress: (step: ProgressStepId, state: ProgressEvent['state'], message: string) => void,
  result: Awaited<ReturnType<typeof createProject>>,
  id: 'docker' | 'github-actions',
  label: string,
) {
  const applied = result.appliedPlugins.includes(id);
  progress(
    id,
    applied ? 'succeeded' : 'warning',
    applied ? `${label} configuration added` : `${label} was not added; see warnings`,
  );
}

function publicError(error: unknown): { code: string; message: string; details?: string } {
  if (error instanceof CreateProjectError) return { code: error.code, message: error.message };
  const message = error instanceof Error ? error.message : 'Unexpected project creation error.';
  return {
    code: 'UNEXPECTED_ERROR',
    message: 'Project creation failed unexpectedly.',
    details: sanitize(message),
  };
}

function sanitize(message: string): string {
  return message
    .replace(/[A-Z]:\\Users\\[^\\\s]+/giu, '%USERPROFILE%')
    .replace(/\/Users\/[^/\s]+/gu, '~')
    .replace(/(?:npm|ghp)_[A-Za-z0-9_-]+/gu, '[redacted]')
    .slice(0, 1000);
}

function gitWarning(warnings: string[]): string {
  return (
    warnings.find((warning) => warning.startsWith('Git was not initialized')) ??
    'Git was not initialized'
  );
}

function stepLabel(step: ProgressStepId): string {
  const labels: Record<ProgressStepId, string> = {
    validate: 'Configuration validation',
    prepare: 'Destination preparation',
    scaffold: 'Project scaffolding',
    git: 'Git initialization',
    docker: 'Docker configuration',
    'github-actions': 'GitHub Actions configuration',
    finish: 'Project verification',
  };
  return labels[step];
}

function isPackageManager(value: unknown): value is SupportedPackageManager {
  return value === 'pnpm' || value === 'npm' || value === 'yarn' || value === 'bun';
}

function invalidPayload(): never {
  throw new Error('Invalid desktop bridge payload.');
}

function readBoolean(input: Record<string, unknown>, key: string): boolean {
  const value = input[key];
  if (typeof value !== 'boolean') invalidPayload();
  return value;
}
