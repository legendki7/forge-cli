import { validateProjectName } from '@forgecli7/core/project-name';
import type { SupportedPackageManager } from '@forgecli7/core/package-managers';

export const WORKSPACE_SCHEMA_VERSION = 1 as const;
export const MAX_WORKSPACE_BYTES = 256 * 1024;
export const MAX_WORKSPACE_SERVICES = 20;
export const MAX_WORKSPACE_CONNECTIONS = 40;
export const MAX_WORKSPACE_SHARED_PACKAGES = 10;
export const MAX_CUSTOM_WORKSPACE_PRESETS = 50;

export type WorkspaceServiceType = 'web' | 'api' | 'database' | 'infrastructure' | 'shared-package';
export type WorkspaceServiceImplementation =
  'nextjs' | 'react-vite' | 'express' | 'postgres' | 'sqlite' | 'redis' | 'shared-types';
export type WorkspaceConnectionType = 'HTTP' | 'DATABASE' | 'CACHE' | 'SHARED_PACKAGE';
export type WorkspaceServiceComponent =
  'plain-css' | 'tailwind' | 'vitest' | 'playwright' | 'prisma' | 'drizzle';
export type WorkspaceEvidenceState = 'detected' | 'likely' | 'unknown' | 'conflicting';

export interface WorkspaceEnvironmentVariable {
  name: string;
  description: string;
  required: boolean;
  secret: boolean;
  browserVisible: boolean;
  exampleValue?: string;
}

export interface WorkspaceService {
  id: string;
  name: string;
  type: WorkspaceServiceType;
  implementation: WorkspaceServiceImplementation;
  path: string;
  port?: number;
  components?: readonly WorkspaceServiceComponent[];
  environmentVariables?: readonly WorkspaceEnvironmentVariable[];
  docker?: boolean;
}

export interface ServiceConnection {
  id: string;
  sourceServiceId: string;
  targetServiceId: string;
  type: WorkspaceConnectionType;
}

export interface WorkspaceTooling {
  initializeGit: boolean;
  docker: boolean;
  githubActions: boolean;
}

export interface ForgeWorkspace {
  schemaVersion: 1;
  id: string;
  name: string;
  packageManager: SupportedPackageManager;
  services: readonly WorkspaceService[];
  connections: readonly ServiceConnection[];
  tooling: WorkspaceTooling;
}

export interface WorkspaceValidationIssue {
  code:
    | 'INVALID_SCHEMA'
    | 'INVALID_NAME'
    | 'INVALID_SERVICE'
    | 'DUPLICATE_SERVICE'
    | 'SERVICE_LIMIT'
    | 'CONNECTION_LIMIT'
    | 'INVALID_CONNECTION'
    | 'DUPLICATE_CONNECTION'
    | 'INVALID_PORT'
    | 'PORT_CONFLICT'
    | 'PATH_COLLISION'
    | 'ENVIRONMENT_CONFLICT'
    | 'BROWSER_SECRET_EXPOSURE'
    | 'UNSUPPORTED_CAPABILITY';
  path: string;
  message: string;
  resolution?: string;
}

export interface PlannedWorkspacePort {
  serviceId: string;
  port: number;
  source: 'default' | 'allocated' | 'override';
}

export interface PlannedWorkspaceEnvironmentVariable extends WorkspaceEnvironmentVariable {
  owner: `service:${string}` | `connection:${string}`;
  localExample: string;
  containerExample?: string;
}

export interface WorkspaceValidationResult {
  valid: boolean;
  errors: WorkspaceValidationIssue[];
  warnings: WorkspaceValidationIssue[];
  ports: PlannedWorkspacePort[];
  environment: PlannedWorkspaceEnvironmentVariable[];
}

export interface WorkspacePreset {
  schemaVersion: 1;
  id: string;
  name: string;
  description: string;
  definition: ForgeWorkspace;
}

export interface CustomWorkspacePreset extends WorkspacePreset {
  createdAt: string;
  updatedAt: string;
}

const serviceImplementations: Readonly<
  Record<WorkspaceServiceType, readonly WorkspaceServiceImplementation[]>
> = {
  web: ['nextjs', 'react-vite'],
  api: ['express'],
  database: ['postgres', 'sqlite'],
  infrastructure: ['redis'],
  'shared-package': ['shared-types'],
};
const serviceComponents = new Set<WorkspaceServiceComponent>([
  'plain-css',
  'tailwind',
  'vitest',
  'playwright',
  'prisma',
  'drizzle',
]);
const connectionTypes = new Set<WorkspaceConnectionType>([
  'HTTP',
  'DATABASE',
  'CACHE',
  'SHARED_PACKAGE',
]);
const packageManagers = new Set<SupportedPackageManager>(['pnpm', 'npm', 'yarn', 'bun']);
const reservedNames = new Set([
  'con',
  'prn',
  'aux',
  'nul',
  'com1',
  'com2',
  'com3',
  'com4',
  'com5',
  'com6',
  'com7',
  'com8',
  'com9',
  'lpt1',
  'lpt2',
  'lpt3',
  'lpt4',
  'lpt5',
  'lpt6',
  'lpt7',
  'lpt8',
  'lpt9',
]);

export const WORKSPACE_SERVICE_CATALOG: readonly {
  implementation: WorkspaceServiceImplementation;
  type: WorkspaceServiceType;
  name: string;
  beginnerDescription: string;
  defaultPort?: number;
}[] = [
  {
    implementation: 'nextjs',
    type: 'web',
    name: 'Next.js',
    beginnerDescription: 'A web application that can also handle server-side logic.',
    defaultPort: 3000,
  },
  {
    implementation: 'react-vite',
    type: 'web',
    name: 'React + Vite',
    beginnerDescription: 'What users see and interact with in their browser.',
    defaultPort: 5173,
  },
  {
    implementation: 'express',
    type: 'api',
    name: 'Express API',
    beginnerDescription: 'Handles application logic and talks to your data services.',
    defaultPort: 4000,
  },
  {
    implementation: 'postgres',
    type: 'database',
    name: 'PostgreSQL',
    beginnerDescription: "Stores your application's relational data.",
    defaultPort: 5432,
  },
  {
    implementation: 'sqlite',
    type: 'database',
    name: 'SQLite',
    beginnerDescription: 'Stores local data in a file without a separate server.',
  },
  {
    implementation: 'redis',
    type: 'infrastructure',
    name: 'Redis',
    beginnerDescription: 'Stores temporary data for faster access.',
    defaultPort: 6379,
  },
  {
    implementation: 'shared-types',
    type: 'shared-package',
    name: 'Shared TypeScript Library',
    beginnerDescription: 'Code and types used by more than one application.',
  },
] as const;

export function isSafeWorkspaceServiceName(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 1 &&
    value.length <= 48 &&
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u.test(value) &&
    !reservedNames.has(value.toLowerCase())
  );
}

export function workspaceServicePath(type: WorkspaceServiceType, name: string): string {
  const root =
    type === 'shared-package'
      ? 'packages'
      : type === 'database' || type === 'infrastructure'
        ? 'infrastructure'
        : 'apps';
  return `${root}/${name}`;
}

export function createWorkspaceService(
  implementation: WorkspaceServiceImplementation,
  name: string,
  options: Pick<WorkspaceService, 'port' | 'components' | 'environmentVariables' | 'docker'> = {},
): WorkspaceService {
  const catalog = WORKSPACE_SERVICE_CATALOG.find((item) => item.implementation === implementation);
  if (!catalog || !isSafeWorkspaceServiceName(name)) throw new Error('Invalid workspace service.');
  return {
    id: name,
    name,
    type: catalog.type,
    implementation,
    path: workspaceServicePath(catalog.type, name),
    ...(options.port === undefined ? {} : { port: options.port }),
    ...(options.components ? { components: [...options.components] } : {}),
    ...(options.environmentVariables
      ? { environmentVariables: [...options.environmentVariables] }
      : {}),
    ...(options.docker === undefined ? {} : { docker: options.docker }),
  };
}

export function connectionId(
  sourceServiceId: string,
  targetServiceId: string,
  type: WorkspaceConnectionType,
): string {
  return `${sourceServiceId}-${type.toLowerCase().replace('_', '-')}-${targetServiceId}`;
}

export function createWorkspaceConnection(
  sourceServiceId: string,
  targetServiceId: string,
  type: WorkspaceConnectionType,
): ServiceConnection {
  return {
    id: connectionId(sourceServiceId, targetServiceId, type),
    sourceServiceId,
    targetServiceId,
    type,
  };
}

export function suggestWorkspaceConnection(
  source: WorkspaceService,
  target: WorkspaceService,
): WorkspaceConnectionType | undefined {
  if (isApplication(source) && target.type === 'api') return 'HTTP';
  if (isServer(source) && target.type === 'database') return 'DATABASE';
  if (isServer(source) && target.implementation === 'redis') return 'CACHE';
  if (isApplication(source) && target.type === 'shared-package') return 'SHARED_PACKAGE';
  return undefined;
}

export function planWorkspacePorts(services: readonly WorkspaceService[]): PlannedWorkspacePort[] {
  const allocated = new Set<number>();
  const result: PlannedWorkspacePort[] = [];
  for (const service of [...services].sort((a, b) => a.id.localeCompare(b.id))) {
    const catalog = WORKSPACE_SERVICE_CATALOG.find(
      (item) => item.implementation === service.implementation,
    );
    if (service.port !== undefined) {
      result.push({ serviceId: service.id, port: service.port, source: 'override' });
      allocated.add(service.port);
      continue;
    }
    if (catalog?.defaultPort === undefined) continue;
    let port = catalog.defaultPort;
    while (allocated.has(port) && port < 65_535) port += 1;
    result.push({
      serviceId: service.id,
      port,
      source: port === catalog.defaultPort ? 'default' : 'allocated',
    });
    allocated.add(port);
  }
  return result;
}

export function planWorkspaceEnvironment(
  workspace: ForgeWorkspace,
  ports: readonly PlannedWorkspacePort[] = planWorkspacePorts(workspace.services),
): PlannedWorkspaceEnvironmentVariable[] {
  const services = new Map(workspace.services.map((service) => [service.id, service]));
  const portFor = (id: string) => ports.find((item) => item.serviceId === id)?.port;
  const result: PlannedWorkspaceEnvironmentVariable[] = [];
  for (const connection of [...workspace.connections].sort((a, b) => a.id.localeCompare(b.id))) {
    const source = services.get(connection.sourceServiceId);
    const target = services.get(connection.targetServiceId);
    if (!source || !target) continue;
    if (connection.type === 'HTTP') {
      const port = portFor(target.id);
      if (!port) continue;
      const browserVisible = source.implementation === 'react-vite';
      result.push({
        name: browserVisible ? 'VITE_API_URL' : 'API_URL',
        description: `HTTP endpoint for ${target.name}.`,
        required: true,
        secret: false,
        browserVisible,
        owner: `connection:${connection.id}`,
        localExample: `http://localhost:${port}`,
        containerExample: `http://${target.name}:${port}`,
      });
    } else if (connection.type === 'DATABASE') {
      const port = portFor(target.id);
      const postgres = target.implementation === 'postgres';
      result.push({
        name: 'DATABASE_URL',
        description: `Database connection for ${target.name}.`,
        required: true,
        secret: true,
        browserVisible: false,
        owner: `connection:${connection.id}`,
        localExample: postgres
          ? `postgres://forgeki:forgeki-dev-only@localhost:${port ?? 5432}/forgeki`
          : `file:../../data/${target.name}.db`,
        ...(postgres
          ? {
              containerExample: `postgres://forgeki:forgeki-dev-only@${target.name}:${port ?? 5432}/forgeki`,
            }
          : {}),
      });
    } else if (connection.type === 'CACHE') {
      const port = portFor(target.id) ?? 6379;
      result.push({
        name: 'REDIS_URL',
        description: `Redis connection for ${target.name}.`,
        required: true,
        secret: true,
        browserVisible: false,
        owner: `connection:${connection.id}`,
        localExample: `redis://localhost:${port}`,
        containerExample: `redis://${target.name}:${port}`,
      });
    }
  }
  for (const service of [...workspace.services].sort((a, b) => a.id.localeCompare(b.id))) {
    for (const variable of service.environmentVariables ?? []) {
      result.push({
        ...variable,
        owner: `service:${service.id}`,
        localExample: variable.exampleValue ?? '',
      });
    }
  }
  return result;
}

export function validateWorkspace(workspace: ForgeWorkspace): WorkspaceValidationResult {
  const errors: WorkspaceValidationIssue[] = [];
  const warnings: WorkspaceValidationIssue[] = [];
  const issue = (
    code: WorkspaceValidationIssue['code'],
    path: string,
    message: string,
    resolution?: string,
  ) => errors.push({ code, path, message, ...(resolution ? { resolution } : {}) });

  if (workspace.schemaVersion !== WORKSPACE_SCHEMA_VERSION)
    issue('INVALID_SCHEMA', 'schemaVersion', 'Unsupported workspace schema version.');
  if (!validateProjectName(workspace.name).valid || !isSafeWorkspaceServiceName(workspace.id))
    issue('INVALID_NAME', 'name', 'Workspace name and id must be safe single-directory names.');
  if (!packageManagers.has(workspace.packageManager))
    issue('INVALID_SCHEMA', 'packageManager', 'Unsupported workspace package manager.');
  if (workspace.services.length > MAX_WORKSPACE_SERVICES)
    issue(
      'SERVICE_LIMIT',
      'services',
      `A workspace may contain at most ${MAX_WORKSPACE_SERVICES} services.`,
    );
  if (workspace.connections.length > MAX_WORKSPACE_CONNECTIONS)
    issue(
      'CONNECTION_LIMIT',
      'connections',
      `A workspace may contain at most ${MAX_WORKSPACE_CONNECTIONS} connections.`,
    );
  if (
    workspace.services.filter(({ type }) => type === 'shared-package').length >
    MAX_WORKSPACE_SHARED_PACKAGES
  )
    issue(
      'SERVICE_LIMIT',
      'services',
      `A workspace may contain at most ${MAX_WORKSPACE_SHARED_PACKAGES} shared packages.`,
    );

  const ids = new Set<string>();
  const names = new Set<string>();
  const paths = new Set<string>();
  const services = new Map<string, WorkspaceService>();
  for (const [index, service] of workspace.services.entries()) {
    const at = `services[${index}]`;
    if (!isSafeWorkspaceServiceName(service.id) || !isSafeWorkspaceServiceName(service.name))
      issue('INVALID_SERVICE', at, `Invalid service name or id: ${service.name}.`);
    if (ids.has(service.id) || names.has(service.name))
      issue('DUPLICATE_SERVICE', at, `Duplicate service identity: ${service.id}.`);
    ids.add(service.id);
    names.add(service.name);
    services.set(service.id, service);
    if (!serviceImplementations[service.type]?.includes(service.implementation))
      issue(
        'INVALID_SERVICE',
        `${at}.implementation`,
        'Service type and implementation do not match.',
      );
    const expectedPath = workspaceServicePath(service.type, service.name);
    if (service.path !== expectedPath || !isSafeRelativePath(service.path))
      issue('INVALID_SERVICE', `${at}.path`, `Service path must be ${expectedPath}.`);
    if (paths.has(service.path))
      issue('PATH_COLLISION', `${at}.path`, `Duplicate service path: ${service.path}.`);
    paths.add(service.path);
    if (
      service.port !== undefined &&
      (!Number.isInteger(service.port) || service.port < 1 || service.port > 65_535)
    )
      issue('INVALID_PORT', `${at}.port`, 'Ports must be integers from 1 through 65535.');
    const components = service.components ?? [];
    if (
      new Set(components).size !== components.length ||
      components.some((item) => !serviceComponents.has(item))
    )
      issue(
        'UNSUPPORTED_CAPABILITY',
        `${at}.components`,
        'Unknown or duplicate service component.',
      );
    if (
      service.type === 'web' &&
      components.some((item) => item === 'prisma' || item === 'drizzle') &&
      service.implementation === 'react-vite'
    )
      issue(
        'INVALID_SERVICE',
        `${at}.components`,
        'A browser-only React service cannot own a database ORM.',
      );
    if (
      service.implementation === 'express' &&
      components.some(
        (item) => item === 'plain-css' || item === 'tailwind' || item === 'playwright',
      )
    )
      issue(
        'INVALID_SERVICE',
        `${at}.components`,
        'Express does not support browser styling or Playwright components.',
      );
    if (components.includes('plain-css') && components.includes('tailwind'))
      issue('INVALID_SERVICE', `${at}.components`, 'Choose either Plain CSS or Tailwind CSS.');
    if (components.includes('prisma') && components.includes('drizzle'))
      issue('INVALID_SERVICE', `${at}.components`, 'Choose either Prisma or Drizzle.');
  }

  const overrides = new Map<number, string>();
  for (const service of workspace.services) {
    if (service.port === undefined) continue;
    const current = overrides.get(service.port);
    if (current)
      issue(
        'PORT_CONFLICT',
        `services.${service.id}.port`,
        `Port ${service.port} is already assigned to ${current}.`,
      );
    else overrides.set(service.port, service.id);
  }

  const connectionIds = new Set<string>();
  const connectionShapes = new Set<string>();
  for (const [index, connection] of workspace.connections.entries()) {
    const at = `connections[${index}]`;
    if (!isSafeConnectionId(connection.id) || !connectionTypes.has(connection.type)) {
      issue('INVALID_CONNECTION', at, 'Connection id or type is invalid.');
      continue;
    }
    const source = services.get(connection.sourceServiceId);
    const target = services.get(connection.targetServiceId);
    if (!source || !target) {
      issue('INVALID_CONNECTION', at, 'Connection references an unknown service.');
      continue;
    }
    const shape = `${connection.sourceServiceId}|${connection.type}|${connection.targetServiceId}`;
    if (connectionIds.has(connection.id) || connectionShapes.has(shape))
      issue('DUPLICATE_CONNECTION', at, `Duplicate connection: ${connection.id}.`);
    connectionIds.add(connection.id);
    connectionShapes.add(shape);
    if (connection.id !== connectionId(source.id, target.id, connection.type))
      issue('INVALID_CONNECTION', `${at}.id`, 'Connection id must be derived deterministically.');
    if (!isAllowedConnection(source, target, connection.type)) {
      const frontendDatabase = source.implementation === 'react-vite' && target.type === 'database';
      issue(
        'INVALID_CONNECTION',
        at,
        frontendDatabase
          ? 'React/Vite cannot connect directly to a database.'
          : `${source.name} cannot connect to ${target.name} using ${connection.type}.`,
        frontendDatabase
          ? 'Add an Express API between the frontend and database.'
          : 'Choose a supported connection direction.',
      );
    }
  }

  for (const service of workspace.services) {
    if (
      (service.components?.includes('prisma') || service.components?.includes('drizzle')) &&
      !workspace.connections.some(
        ({ sourceServiceId, type }) => sourceServiceId === service.id && type === 'DATABASE',
      )
    )
      issue(
        'INVALID_SERVICE',
        `services.${service.id}.components`,
        `${service.name} selects an ORM but has no database connection.`,
      );
  }

  const ports = planWorkspacePorts(workspace.services);
  const environment = planWorkspaceEnvironment(workspace, ports);
  const environmentByOwner = new Map<string, PlannedWorkspaceEnvironmentVariable>();
  for (const variable of environment) {
    const ownerId = variable.owner.slice(variable.owner.indexOf(':') + 1);
    const owningService = variable.owner.startsWith('connection:')
      ? workspace.connections.find(({ id }) => id === ownerId)?.sourceServiceId
      : ownerId;
    const key = `${owningService ?? ownerId}:${variable.name}`;
    const current = environmentByOwner.get(key);
    if (current && serializeDeterministically(current) !== serializeDeterministically(variable))
      issue(
        'ENVIRONMENT_CONFLICT',
        'environment',
        `Conflicting ${variable.name} definitions for ${variable.owner}.`,
      );
    else environmentByOwner.set(key, variable);
    if (
      (variable.browserVisible || /^(?:VITE_|NEXT_PUBLIC_)/u.test(variable.name)) &&
      (variable.secret ||
        /(?:DATABASE|REDIS|PASSWORD|SECRET|TOKEN|PRIVATE|CREDENTIAL)/iu.test(variable.name))
    )
      issue(
        'BROWSER_SECRET_EXPOSURE',
        'environment',
        `${variable.name} would expose server-only or secret data to browser code.`,
      );
  }

  return { valid: errors.length === 0, errors, warnings, ports, environment };
}

export function parseWorkspaceDefinition(value: unknown): ForgeWorkspace {
  if (byteLength(value) > MAX_WORKSPACE_BYTES)
    throw new Error('Workspace configuration is too large.');
  if (!isRecord(value)) throw new Error('Workspace configuration must be an object.');
  assertKeys(value, [
    'schemaVersion',
    'id',
    'name',
    'packageManager',
    'services',
    'connections',
    'tooling',
  ]);
  if (
    value.schemaVersion !== 1 ||
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    typeof value.packageManager !== 'string' ||
    !packageManagers.has(value.packageManager as SupportedPackageManager) ||
    !Array.isArray(value.services) ||
    !Array.isArray(value.connections) ||
    !isRecord(value.tooling)
  )
    throw new Error('Workspace configuration has invalid required fields.');
  assertKeys(value.tooling, ['initializeGit', 'docker', 'githubActions']);
  if (
    typeof value.tooling.initializeGit !== 'boolean' ||
    typeof value.tooling.docker !== 'boolean' ||
    typeof value.tooling.githubActions !== 'boolean'
  )
    throw new Error('Workspace tooling must use boolean values.');
  const services = value.services.map(readService);
  const connections = value.connections.map(readConnection);
  const workspace: ForgeWorkspace = {
    schemaVersion: 1,
    id: value.id,
    name: value.name,
    packageManager: value.packageManager as SupportedPackageManager,
    services,
    connections,
    tooling: {
      initializeGit: value.tooling.initializeGit,
      docker: value.tooling.docker,
      githubActions: value.tooling.githubActions,
    },
  };
  const validation = validateWorkspace(workspace);
  if (!validation.valid) throw new Error(validation.errors.map(({ message }) => message).join(' '));
  return workspace;
}

export function serializeWorkspace(workspace: ForgeWorkspace): string {
  const parsed = parseWorkspaceDefinition(workspace);
  return `${JSON.stringify(sortDeep(parsed), null, 2)}\n`;
}

export function asciiWorkspaceArchitecture(
  workspace: ForgeWorkspace,
  ports: readonly PlannedWorkspacePort[] = planWorkspacePorts(workspace.services),
): string {
  const port = (id: string) => ports.find((item) => item.serviceId === id)?.port;
  const services = new Map(workspace.services.map((service) => [service.id, service]));
  const lines = [...workspace.services]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((service) => `${service.name}${port(service.id) ? ` :${port(service.id)}` : ''}`);
  for (const connection of [...workspace.connections].sort((a, b) => a.id.localeCompare(b.id))) {
    const source = services.get(connection.sourceServiceId);
    const target = services.get(connection.targetServiceId);
    if (source && target) lines.push(`${source.name} --${connection.type}--> ${target.name}`);
  }
  return lines.join('\n');
}

function preset(
  id: string,
  name: string,
  description: string,
  services: WorkspaceService[],
  connections: ServiceConnection[],
  tooling: Partial<WorkspaceTooling> = {},
): WorkspacePreset {
  return {
    schemaVersion: 1,
    id,
    name,
    description,
    definition: {
      schemaVersion: 1,
      id,
      name: id,
      packageManager: 'pnpm',
      services,
      connections,
      tooling: { initializeGit: true, docker: false, githubActions: false, ...tooling },
    },
  };
}

const starterServices = () => [
  createWorkspaceService('react-vite', 'web', { components: ['plain-css', 'vitest'] }),
  createWorkspaceService('express', 'api', { components: ['vitest'] }),
];

export const BUILTIN_WORKSPACE_PRESETS: readonly WorkspacePreset[] = [
  preset(
    'full-stack-starter',
    'Full Stack Starter',
    'React frontend connected to an Express API.',
    starterServices(),
    [createWorkspaceConnection('web', 'api', 'HTTP')],
  ),
  preset(
    'full-stack-postgres',
    'Full Stack PostgreSQL',
    'React, Express, and PostgreSQL with a typed database foundation.',
    [...starterServices(), createWorkspaceService('postgres', 'postgres')],
    [
      createWorkspaceConnection('web', 'api', 'HTTP'),
      createWorkspaceConnection('api', 'postgres', 'DATABASE'),
    ],
  ),
  preset(
    'nextjs-full-stack',
    'Next.js Full Stack',
    'Next.js connected directly to PostgreSQL.',
    [
      createWorkspaceService('nextjs', 'web', { components: ['plain-css', 'vitest', 'drizzle'] }),
      createWorkspaceService('postgres', 'postgres'),
    ],
    [createWorkspaceConnection('web', 'postgres', 'DATABASE')],
  ),
  preset(
    'saas-foundation',
    'SaaS Foundation',
    'React, Express, PostgreSQL, Redis, and a shared TypeScript library.',
    [
      createWorkspaceService('react-vite', 'web', {
        components: ['tailwind', 'vitest', 'playwright'],
      }),
      createWorkspaceService('express', 'api', { components: ['vitest', 'drizzle'] }),
      createWorkspaceService('postgres', 'postgres'),
      createWorkspaceService('redis', 'cache'),
      createWorkspaceService('shared-types', 'shared'),
    ],
    [
      createWorkspaceConnection('web', 'api', 'HTTP'),
      createWorkspaceConnection('api', 'postgres', 'DATABASE'),
      createWorkspaceConnection('api', 'cache', 'CACHE'),
      createWorkspaceConnection('web', 'shared', 'SHARED_PACKAGE'),
      createWorkspaceConnection('api', 'shared', 'SHARED_PACKAGE'),
    ],
    { docker: true, githubActions: true },
  ),
  preset(
    'api-platform',
    'API Platform',
    'Express API with PostgreSQL and Redis.',
    [
      createWorkspaceService('express', 'api', { components: ['vitest', 'drizzle'] }),
      createWorkspaceService('postgres', 'postgres'),
      createWorkspaceService('redis', 'cache'),
    ],
    [
      createWorkspaceConnection('api', 'postgres', 'DATABASE'),
      createWorkspaceConnection('api', 'cache', 'CACHE'),
    ],
    { docker: true, githubActions: true },
  ),
] as const;

export function getWorkspacePreset(id: string): WorkspacePreset | undefined {
  return BUILTIN_WORKSPACE_PRESETS.find((item) => item.id === id);
}

function readService(value: unknown): WorkspaceService {
  if (!isRecord(value)) throw new Error('Workspace service must be an object.');
  assertKeys(value, [
    'id',
    'name',
    'type',
    'implementation',
    'path',
    'port',
    'components',
    'environmentVariables',
    'docker',
  ]);
  if (
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    typeof value.type !== 'string' ||
    !(value.type in serviceImplementations) ||
    typeof value.implementation !== 'string' ||
    typeof value.path !== 'string'
  )
    throw new Error('Workspace service fields are invalid.');
  const environmentVariables =
    value.environmentVariables === undefined
      ? undefined
      : readEnvironmentVariables(value.environmentVariables);
  if (value.components !== undefined && !Array.isArray(value.components))
    throw new Error('Service components must be an array.');
  if (value.port !== undefined && typeof value.port !== 'number')
    throw new Error('Service port must be a number.');
  if (value.docker !== undefined && typeof value.docker !== 'boolean')
    throw new Error('Service docker flag must be boolean.');
  return {
    id: value.id,
    name: value.name,
    type: value.type as WorkspaceServiceType,
    implementation: value.implementation as WorkspaceServiceImplementation,
    path: value.path,
    ...(value.port === undefined ? {} : { port: value.port }),
    ...(value.components === undefined
      ? {}
      : { components: value.components.map(String) as WorkspaceServiceComponent[] }),
    ...(environmentVariables ? { environmentVariables } : {}),
    ...(value.docker === undefined ? {} : { docker: value.docker }),
  };
}

function readConnection(value: unknown): ServiceConnection {
  if (!isRecord(value)) throw new Error('Workspace connection must be an object.');
  assertKeys(value, ['id', 'sourceServiceId', 'targetServiceId', 'type']);
  if (
    typeof value.id !== 'string' ||
    typeof value.sourceServiceId !== 'string' ||
    typeof value.targetServiceId !== 'string' ||
    typeof value.type !== 'string'
  )
    throw new Error('Workspace connection fields are invalid.');
  return {
    id: value.id,
    sourceServiceId: value.sourceServiceId,
    targetServiceId: value.targetServiceId,
    type: value.type as WorkspaceConnectionType,
  };
}

function readEnvironmentVariables(value: unknown): WorkspaceEnvironmentVariable[] {
  if (!Array.isArray(value)) throw new Error('Environment variables must be an array.');
  return value.map((item) => {
    if (!isRecord(item)) throw new Error('Environment variable must be an object.');
    assertKeys(item, [
      'name',
      'description',
      'required',
      'secret',
      'browserVisible',
      'exampleValue',
    ]);
    if (
      typeof item.name !== 'string' ||
      !/^[A-Z][A-Z0-9_]{0,127}$/u.test(item.name) ||
      typeof item.description !== 'string' ||
      typeof item.required !== 'boolean' ||
      typeof item.secret !== 'boolean' ||
      typeof item.browserVisible !== 'boolean' ||
      (item.exampleValue !== undefined && typeof item.exampleValue !== 'string')
    )
      throw new Error('Environment variable fields are invalid.');
    return {
      name: item.name,
      description: item.description,
      required: item.required,
      secret: item.secret,
      browserVisible: item.browserVisible,
      ...(item.exampleValue === undefined ? {} : { exampleValue: item.exampleValue }),
    };
  });
}

function isAllowedConnection(
  source: WorkspaceService,
  target: WorkspaceService,
  type: WorkspaceConnectionType,
): boolean {
  if (source.id === target.id) return false;
  if (type === 'HTTP') return isApplication(source) && target.type === 'api';
  if (type === 'DATABASE') return isServer(source) && target.type === 'database';
  if (type === 'CACHE') return isServer(source) && target.implementation === 'redis';
  return isApplication(source) && target.type === 'shared-package';
}

function isApplication(service: WorkspaceService): boolean {
  return service.type === 'web' || service.type === 'api';
}

function isServer(service: WorkspaceService): boolean {
  return service.type === 'api' || service.implementation === 'nextjs';
}

function isSafeRelativePath(value: string): boolean {
  return (
    value.length <= 160 &&
    !value.includes('\\') &&
    !value.includes('..') &&
    !value.startsWith('/') &&
    !/^[A-Za-z]:/u.test(value) &&
    value.split('/').every(isSafeWorkspaceServiceName)
  );
}

function isSafeConnectionId(value: string): boolean {
  return value.length <= 160 && /^[a-z0-9][a-z0-9-]*$/u.test(value);
}

function assertKeys(value: Record<string, unknown>, allowed: readonly string[]): void {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length) throw new Error(`Unsupported workspace field: ${unknown[0]}.`);
}

function byteLength(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, sortDeep(item)]),
  );
}

function serializeDeterministically(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
