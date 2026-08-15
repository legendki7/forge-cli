import { createHash } from 'node:crypto';
import {
  planWorkspaceEnvironment,
  planWorkspacePorts,
  type ForgeWorkspace,
  type WorkspaceServiceImplementation,
} from '@forgecli7/workspaces';

export const DEPLOYMENT_SCHEMA_VERSION = 1 as const;
export const ENVIRONMENT_PROFILE_IDS = ['local', 'staging', 'production'] as const;
export const DEPLOYMENT_TARGET_IDS = [
  'docker-compose',
  'generic-docker',
  'kubernetes',
  'static-export',
  'node-server',
] as const;

export type EnvironmentProfileId = (typeof ENVIRONMENT_PROFILE_IDS)[number];
export type DeploymentTargetId = (typeof DEPLOYMENT_TARGET_IDS)[number];
export type EnvironmentOwner =
  | 'workspace'
  | `service:${string}`
  | `database:${string}`
  | `infrastructure:${string}`
  | `plugin:${string}`;
export type DeploymentReadinessStatus = 'ready' | 'ready-with-warnings' | 'blocked';

export interface PlannedEnvironmentVariable {
  name: string;
  owner: EnvironmentOwner;
  description: string;
  required: boolean;
  secret: boolean;
  browserVisible: boolean;
  profiles: EnvironmentProfileId[];
  exampleValue?: string;
}

export interface EnvironmentVariableAssignment {
  name: string;
  configured: boolean;
}

export interface ServiceEnvironmentOverride {
  serviceId: string;
  port?: number;
  replicas?: number;
  loggingLevel?: 'debug' | 'info' | 'warn' | 'error';
}

export interface EnvironmentProfile {
  schemaVersion: 1;
  id: EnvironmentProfileId;
  name: string;
  description: string;
  variables: EnvironmentVariableAssignment[];
  serviceOverrides: ServiceEnvironmentOverride[];
  deploymentTarget?: DeploymentTargetId;
}

export interface DeploymentService {
  id: string;
  name: string;
  path: string;
  implementation: WorkspaceServiceImplementation;
  port?: number;
  buildScript?: string;
  startScript?: string;
  staticExportCompatible?: boolean;
}

export interface DeploymentConnection {
  sourceServiceId: string;
  targetServiceId: string;
  type: 'HTTP' | 'DATABASE' | 'CACHE' | 'SHARED_PACKAGE';
}

export interface DeploymentProject {
  schemaVersion: 1;
  id: string;
  name: string;
  packageManager: 'pnpm' | 'npm' | 'yarn' | 'bun';
  services: DeploymentService[];
  connections: DeploymentConnection[];
  variables: PlannedEnvironmentVariable[];
  ciDetected: boolean;
}

export interface DeploymentValidationIssue {
  code:
    | 'INVALID_PROFILE'
    | 'MISSING_REQUIRED_VARIABLE'
    | 'DUPLICATE_VARIABLE'
    | 'OWNERSHIP_CONFLICT'
    | 'BROWSER_SECRET_EXPOSURE'
    | 'INVALID_VARIABLE_NAME'
    | 'INVALID_SERVICE_OVERRIDE'
    | 'DUPLICATE_PORT'
    | 'TARGET_MISMATCH'
    | 'INVALID_KUBERNETES_NAME'
    | 'INVALID_REPLICAS'
    | 'INVALID_RESOURCES';
  path: string;
  message: string;
  blocking: boolean;
}

export interface EnvironmentValidationResult {
  status: DeploymentReadinessStatus;
  errors: DeploymentValidationIssue[];
  warnings: DeploymentValidationIssue[];
}

export interface KubernetesResources {
  cpuRequest: string;
  memoryRequest: string;
  cpuLimit: string;
  memoryLimit: string;
}

export interface DeploymentPlanOptions {
  replicas?: number;
  resources?: Partial<KubernetesResources>;
  includeMetadata?: boolean;
}

export const DEPLOYMENT_TARGETS: readonly {
  id: DeploymentTargetId;
  name: string;
  description: string;
}[] = [
  {
    id: 'docker-compose',
    name: 'Docker Compose',
    description: 'Multi-service Docker configuration.',
  },
  { id: 'generic-docker', name: 'Generic Docker', description: 'Production-oriented Dockerfiles.' },
  {
    id: 'kubernetes',
    name: 'Kubernetes',
    description: 'Starter manifests for review and manual use.',
  },
  { id: 'static-export', name: 'Static Export', description: 'Static frontend hosting metadata.' },
  { id: 'node-server', name: 'Node Server', description: 'Generic Node runtime instructions.' },
] as const;

export const DEPLOYMENT_PRESETS: readonly {
  id: string;
  name: string;
  environment: EnvironmentProfileId;
  target: DeploymentTargetId;
}[] = [
  { id: 'local-docker', name: 'Local Docker', environment: 'local', target: 'docker-compose' },
  {
    id: 'staging-docker',
    name: 'Staging Docker',
    environment: 'staging',
    target: 'docker-compose',
  },
  {
    id: 'production-docker',
    name: 'Production Docker',
    environment: 'production',
    target: 'generic-docker',
  },
  {
    id: 'kubernetes-starter',
    name: 'Kubernetes Starter',
    environment: 'production',
    target: 'kubernetes',
  },
  {
    id: 'static-frontend',
    name: 'Static Frontend',
    environment: 'production',
    target: 'static-export',
  },
  { id: 'node-server', name: 'Node Server', environment: 'production', target: 'node-server' },
] as const;

const publicPrefixes = ['NEXT_PUBLIC_', 'VITE_', 'PUBLIC_'];
const variablePattern = /^[A-Z_][A-Z0-9_]*$/u;

export function createEnvironmentProfiles(
  variables: readonly PlannedEnvironmentVariable[],
): EnvironmentProfile[] {
  return ENVIRONMENT_PROFILE_IDS.map((id) => ({
    schemaVersion: DEPLOYMENT_SCHEMA_VERSION,
    id,
    name: id[0]!.toUpperCase() + id.slice(1),
    description:
      id === 'local'
        ? 'Configuration for development on this computer.'
        : id === 'staging'
          ? 'A test environment that behaves similarly to production.'
          : 'The live environment used by real users.',
    variables: variables
      .filter(({ profiles }) => profiles.includes(id))
      .map(({ name }) => ({ name, configured: false }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    serviceOverrides: [],
  }));
}

export function deploymentProjectFromWorkspace(workspace: ForgeWorkspace): DeploymentProject {
  const ports = planWorkspacePorts(workspace.services);
  const connectionSource = new Map(
    workspace.connections.map((item) => [item.id, item.sourceServiceId]),
  );
  const variables: PlannedEnvironmentVariable[] = planWorkspaceEnvironment(workspace, ports).map(
    (variable) => {
      const connectionId = variable.owner.startsWith('connection:')
        ? variable.owner.slice('connection:'.length)
        : undefined;
      const serviceId = connectionId
        ? connectionSource.get(connectionId)
        : variable.owner.slice('service:'.length);
      return {
        name: variable.name,
        owner: `service:${serviceId ?? workspace.id}`,
        description: variable.description,
        required: variable.required,
        secret: variable.secret,
        browserVisible: variable.browserVisible,
        profiles: [...ENVIRONMENT_PROFILE_IDS],
        ...(variable.secret ? {} : { exampleValue: variable.localExample }),
      };
    },
  );
  for (const service of workspace.services) {
    if (service.implementation === 'postgres') {
      variables.push(
        variable(
          'POSTGRES_USER',
          `database:${service.id}`,
          'PostgreSQL user name.',
          false,
          false,
          'forgeki',
        ),
        variable('POSTGRES_PASSWORD', `database:${service.id}`, 'PostgreSQL password.', true, true),
        variable(
          'POSTGRES_DB',
          `database:${service.id}`,
          'PostgreSQL database name.',
          false,
          false,
          'forgeki',
        ),
      );
    }
  }
  return {
    schemaVersion: 1,
    id: workspace.id,
    name: workspace.name,
    packageManager: workspace.packageManager,
    services: workspace.services.map((service) => ({
      id: service.id,
      name: service.name,
      path: service.path,
      implementation: service.implementation,
      ...(ports.find(({ serviceId }) => serviceId === service.id)?.port
        ? { port: ports.find(({ serviceId }) => serviceId === service.id)!.port }
        : {}),
      ...(service.type === 'web' || service.type === 'api'
        ? {
            buildScript: 'build',
            startScript: service.implementation === 'react-vite' ? 'preview' : 'start',
          }
        : {}),
      ...(service.implementation === 'react-vite' ? { staticExportCompatible: true } : {}),
    })),
    connections: workspace.connections.map(({ sourceServiceId, targetServiceId, type }) => ({
      sourceServiceId,
      targetServiceId,
      type,
    })),
    variables: deduplicateVariables(variables),
    ciDetected: workspace.tooling.githubActions,
  };
}

export function validateEnvironmentProfiles(
  project: DeploymentProject,
  profiles: readonly EnvironmentProfile[] = createEnvironmentProfiles(project.variables),
  target?: DeploymentTargetId,
): EnvironmentValidationResult {
  const errors: DeploymentValidationIssue[] = [];
  const warnings: DeploymentValidationIssue[] = [];
  const add = (issue: Omit<DeploymentValidationIssue, 'blocking'>, blocking = true) =>
    (blocking ? errors : warnings).push({ ...issue, blocking });
  const profileIds = new Set<EnvironmentProfileId>();
  for (const [index, profile] of profiles.entries()) {
    if (!ENVIRONMENT_PROFILE_IDS.includes(profile.id) || profile.schemaVersion !== 1)
      add({
        code: 'INVALID_PROFILE',
        path: `profiles[${index}]`,
        message: 'Unsupported environment profile.',
      });
    if (profileIds.has(profile.id))
      add({
        code: 'INVALID_PROFILE',
        path: `profiles[${index}].id`,
        message: `Duplicate profile ${profile.id}.`,
      });
    profileIds.add(profile.id);
    for (const override of profile.serviceOverrides) {
      if (!project.services.some(({ id }) => id === override.serviceId))
        add({
          code: 'INVALID_SERVICE_OVERRIDE',
          path: `profiles[${index}].serviceOverrides`,
          message: `Unknown service override ${override.serviceId}.`,
        });
    }
  }
  const owners = new Map<string, EnvironmentOwner>();
  const identities = new Set<string>();
  for (const [index, item] of project.variables.entries()) {
    const at = `variables[${index}]`;
    if (!variablePattern.test(item.name))
      add({
        code: 'INVALID_VARIABLE_NAME',
        path: `${at}.name`,
        message: `${item.name} is not a portable environment variable name.`,
      });
    const identity = `${item.owner}:${item.name}`;
    if (identities.has(identity))
      add({
        code: 'DUPLICATE_VARIABLE',
        path: at,
        message: `Duplicate variable ${item.name} for ${item.owner}.`,
      });
    identities.add(identity);
    const currentOwner = owners.get(item.name);
    if (currentOwner && currentOwner !== item.owner)
      add({
        code: 'OWNERSHIP_CONFLICT',
        path: at,
        message: `${item.name} is owned by both ${currentOwner} and ${item.owner}.`,
      });
    owners.set(item.name, item.owner);
    if (
      item.secret &&
      (item.browserVisible || publicPrefixes.some((prefix) => item.name.startsWith(prefix)))
    )
      add({
        code: 'BROWSER_SECRET_EXPOSURE',
        path: at,
        message: `${item.name} is secret but browser-visible. Secret variables cannot use public prefixes.`,
      });
    if (!item.profiles.length || item.profiles.some((id) => !ENVIRONMENT_PROFILE_IDS.includes(id)))
      add({
        code: 'INVALID_PROFILE',
        path: `${at}.profiles`,
        message: `${item.name} has an invalid profile reference.`,
      });
    for (const profileId of item.profiles) {
      const profile = profiles.find(({ id }) => id === profileId);
      if (item.required && !profile?.variables.some(({ name }) => name === item.name))
        add({
          code: 'MISSING_REQUIRED_VARIABLE',
          path: `${at}.profiles`,
          message: `${item.name} is required in ${profileId} but has no schema assignment.`,
        });
    }
  }
  const ports = project.services
    .map(({ port }) => port)
    .filter((port): port is number => port !== undefined);
  if (new Set(ports).size !== ports.length)
    add({
      code: 'DUPLICATE_PORT',
      path: 'services',
      message: 'Application service ports must be unique.',
    });
  if (target && !compatibleDeploymentTargets(project).includes(target))
    add({
      code: 'TARGET_MISMATCH',
      path: 'target',
      message: `${target} is not compatible with this architecture.`,
    });
  return {
    status: errors.length ? 'blocked' : warnings.length ? 'ready-with-warnings' : 'ready',
    errors,
    warnings,
  };
}

export function compatibleDeploymentTargets(project: DeploymentProject): DeploymentTargetId[] {
  const implementations = new Set(project.services.map(({ implementation }) => implementation));
  const result = new Set<DeploymentTargetId>();
  const applications = project.services.filter(({ implementation }) =>
    ['nextjs', 'react-vite', 'express'].includes(implementation),
  );
  const infrastructure = project.services.some(({ implementation }) =>
    ['postgres', 'redis'].includes(implementation),
  );
  if (project.services.length > 1 || infrastructure) result.add('docker-compose');
  if (applications.length) {
    result.add('generic-docker');
    result.add('kubernetes');
  }
  if (implementations.has('postgres') || implementations.has('redis')) result.add('kubernetes');
  if (
    applications.some(
      ({ implementation }) => implementation === 'express' || implementation === 'nextjs',
    )
  )
    result.add('node-server');
  if (
    applications.some(
      ({ implementation, staticExportCompatible }) =>
        implementation === 'react-vite' || (implementation === 'nextjs' && staticExportCompatible),
    )
  )
    result.add('static-export');
  return DEPLOYMENT_TARGET_IDS.filter((id) => result.has(id));
}

export function parseEnvironmentProfileId(value: string): EnvironmentProfileId {
  if (ENVIRONMENT_PROFILE_IDS.includes(value as EnvironmentProfileId))
    return value as EnvironmentProfileId;
  throw new Error(`Unsupported environment "${value}". Use local, staging, or production.`);
}

export function parseDeploymentTargetId(
  value: string,
  project?: DeploymentProject,
): DeploymentTargetId {
  const aliases: Record<string, DeploymentTargetId> = {
    docker: project && project.services.length > 1 ? 'docker-compose' : 'generic-docker',
    compose: 'docker-compose',
    'docker-compose': 'docker-compose',
    'generic-docker': 'generic-docker',
    kubernetes: 'kubernetes',
    k8s: 'kubernetes',
    static: 'static-export',
    'static-export': 'static-export',
    node: 'node-server',
    'node-server': 'node-server',
  };
  const target = aliases[value];
  if (!target) throw new Error(`Unsupported deployment target "${value}".`);
  return target;
}

export function validateKubernetesName(value: string): boolean {
  return (
    value.length >= 1 && value.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u.test(value)
  );
}

export function validateReplicas(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 20;
}

export function validateKubernetesResources(resources: KubernetesResources): boolean {
  return (
    /^\d+m$/u.test(resources.cpuRequest) &&
    /^\d+m$/u.test(resources.cpuLimit) &&
    /^\d+(?:Mi|Gi)$/u.test(resources.memoryRequest) &&
    /^\d+(?:Mi|Gi)$/u.test(resources.memoryLimit) &&
    Number.parseInt(resources.cpuRequest) <= Number.parseInt(resources.cpuLimit) &&
    memoryMi(resources.memoryRequest) <= memoryMi(resources.memoryLimit)
  );
}

export function architectureFingerprint(
  project: DeploymentProject,
  target: DeploymentTargetId,
): string {
  const portable = {
    schemaVersion: project.schemaVersion,
    id: project.id,
    packageManager: project.packageManager,
    services: [...project.services]
      .map(({ id, implementation, port }) => ({ id, implementation, port }))
      .sort(byId),
    connections: [...project.connections].sort((a, b) =>
      JSON.stringify(a).localeCompare(JSON.stringify(b)),
    ),
    variables: [...project.variables]
      .map(({ name, owner, description, required, secret, browserVisible, profiles }) => ({
        name,
        owner,
        description,
        required,
        secret,
        browserVisible,
        profiles,
      }))
      .sort((a, b) => `${a.owner}:${a.name}`.localeCompare(`${b.owner}:${b.name}`)),
    target,
  };
  return createHash('sha256').update(JSON.stringify(portable)).digest('hex');
}

export function serializeEnvironmentProfiles(profiles: readonly EnvironmentProfile[]): string {
  return `${JSON.stringify(
    [...profiles].sort((a, b) => a.id.localeCompare(b.id)),
    null,
    2,
  )}\n`;
}

function variable(
  name: string,
  owner: EnvironmentOwner,
  description: string,
  required: boolean,
  secret: boolean,
  exampleValue?: string,
): PlannedEnvironmentVariable {
  return {
    name,
    owner,
    description,
    required,
    secret,
    browserVisible: false,
    profiles: [...ENVIRONMENT_PROFILE_IDS],
    ...(exampleValue === undefined ? {} : { exampleValue }),
  };
}

function deduplicateVariables(
  variables: PlannedEnvironmentVariable[],
): PlannedEnvironmentVariable[] {
  const seen = new Set<string>();
  return variables
    .filter((item) => {
      const key = `${item.owner}:${item.name}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => `${a.owner}:${a.name}`.localeCompare(`${b.owner}:${b.name}`));
}

function memoryMi(value: string): number {
  const amount = Number.parseInt(value);
  return value.endsWith('Gi') ? amount * 1024 : amount;
}

function byId(a: { id: string }, b: { id: string }): number {
  return a.id.localeCompare(b.id);
}
