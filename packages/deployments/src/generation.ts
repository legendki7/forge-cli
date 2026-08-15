import { createHash } from 'node:crypto';
import { lstat, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  architectureFingerprint,
  compatibleDeploymentTargets,
  createEnvironmentProfiles,
  validateEnvironmentProfiles,
  validateKubernetesName,
  validateKubernetesResources,
  validateReplicas,
  type DeploymentPlanOptions,
  type DeploymentProject,
  type DeploymentReadinessStatus,
  type DeploymentTargetId,
  type EnvironmentProfileId,
  type EnvironmentValidationResult,
  type KubernetesResources,
  type PlannedEnvironmentVariable,
} from './model.js';

export interface PlannedDeploymentFile {
  path: string;
  content: string;
  owner: string;
  hash: string;
}

export interface DeploymentWarning {
  code: string;
  message: string;
  serviceId?: string;
}

export interface DeploymentServicePlan {
  serviceId: string;
  target: DeploymentTargetId;
  port?: number;
  healthCheck?: { path: string; protocol: 'http'; port: number };
  replicas?: number;
  resources?: KubernetesResources;
}

export interface DeploymentReadiness {
  status: DeploymentReadinessStatus;
  errors: DeploymentWarning[];
  warnings: DeploymentWarning[];
  checks: { id: string; passed: boolean; message: string }[];
}

export interface DeploymentProfile {
  schemaVersion: 1;
  planId: string;
  environment: EnvironmentProfileId;
  target: DeploymentTargetId;
  project: DeploymentProject;
  services: DeploymentServicePlan[];
  environmentVariables: PlannedEnvironmentVariable[];
  files: PlannedDeploymentFile[];
  warnings: DeploymentWarning[];
  readiness: DeploymentReadiness;
  architectureFingerprint: string;
}

export interface DeploymentExportInspection {
  destination: string;
  files: string[];
  collisions: string[];
  safe: boolean;
}

export interface DeploymentExportResult {
  destination: string;
  createdFiles: string[];
  fingerprint: string;
}

export class DeploymentError extends Error {
  constructor(
    readonly code:
      'INVALID_PLAN' | 'UNSUPPORTED_TARGET' | 'UNSAFE_PATH' | 'COLLISION' | 'EXPORT_FAILED',
    message: string,
  ) {
    super(message);
    this.name = 'DeploymentError';
  }
}

const defaultResources: KubernetesResources = {
  cpuRequest: '100m',
  memoryRequest: '128Mi',
  cpuLimit: '500m',
  memoryLimit: '512Mi',
};

export function assessDeploymentReadiness(
  project: DeploymentProject,
  environment: EnvironmentProfileId,
  target: DeploymentTargetId,
  options: DeploymentPlanOptions = {},
): DeploymentReadiness {
  const validation = validateEnvironmentProfiles(
    project,
    createEnvironmentProfiles(project.variables),
    target,
  );
  const errors: DeploymentWarning[] = validation.errors.map(({ code, message }) => ({
    code,
    message,
  }));
  const warnings: DeploymentWarning[] = validation.warnings.map(({ code, message }) => ({
    code,
    message,
  }));
  const checks = [
    {
      id: 'environment-schema',
      passed: validation.errors.length === 0,
      message: 'Environment schema is valid and contains no secret values.',
    },
    {
      id: 'target-compatibility',
      passed: compatibleDeploymentTargets(project).includes(target),
      message: 'Deployment target matches the detected architecture.',
    },
    {
      id: 'ports',
      passed:
        new Set(project.services.map(({ port }) => port).filter(Boolean)).size ===
        project.services.map(({ port }) => port).filter(Boolean).length,
      message: 'Service ports are unique.',
    },
    {
      id: 'ci',
      passed: project.ciDetected,
      message: project.ciDetected
        ? 'CI configuration was detected.'
        : 'No CI configuration was detected; validate generated files manually.',
    },
  ];
  if (!project.ciDetected)
    warnings.push({ code: 'CI_NOT_DETECTED', message: 'No CI configuration was detected.' });
  for (const service of project.services.filter(isApplication)) {
    if (!service.buildScript)
      warnings.push({
        code: 'BUILD_SCRIPT_UNKNOWN',
        serviceId: service.id,
        message: `Build script for ${service.name} could not be confirmed.`,
      });
    if (
      (target === 'node-server' || target === 'generic-docker' || target === 'kubernetes') &&
      service.implementation !== 'react-vite' &&
      !service.startScript
    )
      warnings.push({
        code: 'START_SCRIPT_UNKNOWN',
        serviceId: service.id,
        message: `Start script for ${service.name} could not be confirmed.`,
      });
  }
  if (target === 'static-export') {
    const incompatibleNext = project.services.find(
      ({ implementation, staticExportCompatible }) =>
        implementation === 'nextjs' && !staticExportCompatible,
    );
    if (incompatibleNext)
      errors.push({
        code: 'NEXT_STATIC_INCOMPATIBLE',
        serviceId: incompatibleNext.id,
        message:
          'This Next.js project uses server functionality and cannot be exported as a static site with the current configuration.',
      });
  }
  if (target === 'kubernetes') {
    const replicas = options.replicas ?? (environment === 'production' ? 2 : 1);
    if (!validateReplicas(replicas))
      errors.push({
        code: 'INVALID_REPLICAS',
        message: 'Kubernetes replicas must be an integer from 1 through 20.',
      });
    const resources = { ...defaultResources, ...options.resources };
    if (!validateKubernetesResources(resources))
      errors.push({
        code: 'INVALID_RESOURCES',
        message: 'Kubernetes resource requests and limits are invalid or unbounded.',
      });
    for (const service of project.services)
      if (!validateKubernetesName(service.id))
        errors.push({
          code: 'INVALID_KUBERNETES_NAME',
          serviceId: service.id,
          message: `${service.id} is not a DNS-compatible Kubernetes name.`,
        });
  }
  return {
    status: errors.length ? 'blocked' : warnings.length ? 'ready-with-warnings' : 'ready',
    errors,
    warnings,
    checks,
  };
}

export function createDeploymentPlan(
  project: DeploymentProject,
  environment: EnvironmentProfileId,
  target: DeploymentTargetId,
  options: DeploymentPlanOptions = {},
): DeploymentProfile {
  const readiness = assessDeploymentReadiness(project, environment, target, options);
  if (readiness.status === 'blocked')
    throw new DeploymentError(
      'INVALID_PLAN',
      readiness.errors.map(({ message }) => message).join(' '),
    );
  const fingerprint = architectureFingerprint(project, target);
  const resources = { ...defaultResources, ...options.resources };
  const replicas = options.replicas ?? (environment === 'production' ? 2 : 1);
  const services: DeploymentServicePlan[] = project.services.map((service) => ({
    serviceId: service.id,
    target,
    ...(service.port ? { port: service.port } : {}),
    ...(healthCheck(service) ? { healthCheck: healthCheck(service) } : {}),
    ...(target === 'kubernetes' && isApplication(service) ? { replicas, resources } : {}),
  }));
  const rawFiles = new Map<string, { path: string; content: string; owner: string }>();
  for (const file of environmentFiles(project, environment)) add(rawFiles, file);
  if (target === 'docker-compose') {
    for (const service of project.services.filter(isApplication))
      add(rawFiles, dockerfile(project, service));
    add(rawFiles, {
      path: composeFilename(environment),
      content: dockerCompose(project, environment),
      owner: 'workspace',
    });
  }
  if (target === 'generic-docker')
    for (const service of project.services.filter(isApplication))
      add(rawFiles, dockerfile(project, service));
  if (target === 'kubernetes')
    for (const file of kubernetesFiles(project, environment, replicas, resources))
      add(rawFiles, file);
  if (target === 'static-export')
    add(rawFiles, {
      path: 'deployment/static.json',
      content: staticMetadata(project),
      owner: 'workspace',
    });
  if (target === 'node-server')
    add(rawFiles, {
      path: 'forgeki.node-server.json',
      content: nodeServerMetadata(project),
      owner: 'workspace',
    });
  add(rawFiles, {
    path: 'DEPLOYMENT.md',
    content: deploymentReadme(project, environment, target, fingerprint, [...rawFiles.keys()]),
    owner: 'workspace',
  });
  let files = finalizeFiles(rawFiles);
  if (options.includeMetadata !== false) {
    const metadata = deploymentMetadata(environment, target, fingerprint, files);
    files = [...files, plannedFile('forgeki.deployment.json', metadata, 'workspace')].sort((a, b) =>
      a.path.localeCompare(b.path),
    );
  }
  return {
    schemaVersion: 1,
    planId: `deployment:${project.id}:${environment}:${target}:v1`,
    environment,
    target,
    project,
    services,
    environmentVariables: project.variables.filter(({ profiles }) =>
      profiles.includes(environment),
    ),
    files,
    warnings: readiness.warnings,
    readiness,
    architectureFingerprint: fingerprint,
  };
}

export async function inspectDeploymentExport(
  plan: DeploymentProfile,
  destination: string,
): Promise<DeploymentExportInspection> {
  const root = path.resolve(destination);
  const rootStat = await safeLstat(root);
  if (rootStat?.isSymbolicLink() || (rootStat && !rootStat.isDirectory()))
    throw new DeploymentError('UNSAFE_PATH', 'Deployment destination must be a real directory.');
  const collisions: string[] = [];
  for (const file of plan.files) {
    validateRelativePath(file.path);
    const target = path.resolve(root, ...file.path.split('/'));
    if (!within(root, target))
      throw new DeploymentError('UNSAFE_PATH', `Unsafe deployment path: ${file.path}.`);
    await assertNoSymlink(root, target);
    if (await safeLstat(target)) collisions.push(file.path);
  }
  return {
    destination: root,
    files: plan.files.map(({ path: filePath }) => filePath),
    collisions,
    safe: collisions.length === 0,
  };
}

export async function exportDeploymentPlan(
  plan: DeploymentProfile,
  destination: string,
): Promise<DeploymentExportResult> {
  const inspection = await inspectDeploymentExport(plan, destination);
  if (inspection.collisions.length)
    throw new DeploymentError(
      'COLLISION',
      `Deployment export would overwrite: ${inspection.collisions.join(', ')}.`,
    );
  await mkdir(inspection.destination, { recursive: true });
  const created: string[] = [];
  try {
    for (const file of plan.files) {
      const target = path.join(inspection.destination, ...file.path.split('/'));
      await mkdir(path.dirname(target), { recursive: true });
      await assertNoSymlink(inspection.destination, target);
      const temporary = `${target}.forgeki-${process.pid}.tmp`;
      await writeFile(temporary, file.content, { encoding: 'utf8', flag: 'wx' });
      await rename(temporary, target);
      created.push(file.path);
    }
    return {
      destination: inspection.destination,
      createdFiles: created,
      fingerprint: plan.architectureFingerprint,
    };
  } catch (error) {
    for (const file of created.reverse())
      await rm(path.join(inspection.destination, ...file.split('/')), { force: true }).catch(
        () => undefined,
      );
    throw error instanceof DeploymentError
      ? error
      : new DeploymentError(
          'EXPORT_FAILED',
          error instanceof Error ? error.message : 'Deployment export failed.',
        );
  }
}

export function environmentTemplate(
  variableList: readonly PlannedEnvironmentVariable[],
  profile: EnvironmentProfileId,
): string {
  const lines = [
    `# ForgeKi ${profile} environment schema.`,
    '# Copy values into an untracked environment file or configure them in your deployment platform.',
    '# ForgeKi does not store secret values.',
    '',
  ];
  for (const item of [...variableList]
    .filter(({ profiles }) => profiles.includes(profile))
    .sort((a, b) => a.name.localeCompare(b.name))) {
    lines.push(
      `# ${item.description}`,
      `# owner=${item.owner} ${item.required ? 'required' : 'optional'} ${item.secret ? 'secret' : item.browserVisible ? 'public' : 'configuration'}`,
    );
    lines.push(`${item.name}=${item.secret ? '' : (item.exampleValue ?? '')}`, '');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

function environmentFiles(project: DeploymentProject, selected: EnvironmentProfileId) {
  const files: { path: string; content: string; owner: string }[] = [];
  for (const profile of ['local', 'staging', 'production'] as const) {
    const variables = project.variables.filter(({ owner }) => owner === 'workspace');
    const profilePath = profile === 'local' ? '.env.local.example' : `.env.${profile}.example`;
    files.push({
      path: profilePath,
      content:
        project.services.length === 1 || variables.length
          ? environmentTemplate(
              project.services.length === 1 ? project.variables : variables,
              profile,
            )
          : workspaceEnvironmentIndex(project, profile),
      owner: 'workspace',
    });
    for (const service of project.services.filter(isApplication)) {
      const owned = project.variables.filter(({ owner }) => owner === `service:${service.id}`);
      if (project.services.length > 1 && owned.length)
        files.push({
          path: `${service.path}/.env.${profile}.example`,
          content: environmentTemplate(owned, profile),
          owner: `service:${service.id}`,
        });
    }
  }
  files.push({
    path: '.env.example',
    content: environmentTemplate(project.variables, selected),
    owner: 'workspace',
  });
  return files;
}

function workspaceEnvironmentIndex(
  project: DeploymentProject,
  profile: EnvironmentProfileId,
): string {
  const lines = [
    `# ForgeKi ${profile} workspace environment index.`,
    '# Values are separated into service-specific example files to avoid unnecessary duplication.',
    '# ForgeKi does not store secret values.',
    '',
  ];
  for (const service of project.services.filter(isApplication)) {
    const count = project.variables.filter(
      ({ owner, profiles }) => owner === `service:${service.id}` && profiles.includes(profile),
    ).length;
    if (count)
      lines.push(`# ${service.id}: ${service.path}/.env.${profile}.example (${count} variables)`);
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

function dockerfile(project: DeploymentProject, service: DeploymentProject['services'][number]) {
  const manager = project.packageManager;
  const install =
    manager === 'pnpm'
      ? 'corepack enable && pnpm install --frozen-lockfile'
      : manager === 'yarn'
        ? 'corepack enable && yarn install --immutable'
        : manager === 'bun'
          ? 'bun install --frozen-lockfile'
          : 'npm ci';
  const run = manager === 'npm' ? 'npm run' : manager;
  const servicePath = service.path === '.' ? '' : service.path;
  const work = servicePath ? `/app/${servicePath}` : '/app';
  const port = service.port ?? (service.implementation === 'express' ? 4000 : 3000);
  const health = healthCheck(service);
  const content = `FROM node:22-alpine AS build\nWORKDIR /app\nCOPY . .\nRUN ${install}\nRUN ${servicePath && manager === 'pnpm' ? `pnpm --filter ${service.name} build` : `${run} build`}\n\nFROM node:22-alpine AS runtime\nENV NODE_ENV=production\nWORKDIR ${work}\nRUN addgroup -S forgeki && adduser -S forgeki -G forgeki\nCOPY --from=build --chown=forgeki:forgeki /app /app\nUSER forgeki\nEXPOSE ${port}\n${health ? `HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:${port}${health.path} || exit 1\n` : ''}CMD ["${manager === 'npm' ? 'npm' : manager}", "${manager === 'npm' ? 'run' : 'start'}"${manager === 'npm' ? ', "start"' : ''}]\n`;
  return {
    path: service.path === '.' ? 'Dockerfile' : `${service.path}/Dockerfile.production`,
    content,
    owner: `service:${service.id}`,
  };
}

function dockerCompose(project: DeploymentProject, environment: EnvironmentProfileId): string {
  const lines = ['# Review before use. ForgeKi generated configuration only.', 'services:'];
  for (const service of [...project.services].sort((a, b) => a.id.localeCompare(b.id))) {
    lines.push(`  ${service.id}:`);
    if (service.implementation === 'postgres') {
      lines.push(
        '    image: postgres:17-alpine',
        '    environment:',
        '      POSTGRES_USER: ${POSTGRES_USER:?Configure POSTGRES_USER}',
        '      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?Configure POSTGRES_PASSWORD}',
        '      POSTGRES_DB: ${POSTGRES_DB:?Configure POSTGRES_DB}',
        '    restart: unless-stopped',
        '    healthcheck:',
        '      test: ["CMD-SHELL", "pg_isready -U $$POSTGRES_USER"]',
        '      interval: 10s',
        '      timeout: 5s',
        '      retries: 5',
        `    volumes: ["${service.id}-data:/var/lib/postgresql/data"]`,
      );
    } else if (service.implementation === 'redis') {
      lines.push(
        '    image: redis:7-alpine',
        '    restart: unless-stopped',
        '    healthcheck:',
        '      test: ["CMD", "redis-cli", "ping"]',
        '      interval: 10s',
        '      timeout: 3s',
        '      retries: 5',
        `    volumes: ["${service.id}-data:/data"]`,
      );
    } else if (isApplication(service)) {
      lines.push(
        '    build:',
        '      context: .',
        `      dockerfile: ${service.path === '.' ? 'Dockerfile' : `${service.path}/Dockerfile.production`}`,
        `    restart: ${environment === 'local' ? 'no' : 'unless-stopped'}`,
        `    ports: ["${service.port ?? 3000}:${service.port ?? 3000}"]`,
      );
      const variables = project.variables.filter(
        ({ owner, profiles }) =>
          owner === `service:${service.id}` && profiles.includes(environment),
      );
      if (variables.length) {
        lines.push('    environment:');
        for (const item of variables)
          lines.push(`      ${item.name}: \${${item.name}:?Configure ${item.name}}`);
      }
    }
  }
  const volumes = project.services.filter(
    ({ implementation }) => implementation === 'postgres' || implementation === 'redis',
  );
  if (volumes.length) {
    lines.push('volumes:');
    for (const service of volumes) lines.push(`  ${service.id}-data:`);
  }
  return `${lines.join('\n')}\n`;
}

function kubernetesFiles(
  project: DeploymentProject,
  environment: EnvironmentProfileId,
  replicas: number,
  resources: KubernetesResources,
) {
  const files: { path: string; content: string; owner: string }[] = [];
  for (const service of [...project.services].sort((a, b) => a.id.localeCompare(b.id))) {
    const prefix = `k8s/${service.id}`;
    if (isApplication(service)) {
      const port = service.port ?? (service.implementation === 'express' ? 4000 : 3000);
      const nonSecret = project.variables.filter(
        ({ owner, secret }) => owner === `service:${service.id}` && !secret,
      );
      const secrets = project.variables.filter(
        ({ owner, secret }) => owner === `service:${service.id}` && secret,
      );
      files.push({
        path: `${prefix}-configmap.yaml`,
        owner: `service:${service.id}`,
        content: configMap(service.id, nonSecret),
      });
      files.push({
        path: `${prefix}-deployment.yaml`,
        owner: `service:${service.id}`,
        content: applicationDeployment(
          service.id,
          environment,
          port,
          replicas,
          resources,
          nonSecret,
          secrets,
          healthCheck(service)?.path,
        ),
      });
      files.push({
        path: `${prefix}-service.yaml`,
        owner: `service:${service.id}`,
        content: kubernetesService(service.id, port),
      });
    } else if (service.implementation === 'postgres' || service.implementation === 'redis') {
      const port = service.implementation === 'postgres' ? 5432 : 6379;
      files.push({
        path: `${prefix}-pvc.yaml`,
        owner: `${service.implementation === 'postgres' ? 'database' : 'infrastructure'}:${service.id}`,
        content: pvc(service.id),
      });
      files.push({
        path: `${prefix}-deployment.yaml`,
        owner: `${service.implementation === 'postgres' ? 'database' : 'infrastructure'}:${service.id}`,
        content: referenceDataDeployment(service.id, service.implementation, port),
      });
      files.push({
        path: `${prefix}-service.yaml`,
        owner: `${service.implementation === 'postgres' ? 'database' : 'infrastructure'}:${service.id}`,
        content: kubernetesService(service.id, port),
      });
    }
  }
  return files;
}

function applicationDeployment(
  name: string,
  environment: EnvironmentProfileId,
  port: number,
  replicas: number,
  resources: KubernetesResources,
  publicVars: readonly PlannedEnvironmentVariable[],
  secrets: readonly PlannedEnvironmentVariable[],
  healthPath?: string,
): string {
  const env: string[] = [];
  for (const item of publicVars)
    env.push(
      `            - name: ${item.name}`,
      '              valueFrom:',
      '                configMapKeyRef:',
      `                  name: ${name}-config`,
      `                  key: ${item.name}`,
    );
  for (const item of secrets)
    env.push(
      `            - name: ${item.name}`,
      '              valueFrom:',
      '                secretKeyRef:',
      `                  name: ${name}-secrets`,
      `                  key: ${item.name}`,
    );
  return `apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: ${name}\n  labels:\n    app.kubernetes.io/name: ${name}\n    app.kubernetes.io/managed-by: forgeki\n    forgeki.io/environment: ${environment}\nspec:\n  replicas: ${replicas}\n  selector:\n    matchLabels:\n      app.kubernetes.io/name: ${name}\n  template:\n    metadata:\n      labels:\n        app.kubernetes.io/name: ${name}\n    spec:\n      securityContext:\n        runAsNonRoot: true\n      containers:\n        - name: ${name}\n          image: replace-with-your-trusted-registry/${name}:review-required\n          ports:\n            - containerPort: ${port}\n${env.length ? `          env:\n${env.join('\n')}\n` : ''}${healthPath ? `          readinessProbe:\n            httpGet:\n              path: ${healthPath}\n              port: ${port}\n          livenessProbe:\n            httpGet:\n              path: ${healthPath}\n              port: ${port}\n` : ''}          resources:\n            requests:\n              cpu: ${resources.cpuRequest}\n              memory: ${resources.memoryRequest}\n            limits:\n              cpu: ${resources.cpuLimit}\n              memory: ${resources.memoryLimit}\n`;
}

function configMap(name: string, variables: readonly PlannedEnvironmentVariable[]): string {
  const data = variables.length
    ? variables.map((item) => `  ${item.name}: "${yamlScalar(item.exampleValue ?? '')}"`).join('\n')
    : '  FORGEKI_CONFIGURATION: "review-required"';
  return `apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: ${name}-config\ndata:\n${data}\n`;
}

function kubernetesService(name: string, port: number): string {
  return `apiVersion: v1\nkind: Service\nmetadata:\n  name: ${name}\nspec:\n  selector:\n    app.kubernetes.io/name: ${name}\n  ports:\n    - name: http\n      port: ${port}\n      targetPort: ${port}\n`;
}

function pvc(name: string): string {
  return `apiVersion: v1\nkind: PersistentVolumeClaim\nmetadata:\n  name: ${name}-data\nspec:\n  accessModes: ["ReadWriteOnce"]\n  resources:\n    requests:\n      storage: 1Gi\n`;
}

function referenceDataDeployment(
  name: string,
  implementation: 'postgres' | 'redis',
  port: number,
): string {
  const image = implementation === 'postgres' ? 'postgres:17-alpine' : 'redis:7-alpine';
  return `# Reference development manifest. Prefer a managed production service where appropriate.\napiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: ${name}\nspec:\n  replicas: 1\n  selector:\n    matchLabels:\n      app.kubernetes.io/name: ${name}\n  template:\n    metadata:\n      labels:\n        app.kubernetes.io/name: ${name}\n    spec:\n      containers:\n        - name: ${name}\n          image: ${image}\n          ports:\n            - containerPort: ${port}\n          volumeMounts:\n            - name: data\n              mountPath: ${implementation === 'postgres' ? '/var/lib/postgresql/data' : '/data'}\n      volumes:\n        - name: data\n          persistentVolumeClaim:\n            claimName: ${name}-data\n`;
}

function staticMetadata(project: DeploymentProject): string {
  const services = project.services.filter(
    ({ implementation, staticExportCompatible }) =>
      implementation === 'react-vite' || (implementation === 'nextjs' && staticExportCompatible),
  );
  return `${JSON.stringify({ schemaVersion: 1, kind: 'static-export', services: services.map(({ id, implementation }) => ({ id, implementation, buildCommand: `${project.packageManager === 'npm' ? 'npm run' : project.packageManager} build`, outputDirectory: implementation === 'react-vite' ? 'dist' : 'out' })) }, null, 2)}\n`;
}

function nodeServerMetadata(project: DeploymentProject): string {
  return `${JSON.stringify({ schemaVersion: 1, node: '22', services: project.services.filter(({ implementation }) => implementation === 'express' || implementation === 'nextjs').map(({ id, port }) => ({ id, install: project.packageManager === 'npm' ? 'npm ci' : `${project.packageManager} install --frozen-lockfile`, build: `${project.packageManager === 'npm' ? 'npm run' : project.packageManager} build`, start: `${project.packageManager === 'npm' ? 'npm run' : project.packageManager} start`, port })) }, null, 2)}\n`;
}

function deploymentReadme(
  project: DeploymentProject,
  environment: EnvironmentProfileId,
  target: DeploymentTargetId,
  fingerprint: string,
  files: string[],
): string {
  const variables = project.variables.filter(({ profiles }) => profiles.includes(environment));
  const listed = (items: PlannedEnvironmentVariable[]) =>
    items.length
      ? items
          .map(
            ({ name, owner, required }) =>
              `- \`${name}\` (${owner}, ${required ? 'required' : 'optional'})`,
          )
          .join('\n')
      : '- None';
  return `# ForgeKi deployment configuration\n\nForgeKi generated deployment configuration only. ForgeKi did not deploy this project. Review every file before manual use.\n\n## Profile\n\n- Environment: ${environment}\n- Target: ${target}\n- Architecture fingerprint: \`${fingerprint}\`\n\n## Architecture\n\n${project.services.map(({ id, implementation, port }) => `- ${id}: ${implementation}${port ? ` on port ${port}` : ''}`).join('\n')}\n\n## Public configuration\n\n${listed(variables.filter(({ secret }) => !secret))}\n\n## Secrets\n\n${listed(variables.filter(({ secret }) => secret))}\n\nConfigure secrets in your deployment platform. ForgeKi does not store secret values and does not generate Kubernetes Secret data.\n\n## Health checks\n\n${
    project.services
      .filter(isApplication)
      .map(
        (service) =>
          `- ${service.id}: ${healthCheck(service)?.path ?? 'No application endpoint required/detected'}`,
      )
      .join('\n') || '- None'
  }\n\n## Generated files\n\n${files
    .sort()
    .map((file) => `- \`${file}\``)
    .join(
      '\n',
    )}\n\n## Manual next steps\n\n1. Review the generated files and limitations.\n2. Configure required values and secrets in the destination platform.\n3. Run your normal build and test process.\n4. Apply or run configuration manually only after your own security review.\n\n## Limitations\n\nThese are conservative starter artifacts, not universal production hardening. Database Kubernetes manifests are reference configurations; managed services may be preferable. ForgeKi did not contact Docker, Kubernetes, or any cloud provider.\n`;
}

function deploymentMetadata(
  environment: EnvironmentProfileId,
  target: DeploymentTargetId,
  fingerprint: string,
  files: PlannedDeploymentFile[],
): string {
  return `${JSON.stringify({ schemaVersion: 1, environment, target, architectureFingerprint: fingerprint, generatedFiles: Object.fromEntries(files.map(({ path: filePath, hash }) => [filePath, hash])) }, null, 2)}\n`;
}

function finalizeFiles(
  files: Map<string, { path: string; content: string; owner: string }>,
): PlannedDeploymentFile[] {
  return [...files.values()]
    .map(({ path: filePath, content, owner }) => plannedFile(filePath, content, owner))
    .sort((a, b) => a.path.localeCompare(b.path));
}

function plannedFile(filePath: string, content: string, owner: string): PlannedDeploymentFile {
  validateRelativePath(filePath);
  return {
    path: filePath,
    content,
    owner,
    hash: createHash('sha256').update(content).digest('hex'),
  };
}

function add(
  files: Map<string, { path: string; content: string; owner: string }>,
  file: { path: string; content: string; owner: string },
): void {
  validateRelativePath(file.path);
  const current = files.get(file.path);
  if (current && current.content !== file.content)
    throw new DeploymentError('INVALID_PLAN', `Conflicting generated file ${file.path}.`);
  files.set(file.path, file);
}

function composeFilename(environment: EnvironmentProfileId): string {
  return environment === 'local' ? 'docker-compose.yml' : `docker-compose.${environment}.yml`;
}

function healthCheck(service: DeploymentProject['services'][number]) {
  if (service.implementation === 'express')
    return { path: '/health', protocol: 'http' as const, port: service.port ?? 4000 };
  return undefined;
}

function isApplication(service: DeploymentProject['services'][number]): boolean {
  return (
    service.implementation === 'nextjs' ||
    service.implementation === 'react-vite' ||
    service.implementation === 'express'
  );
}

function yamlScalar(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replace(/[\r\n]/gu, '');
}

function validateRelativePath(filePath: string): void {
  const normalized = filePath.replaceAll('\\', '/');
  if (
    !normalized ||
    normalized !== filePath ||
    normalized.startsWith('/') ||
    /^[A-Za-z]:/u.test(normalized) ||
    normalized.split('/').some((part) => !part || part === '.' || part === '..') ||
    normalized.includes('\0')
  )
    throw new DeploymentError('UNSAFE_PATH', `Unsafe deployment path: ${filePath}.`);
}

function within(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function safeLstat(target: string) {
  try {
    return await lstat(target);
  } catch (error) {
    if (isRecord(error) && error.code === 'ENOENT') return undefined;
    throw error;
  }
}

async function assertNoSymlink(root: string, target: string): Promise<void> {
  let current = path.dirname(target);
  while (within(root, current) && current !== path.dirname(current)) {
    const stat = await safeLstat(current);
    if (stat?.isSymbolicLink())
      throw new DeploymentError(
        'UNSAFE_PATH',
        `Symbolic links are not allowed in deployment destinations: ${current}.`,
      );
    if (current === root) break;
    current = path.dirname(current);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function readinessFromValidation(
  validation: EnvironmentValidationResult,
): DeploymentReadiness {
  return {
    status: validation.status,
    errors: validation.errors.map(({ code, message }) => ({ code, message })),
    warnings: validation.warnings.map(({ code, message }) => ({ code, message })),
    checks: [],
  };
}
