import { spawn } from 'node:child_process';
import { lstat, mkdir, mkdtemp, realpath, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { createFileSafely, type StackComponentId, type StackDefinition } from '@forgecli7/core';
import { createGenerationPlan } from '@forgecli7/templates';
import {
  asciiWorkspaceArchitecture,
  parseWorkspaceDefinition,
  planWorkspaceEnvironment,
  serializeWorkspace,
  validateWorkspace,
  type ForgeWorkspace,
  type PlannedWorkspaceEnvironmentVariable,
  type PlannedWorkspacePort,
  type ServiceConnection,
  type WorkspaceService,
} from './model.js';

export type WorkspacePlanOwner =
  | 'workspace'
  | `service:${string}`
  | `database:${string}`
  | `infrastructure:${string}`
  | `shared-package:${string}`;

export interface WorkspacePlannedFile {
  path: string;
  content: string;
  owner: WorkspacePlanOwner;
}

export interface WorkspaceServicePlan {
  serviceId: string;
  path: string;
  implementation: WorkspaceService['implementation'];
  port?: number;
  files: string[];
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  scripts: Record<string, string>;
}

export interface WorkspaceDockerServicePlan {
  id: string;
  kind: 'application' | 'postgres' | 'redis';
  port?: number;
  dependsOn: string[];
}

export interface WorkspaceCiPlan {
  enabled: boolean;
  scripts: readonly ['lint', 'typecheck', 'test', 'build'];
}

export interface WorkspaceGenerationPlan {
  schemaVersion: 1;
  planId: string;
  workspaceName: string;
  destinationDirectory: string;
  workspace: ForgeWorkspace;
  files: WorkspacePlannedFile[];
  servicePlans: WorkspaceServicePlan[];
  ports: PlannedWorkspacePort[];
  environment: PlannedWorkspaceEnvironmentVariable[];
  connections: ServiceConnection[];
  dockerServices: WorkspaceDockerServicePlan[];
  ci: WorkspaceCiPlan;
  warnings: string[];
}

export interface WorkspaceCreationInput {
  destinationDirectory: string;
}

export interface WorkspaceGenerationResult {
  workspaceDirectory: string;
  createdFiles: string[];
  serviceCount: number;
  warnings: string[];
  plan: WorkspaceGenerationPlan;
  gitInitialized: boolean;
}

export interface WorkspaceProcessExecutor {
  run(command: string, args: readonly string[], cwd: string): Promise<{ exitCode: number }>;
}

export class WorkspaceGenerationError extends Error {
  constructor(
    readonly code:
      | 'INVALID_WORKSPACE'
      | 'UNSAFE_DESTINATION'
      | 'FILE_COLLISION'
      | 'UNSAFE_FILE'
      | 'PLAN_MISMATCH'
      | 'GENERATION_FAILED',
    message: string,
  ) {
    super(message);
    this.name = 'WorkspaceGenerationError';
  }
}

export const defaultWorkspaceProcessExecutor: WorkspaceProcessExecutor = {
  run(command, args, cwd) {
    return new Promise((resolve) => {
      const child = spawn(command, [...args], { cwd, shell: false, stdio: 'ignore' });
      child.once('error', () => resolve({ exitCode: 1 }));
      child.once('exit', (code) => resolve({ exitCode: code ?? 1 }));
    });
  },
};

export async function createWorkspaceGenerationPlan(
  definition: ForgeWorkspace,
  input: WorkspaceCreationInput,
): Promise<WorkspaceGenerationPlan> {
  const workspace = parseWorkspaceDefinition(definition);
  const validation = validateWorkspace(workspace);
  if (!validation.valid)
    throw new WorkspaceGenerationError(
      'INVALID_WORKSPACE',
      validation.errors.map(({ message }) => message).join(' '),
    );
  const files = new Map<string, WorkspacePlannedFile>();
  const servicePlans: WorkspaceServicePlan[] = [];
  const environmentByService = groupEnvironment(workspace, validation.environment);

  for (const service of [...workspace.services].sort((a, b) => a.id.localeCompare(b.id))) {
    if (service.type === 'web' || service.type === 'api') {
      const servicePlan = await createApplicationServicePlan(
        workspace,
        service,
        validation.ports,
        environmentByService.get(service.id) ?? [],
      );
      servicePlans.push(servicePlan.summary);
      for (const file of servicePlan.files)
        addFile(files, {
          path: `${service.path}/${file.path}`,
          content: file.content,
          owner: `service:${service.id}`,
        });
    } else if (service.type === 'shared-package') {
      const shared = sharedPackageFiles(service, workspace);
      servicePlans.push({
        serviceId: service.id,
        path: service.path,
        implementation: service.implementation,
        files: shared.map(({ path: filePath }) => filePath),
        dependencies: {},
        devDependencies: { typescript: '^5.9.2' },
        scripts: {
          build: 'tsc',
          lint: 'tsc --noEmit',
          typecheck: 'tsc --noEmit',
          test: 'tsc --noEmit',
        },
      });
      for (const file of shared)
        addFile(files, {
          path: `${service.path}/${file.path}`,
          content: file.content,
          owner: `shared-package:${service.id}`,
        });
    } else {
      addFile(files, {
        path: `${service.path}/README.md`,
        content: infrastructureReadme(service, validation.ports),
        owner:
          service.type === 'database' ? `database:${service.id}` : `infrastructure:${service.id}`,
      });
    }
  }

  const rootFiles = workspaceRootFiles(workspace, validation.ports, validation.environment);
  for (const file of rootFiles) addFile(files, { ...file, owner: 'workspace' });

  const dockerServices = dockerPlan(workspace, validation.ports);
  if (workspace.tooling.docker) {
    for (const service of workspace.services.filter(
      ({ type }) => type === 'web' || type === 'api',
    )) {
      addFile(files, {
        path: `${service.path}/Dockerfile`,
        content: serviceDockerfile(workspace, service),
        owner: `service:${service.id}`,
      });
    }
    addFile(files, {
      path: 'docker-compose.yml',
      content: dockerCompose(workspace, validation.ports),
      owner: 'workspace',
    });
    addFile(files, {
      path: '.dockerignore',
      content:
        'node_modules\n**/node_modules\ndist\n**/dist\n.next\n**/.next\ncoverage\n.git\n.env\n*.log\n',
      owner: 'workspace',
    });
  }
  if (workspace.tooling.githubActions)
    addFile(files, {
      path: '.github/workflows/ci.yml',
      content: workspaceCi(workspace.packageManager),
      owner: 'workspace',
    });

  const orderedFiles = [...files.values()].sort((a, b) => a.path.localeCompare(b.path));
  const plan: WorkspaceGenerationPlan = {
    schemaVersion: 1,
    planId: `workspace:${workspace.id}:v1`,
    workspaceName: workspace.name,
    destinationDirectory: input.destinationDirectory,
    workspace,
    files: orderedFiles,
    servicePlans: servicePlans.sort((a, b) => a.serviceId.localeCompare(b.serviceId)),
    ports: validation.ports,
    environment: validation.environment,
    connections: [...workspace.connections].sort((a, b) => a.id.localeCompare(b.id)),
    dockerServices,
    ci: {
      enabled: workspace.tooling.githubActions,
      scripts: ['lint', 'typecheck', 'test', 'build'],
    },
    warnings: validation.warnings.map(({ message }) => message),
  };
  validateWorkspaceGenerationPlan(plan);
  return plan;
}

export async function executeWorkspaceGenerationPlan(
  plan: WorkspaceGenerationPlan,
  processExecutor: WorkspaceProcessExecutor = defaultWorkspaceProcessExecutor,
): Promise<WorkspaceGenerationResult> {
  validateWorkspaceGenerationPlan(plan);
  const requestedParent = await lstat(plan.destinationDirectory).catch(() => undefined);
  if (!requestedParent?.isDirectory() || requestedParent.isSymbolicLink())
    throw new WorkspaceGenerationError(
      'UNSAFE_DESTINATION',
      'The selected destination must be an existing real directory, not a symbolic link.',
    );
  const parent = await realpath(plan.destinationDirectory).catch(() => {
    throw new WorkspaceGenerationError(
      'UNSAFE_DESTINATION',
      'The selected destination directory does not exist.',
    );
  });
  const destination = path.resolve(parent, plan.workspaceName);
  if (path.dirname(destination) !== parent)
    throw new WorkspaceGenerationError(
      'UNSAFE_DESTINATION',
      'Workspace destination must stay inside the selected directory.',
    );
  if (await pathExists(destination))
    throw new WorkspaceGenerationError(
      'UNSAFE_DESTINATION',
      'Workspace destination already exists.',
    );
  const staging = await mkdtemp(path.join(parent, `.forgeki-workspace-${plan.workspaceName}-`));
  let gitInitialized = false;
  const warnings = [...plan.warnings];
  try {
    for (const file of plan.files) {
      const output = path.resolve(staging, file.path);
      if (!output.startsWith(`${staging}${path.sep}`))
        throw new WorkspaceGenerationError('UNSAFE_FILE', `Unsafe planned path: ${file.path}.`);
      await mkdir(path.dirname(output), { recursive: true });
      if (!(await createFileSafely(output, file.content)))
        throw new WorkspaceGenerationError(
          'FILE_COLLISION',
          `Refusing to overwrite planned file ${file.path}.`,
        );
    }
    const expected = new Set(plan.files.map(({ path: filePath }) => filePath));
    if (expected.size !== plan.files.length)
      throw new WorkspaceGenerationError('FILE_COLLISION', 'The plan contains duplicate files.');
    if (plan.workspace.tooling.initializeGit) {
      const git = await processExecutor.run('git', ['init'], staging);
      gitInitialized = git.exitCode === 0;
      if (!gitInitialized) warnings.push('Git initialization failed; the workspace was preserved.');
    }
    await rename(staging, destination);
    return {
      workspaceDirectory: destination,
      createdFiles: plan.files.map(({ path: filePath }) => filePath),
      serviceCount: plan.workspace.services.length,
      warnings,
      plan,
      gitInitialized,
    };
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}

export function validateWorkspaceGenerationPlan(plan: WorkspaceGenerationPlan): void {
  const workspace = parseWorkspaceDefinition(plan.workspace);
  const validation = validateWorkspace(workspace);
  if (!validation.valid)
    throw new WorkspaceGenerationError(
      'INVALID_WORKSPACE',
      'Workspace plan contains an invalid architecture.',
    );
  if (plan.schemaVersion !== 1 || plan.planId !== `workspace:${workspace.id}:v1`)
    throw new WorkspaceGenerationError(
      'PLAN_MISMATCH',
      'Workspace generation plan identity is invalid.',
    );
  if (
    plan.workspaceName !== workspace.name ||
    path.basename(plan.workspaceName) !== plan.workspaceName
  )
    throw new WorkspaceGenerationError(
      'UNSAFE_DESTINATION',
      'Workspace name contains path segments.',
    );
  const paths = new Set<string>();
  for (const file of plan.files) {
    validateRelativeFile(file.path);
    if (paths.has(file.path))
      throw new WorkspaceGenerationError('FILE_COLLISION', `Duplicate planned file ${file.path}.`);
    if (!isWorkspaceOwner(file.owner, workspace))
      throw new WorkspaceGenerationError('PLAN_MISMATCH', `Unknown file owner ${file.owner}.`);
    if (Buffer.byteLength(file.content, 'utf8') > 1024 * 1024)
      throw new WorkspaceGenerationError(
        'UNSAFE_FILE',
        `${file.path} exceeds the file-size limit.`,
      );
    paths.add(file.path);
  }
}

function stackForService(workspace: ForgeWorkspace, service: WorkspaceService): StackDefinition {
  const components = new Set<StackComponentId>(['typescript']);
  for (const component of service.components ?? []) components.add(component);
  if (service.type === 'web' && !components.has('tailwind')) components.add('plain-css');
  const database = workspace.connections
    .filter(({ sourceServiceId, type }) => sourceServiceId === service.id && type === 'DATABASE')
    .map(({ targetServiceId }) => workspace.services.find(({ id }) => id === targetServiceId))
    .find(Boolean);
  if (database?.implementation === 'postgres') components.add('postgres');
  if (database?.implementation === 'sqlite') components.add('sqlite');
  return {
    framework: service.implementation as 'nextjs' | 'react-vite' | 'express',
    components: [...components].sort(),
    packageManager: workspace.packageManager,
    initializeGit: false,
    addDocker: false,
    addGitHubActions: false,
  };
}

async function createApplicationServicePlan(
  workspace: ForgeWorkspace,
  service: WorkspaceService,
  ports: readonly PlannedWorkspacePort[],
  environment: readonly PlannedWorkspaceEnvironmentVariable[],
): Promise<{ files: WorkspacePlannedFile[]; summary: WorkspaceServicePlan }> {
  const stack = stackForService(workspace, service);
  const project = await createGenerationPlan(stack, {
    projectName: service.name,
    destinationDirectory: '.',
  });
  const port = ports.find(({ serviceId }) => serviceId === service.id)?.port;
  const files = project.files
    .filter(({ path: filePath }) => filePath !== '.env.example')
    .map(({ path: filePath, content }) => ({
      path: filePath,
      content: tuneServiceFile(filePath, content, workspace, service, port),
      owner: `service:${service.id}` as const,
    }));
  const packageFile = files.find(({ path: filePath }) => filePath === 'package.json');
  if (!packageFile)
    throw new WorkspaceGenerationError('GENERATION_FAILED', `${service.name} has no package.json.`);
  const metadata = JSON.parse(packageFile.content) as {
    name: string;
    scripts: Record<string, string>;
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  };
  metadata.name = `@workspace/${service.name}`;
  if (port) {
    if (service.implementation === 'nextjs') {
      metadata.scripts.dev = `next dev --port ${port}`;
      metadata.scripts.start = `next start --port ${port}`;
    } else if (service.implementation === 'react-vite') {
      metadata.scripts.dev = `vite --port ${port}`;
      metadata.scripts.preview = `vite preview --port ${port}`;
    }
  }
  const sharedTargets = workspace.connections
    .filter(
      ({ sourceServiceId, type }) => sourceServiceId === service.id && type === 'SHARED_PACKAGE',
    )
    .map(({ targetServiceId }) => workspace.services.find(({ id }) => id === targetServiceId))
    .filter((item): item is WorkspaceService => Boolean(item));
  for (const shared of sharedTargets)
    metadata.dependencies[`@workspace/${shared.name}`] =
      workspace.packageManager === 'npm' ? '*' : 'workspace:*';
  const hasCache = workspace.connections.some(
    ({ sourceServiceId, type }) => sourceServiceId === service.id && type === 'CACHE',
  );
  if (hasCache) metadata.dependencies.redis = '^5.8.2';
  packageFile.content = `${JSON.stringify(metadata, null, 2)}\n`;
  if (environment.length)
    files.push({
      path: '.env.example',
      content: `${[...environment]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((item) => `# ${item.description}\n${item.name}=${item.localExample}`)
        .join('\n\n')}\n`,
      owner: `service:${service.id}`,
    });
  if (hasCache)
    files.push({
      path: 'src/lib/redis.ts',
      content:
        "import { createClient } from 'redis';\n\nexport const redis = createClient({ url: process.env.REDIS_URL });\n",
      owner: `service:${service.id}`,
    });
  if (
    workspace.connections.some(
      ({ sourceServiceId, type }) => sourceServiceId === service.id && type === 'HTTP',
    )
  )
    files.push({
      path: 'src/lib/api.ts',
      content: `${service.implementation === 'react-vite' ? 'const apiUrl = import.meta.env.VITE_API_URL;' : 'const apiUrl = process.env.API_URL;'}\nexport const healthEndpoint = new URL('/health', apiUrl).toString();\n`,
      owner: `service:${service.id}`,
    });
  for (const shared of sharedTargets)
    files.push({
      path: `src/shared-${shared.name}.ts`,
      content: `import type { HealthResponse } from '@workspace/${shared.name}';\n\nexport const healthy: HealthResponse = { status: 'ok' };\n`,
      owner: `service:${service.id}`,
    });
  return {
    files,
    summary: {
      serviceId: service.id,
      path: service.path,
      implementation: service.implementation,
      ...(port ? { port } : {}),
      files: files.map(({ path: filePath }) => filePath).sort(),
      dependencies: metadata.dependencies,
      devDependencies: metadata.devDependencies,
      scripts: metadata.scripts,
    },
  };
}

function tuneServiceFile(
  filePath: string,
  content: string,
  _workspace: ForgeWorkspace,
  service: WorkspaceService,
  port?: number,
): string {
  if (service.implementation === 'express' && filePath === 'src/index.ts' && port)
    return content.replaceAll("'3000'", `'${port}'`).replaceAll(': 3000;', `: ${port};`);
  if (service.implementation === 'react-vite' && filePath === 'vite.config.ts' && port)
    return content.replace(
      'defineConfig({ plugins: [react()] })',
      `defineConfig({ plugins: [react()], server: { port: ${port} }, preview: { port: ${port} } })`,
    );
  return content;
}

function groupEnvironment(
  workspace: ForgeWorkspace,
  variables: readonly PlannedWorkspaceEnvironmentVariable[],
): Map<string, PlannedWorkspaceEnvironmentVariable[]> {
  const groups = new Map<string, PlannedWorkspaceEnvironmentVariable[]>();
  for (const variable of variables) {
    const ownerId = variable.owner.slice(variable.owner.indexOf(':') + 1);
    const serviceId = variable.owner.startsWith('connection:')
      ? workspace.connections.find(({ id }) => id === ownerId)?.sourceServiceId
      : ownerId;
    if (!serviceId) continue;
    groups.set(serviceId, [...(groups.get(serviceId) ?? []), variable]);
  }
  return groups;
}

function sharedPackageFiles(service: WorkspaceService, workspace: ForgeWorkspace) {
  return [
    {
      path: 'package.json',
      content: `${JSON.stringify(
        {
          name: `@workspace/${service.name}`,
          version: '0.0.0',
          private: true,
          type: 'module',
          exports: { '.': { types: './dist/index.d.ts', import: './dist/index.js' } },
          scripts: {
            build: 'tsc',
            lint: 'tsc --noEmit',
            typecheck: 'tsc --noEmit',
            test: 'tsc --noEmit',
          },
          devDependencies: { typescript: '^5.9.2' },
          packageManager: `${workspace.packageManager}@${managerVersion(workspace.packageManager)}`,
        },
        null,
        2,
      )}\n`,
    },
    {
      path: 'tsconfig.json',
      content:
        '{"compilerOptions":{"target":"ES2022","module":"NodeNext","moduleResolution":"NodeNext","declaration":true,"outDir":"dist","rootDir":"src","strict":true},"include":["src"]}\n',
    },
    {
      path: 'src/index.ts',
      content: "export interface HealthResponse {\n  status: 'ok';\n}\n",
    },
    {
      path: 'README.md',
      content: `# @workspace/${service.name}\n\nPrivate shared TypeScript contracts for this workspace.\n`,
    },
  ];
}

function workspaceRootFiles(
  workspace: ForgeWorkspace,
  ports: readonly PlannedWorkspacePort[],
  environment: readonly PlannedWorkspaceEnvironmentVariable[],
): Array<Omit<WorkspacePlannedFile, 'owner'>> {
  const workspaces = ['apps/*', 'packages/*'];
  const rootPackage = {
    name: workspace.id,
    version: '0.0.0',
    private: true,
    packageManager: `${workspace.packageManager}@${managerVersion(workspace.packageManager)}`,
    workspaces,
    scripts: rootScripts(workspace.packageManager),
  };
  const files: Array<Omit<WorkspacePlannedFile, 'owner'>> = [
    { path: 'package.json', content: `${JSON.stringify(rootPackage, null, 2)}\n` },
    { path: 'forgeki.workspace.json', content: serializeWorkspace(workspace) },
    {
      path: '.gitignore',
      content:
        'node_modules\n**/node_modules\ndist\n**/dist\n.next\n**/.next\ncoverage\n.env\n.env.local\n*.log\n*.db\n',
    },
    {
      path: '.env.example',
      content: workspace.services.some(({ implementation }) => implementation === 'postgres')
        ? '# Development-only PostgreSQL placeholders. Do not use these values in production.\nPOSTGRES_USER=forgeki\nPOSTGRES_PASSWORD=forgeki-dev-only\nPOSTGRES_DB=forgeki\n'
        : '# No root infrastructure variables are required. Service examples live beside each app.\n',
    },
    { path: 'README.md', content: workspaceReadme(workspace, ports, environment) },
  ];
  if (workspace.packageManager === 'pnpm')
    files.push({
      path: 'pnpm-workspace.yaml',
      content: "packages:\n  - 'apps/*'\n  - 'packages/*'\n",
    });
  return files;
}

function rootScripts(manager: ForgeWorkspace['packageManager']): Record<string, string> {
  if (manager === 'pnpm')
    return {
      dev: 'pnpm -r --parallel --if-present dev',
      build: 'pnpm -r --if-present build',
      test: 'pnpm -r --if-present test',
      lint: 'pnpm -r --if-present lint',
      typecheck: 'pnpm -r --if-present typecheck',
    };
  if (manager === 'npm')
    return Object.fromEntries(
      ['dev', 'build', 'test', 'lint', 'typecheck'].map((script) => [
        script,
        `npm run ${script} --workspaces --if-present`,
      ]),
    );
  if (manager === 'yarn')
    return Object.fromEntries(
      ['dev', 'build', 'test', 'lint', 'typecheck'].map((script) => [
        script,
        `yarn workspaces foreach -Apt run ${script}`,
      ]),
    );
  return Object.fromEntries(
    ['dev', 'build', 'test', 'lint', 'typecheck'].map((script) => [
      script,
      `bun run --filter '*' ${script}`,
    ]),
  );
}

function workspaceReadme(
  workspace: ForgeWorkspace,
  ports: readonly PlannedWorkspacePort[],
  environment: readonly PlannedWorkspaceEnvironmentVariable[],
): string {
  const manager = workspace.packageManager;
  const install = manager === 'yarn' ? 'yarn install' : `${manager} install`;
  const run = manager === 'npm' ? 'npm run' : manager;
  return `# ${workspace.name}\n\nA deterministic local multi-service workspace generated by ForgeKi. This is a development foundation, not a production deployment.\n\n## Architecture\n\n\`\`\`text\n${asciiWorkspaceArchitecture(workspace, ports)}\n\`\`\`\n\n## Services\n\n${workspace.services
    .map(
      (service) =>
        `- \`${service.path}\`: ${service.implementation}${ports.find(({ serviceId }) => serviceId === service.id) ? ` on port ${ports.find(({ serviceId }) => serviceId === service.id)!.port}` : ''}`,
    )
    .join(
      '\n',
    )}\n\n## Environment\n\n${environment.length ? environment.map((item) => `- \`${item.name}\` (${item.owner}): ${item.description}`).join('\n') : 'No connection environment variables are required.'}\n\nCopy only the relevant \`.env.example\` files to local untracked \`.env\` files and replace development placeholders. Never commit secrets.\n\n## Local development\n\n\`\`\`sh\n${install}\n${run} dev\n\`\`\`\n\nThe root scripts also provide \`${run} lint\`, \`${run} typecheck\`, \`${run} test\`, and \`${run} build\`. ForgeKi did not install dependencies or start these services.\n\n## Docker Compose\n\n${workspace.tooling.docker ? `Run \`docker compose up --build\` manually when you want the declared development services. PostgreSQL and Redis are never started by ForgeKi.` : 'Docker Compose was not selected for this workspace.'}\n\n## Shared packages\n\n${
    workspace.services
      .filter(({ type }) => type === 'shared-package')
      .map(({ path: servicePath }) => `- \`${servicePath}\``)
      .join('\n') || 'No shared packages selected.'
  }\n`;
}

function serviceDockerfile(workspace: ForgeWorkspace, service: WorkspaceService): string {
  const install =
    workspace.packageManager === 'pnpm'
      ? 'RUN corepack enable && pnpm install --no-frozen-lockfile'
      : workspace.packageManager === 'npm'
        ? 'RUN npm install'
        : workspace.packageManager === 'yarn'
          ? 'RUN corepack enable && yarn install'
          : 'RUN bun install';
  const filter = `@workspace/${service.name}`;
  const script = (name: string, args = '') =>
    workspace.packageManager === 'pnpm'
      ? `pnpm --filter ${filter} ${name}${args ? ` -- ${args}` : ''}`
      : workspace.packageManager === 'npm'
        ? `npm run ${name} --workspace=${filter}${args ? ` -- ${args}` : ''}`
        : workspace.packageManager === 'yarn'
          ? `yarn workspace ${filter} ${name}${args ? ` ${args}` : ''}`
          : `bun run --filter ${filter} ${name}${args ? ` -- ${args}` : ''}`;
  const start =
    service.implementation === 'react-vite' ? script('preview', '--host 0.0.0.0') : script('start');
  return `FROM ${workspace.packageManager === 'bun' ? 'oven/bun:1-alpine' : 'node:20-alpine'}\nWORKDIR /workspace\nCOPY . .\n${install}\nRUN ${script('build')}\nCMD ["sh", "-c", "${start}"]\n`;
}

function dockerPlan(
  workspace: ForgeWorkspace,
  ports: readonly PlannedWorkspacePort[],
): WorkspaceDockerServicePlan[] {
  if (!workspace.tooling.docker) return [];
  return [...workspace.services]
    .filter(({ type, implementation }) => type !== 'shared-package' && implementation !== 'sqlite')
    .map((service) => ({
      id: service.id,
      kind:
        service.implementation === 'postgres'
          ? 'postgres'
          : service.implementation === 'redis'
            ? 'redis'
            : 'application',
      ...(ports.find(({ serviceId }) => serviceId === service.id)
        ? { port: ports.find(({ serviceId }) => serviceId === service.id)!.port }
        : {}),
      dependsOn: workspace.connections
        .filter(({ sourceServiceId }) => sourceServiceId === service.id)
        .map(({ targetServiceId }) => targetServiceId)
        .filter((id) => {
          const target = workspace.services.find((item) => item.id === id);
          return target?.type === 'database' || target?.type === 'infrastructure';
        })
        .sort(),
    })) as WorkspaceDockerServicePlan[];
}

function dockerCompose(workspace: ForgeWorkspace, ports: readonly PlannedWorkspacePort[]): string {
  const lines = ['services:'];
  const portFor = (id: string) => ports.find(({ serviceId }) => serviceId === id)?.port;
  for (const service of [...workspace.services].sort((a, b) => a.id.localeCompare(b.id))) {
    if (service.type === 'shared-package' || service.implementation === 'sqlite') continue;
    lines.push(`  ${service.name}:`);
    if (service.implementation === 'postgres') {
      lines.push(
        '    image: postgres:17-alpine',
        '    environment:',
        '      POSTGRES_USER: ${POSTGRES_USER:-forgeki}',
        '      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-forgeki-dev-only}',
        '      POSTGRES_DB: ${POSTGRES_DB:-forgeki}',
        `    ports: ["${portFor(service.id) ?? 5432}:5432"]`,
        '    healthcheck:',
        '      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-forgeki}"]',
        '      interval: 5s',
        '      timeout: 5s',
        '      retries: 10',
        `    volumes: ["${service.name}-data:/var/lib/postgresql/data"]`,
      );
    } else if (service.implementation === 'redis') {
      lines.push(
        '    image: redis:7-alpine',
        `    ports: ["${portFor(service.id) ?? 6379}:6379"]`,
        '    healthcheck:',
        '      test: ["CMD", "redis-cli", "ping"]',
        '      interval: 5s',
        '      timeout: 3s',
        '      retries: 10',
      );
    } else {
      const port = portFor(service.id)!;
      lines.push(
        '    build:',
        '      context: .',
        `      dockerfile: ${service.path}/Dockerfile`,
        `    ports: ["${port}:${port}"]`,
      );
      const variables = planWorkspaceEnvironment(workspace, ports).filter((variable) => {
        const connection = workspace.connections.find(
          ({ id }) => variable.owner === `connection:${id}`,
        );
        return connection?.sourceServiceId === service.id;
      });
      if (variables.length) {
        lines.push('    environment:');
        for (const variable of variables)
          lines.push(
            `      ${variable.name}: ${variable.containerExample ?? variable.localExample}`,
          );
      }
      const dependencies = workspace.connections
        .filter(({ sourceServiceId }) => sourceServiceId === service.id)
        .map(({ targetServiceId }) => workspace.services.find(({ id }) => id === targetServiceId))
        .filter((target): target is WorkspaceService =>
          Boolean(target && (target.type === 'database' || target.type === 'infrastructure')),
        );
      if (dependencies.length) {
        lines.push('    depends_on:');
        for (const target of dependencies)
          lines.push(`      ${target.name}:`, '        condition: service_healthy');
      }
    }
  }
  const volumes = workspace.services.filter(({ implementation }) => implementation === 'postgres');
  if (volumes.length) {
    lines.push('volumes:');
    for (const service of volumes) lines.push(`  ${service.name}-data:`);
  }
  return `${lines.join('\n')}\n`;
}

function workspaceCi(manager: ForgeWorkspace['packageManager']): string {
  const setup =
    manager === 'pnpm'
      ? '      - uses: pnpm/action-setup@v4\n'
      : manager === 'bun'
        ? '      - uses: oven-sh/setup-bun@v2\n'
        : '';
  const node =
    manager === 'bun'
      ? ''
      : '      - uses: actions/setup-node@v4\n        with:\n          node-version: 22\n';
  const install =
    manager === 'pnpm'
      ? 'pnpm install --no-frozen-lockfile'
      : manager === 'npm'
        ? 'npm install'
        : manager === 'yarn'
          ? 'yarn install'
          : 'bun install';
  const run = manager === 'npm' ? 'npm run' : manager;
  return `# Generated by ForgeKi for workspace validation only.\nname: CI\n\non:\n  push:\n    branches: [main, master]\n  pull_request:\n\njobs:\n  validate:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n${setup}${node}      - run: ${install}\n      - run: ${run} lint\n      - run: ${run} typecheck\n      - run: ${run} test\n      - run: ${run} build\n`;
}

function infrastructureReadme(
  service: WorkspaceService,
  ports: readonly PlannedWorkspacePort[],
): string {
  const port = ports.find(({ serviceId }) => serviceId === service.id)?.port;
  return `# ${service.name}\n\n${service.implementation} is declared as local development infrastructure${port ? ` on port ${port}` : ''}. ForgeKi does not install or start it.\n`;
}

function addFile(files: Map<string, WorkspacePlannedFile>, file: WorkspacePlannedFile): void {
  validateRelativeFile(file.path);
  const current = files.get(file.path);
  if (current && (current.content !== file.content || current.owner !== file.owner))
    throw new WorkspaceGenerationError(
      'FILE_COLLISION',
      `${file.path} is owned by both ${current.owner} and ${file.owner}.`,
    );
  files.set(file.path, file);
}

function validateRelativeFile(filePath: string): void {
  const normalized = filePath.replaceAll('\\', '/');
  if (
    !normalized ||
    normalized !== filePath ||
    normalized.startsWith('/') ||
    /^[A-Za-z]:/u.test(normalized) ||
    normalized.split('/').some((segment) => !segment || segment === '.' || segment === '..') ||
    [...normalized].some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127;
    })
  )
    throw new WorkspaceGenerationError('UNSAFE_FILE', `Unsafe workspace file path: ${filePath}.`);
}

function isWorkspaceOwner(owner: string, workspace: ForgeWorkspace): boolean {
  if (owner === 'workspace') return true;
  const [prefix, id] = owner.split(':');
  const service = workspace.services.find((item) => item.id === id);
  if (!service) return false;
  return (
    (prefix === 'service' && (service.type === 'web' || service.type === 'api')) ||
    (prefix === 'database' && service.type === 'database') ||
    (prefix === 'infrastructure' && service.type === 'infrastructure') ||
    (prefix === 'shared-package' && service.type === 'shared-package')
  );
}

function managerVersion(manager: ForgeWorkspace['packageManager']): string {
  return { pnpm: '10.15.0', npm: '11.5.2', yarn: '4.9.2', bun: '1.2.20' }[manager];
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await lstat(target);
    return true;
  } catch {
    return false;
  }
}
