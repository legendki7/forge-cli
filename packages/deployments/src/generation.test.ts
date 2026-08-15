import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DeploymentError,
  assessDeploymentReadiness,
  createDeploymentPlan,
  environmentTemplate,
  exportDeploymentPlan,
  inspectDeploymentExport,
} from './generation.js';
import { saasProject } from './fixtures.js';

describe('deployment generation', () => {
  it.each(['local', 'staging', 'production'] as const)(
    'generates safe %s environment examples',
    (profile) => {
      const plan = createDeploymentPlan(saasProject(), profile, 'kubernetes');
      expect(
        plan.files.some(
          ({ path: filePath }) =>
            filePath === `.env.${profile}.example` ||
            (profile === 'local' && filePath === '.env.local.example'),
        ),
      ).toBe(true);
      expect(plan.files.some(({ path: filePath }) => /(?:^|\/)\.env$/u.test(filePath))).toBe(false);
      const env = plan.files
        .filter(({ path: filePath }) => filePath.includes('.env'))
        .map(({ content }) => content)
        .join('\n');
      expect(env).not.toContain('forgeki-dev-only');
      expect(env).toMatch(/DATABASE_URL=/u);
    },
  );

  it('creates deterministic plans and hashes', () => {
    expect(createDeploymentPlan(saasProject(), 'production', 'kubernetes')).toEqual(
      createDeploymentPlan(saasProject(), 'production', 'kubernetes'),
    );
  });

  it('generates Kubernetes Deployments, Services, ConfigMaps, PVCs, probes, and secret references', () => {
    const plan = createDeploymentPlan(saasProject(), 'production', 'kubernetes');
    const all = plan.files.map(({ content }) => content).join('\n');
    expect(plan.files.map(({ path: filePath }) => filePath).join('\n')).toMatch(
      /deployment\.yaml[\s\S]*service\.yaml/u,
    );
    expect(all).toContain('kind: ConfigMap');
    expect(all).toContain('kind: PersistentVolumeClaim');
    expect(all).toContain('secretKeyRef:');
    expect(all).not.toMatch(/kind: Secret\s/u);
    expect(all).toContain('replicas: 2');
    expect(all).toContain('readinessProbe:');
    expect(all).not.toContain('kubectl apply');
  });

  it('rejects invalid Kubernetes names, replicas, and resources', () => {
    const project = saasProject();
    project.services[0]!.id = 'Bad_Name';
    expect(() => createDeploymentPlan(project, 'production', 'kubernetes')).toThrow(
      /DNS-compatible/u,
    );
    expect(() =>
      createDeploymentPlan(saasProject(), 'production', 'kubernetes', { replicas: 99 }),
    ).toThrow(/replicas/u);
    expect(() =>
      createDeploymentPlan(saasProject(), 'production', 'kubernetes', {
        resources: { cpuLimit: 'anything' },
      }),
    ).toThrow(/resource/u);
  });

  it('generates trusted Docker Compose without privileged mode, host mounts, or plaintext secrets', () => {
    const plan = createDeploymentPlan(saasProject(), 'production', 'docker-compose');
    const compose = plan.files.find(
      ({ path: filePath }) => filePath === 'docker-compose.production.yml',
    )!.content;
    expect(compose).toContain('postgres:17-alpine');
    expect(compose).toContain('redis:7-alpine');
    expect(compose).toContain('${POSTGRES_PASSWORD:?Configure POSTGRES_PASSWORD}');
    expect(compose).not.toContain('privileged:');
    expect(compose).not.toContain('./:/');
    expect(compose).not.toContain('forgeki-dev-only');
    expect(plan.files.filter(({ path: filePath }) => filePath.includes('Dockerfile')).length).toBe(
      2,
    );
  });

  it('generates multi-stage non-root production Dockerfiles', () => {
    const plan = createDeploymentPlan(saasProject(), 'production', 'generic-docker');
    const dockerfiles = plan.files.filter(({ path: filePath }) => filePath.includes('Dockerfile'));
    expect(dockerfiles.length).toBe(2);
    expect(
      dockerfiles.every(
        ({ content }) => content.includes('AS build') && content.includes('USER forgeki'),
      ),
    ).toBe(true);
  });

  it('supports static React and Node server targets but blocks incompatible Next static export', () => {
    expect(
      createDeploymentPlan(saasProject(), 'production', 'static-export').files.some(
        ({ path: filePath }) => filePath === 'deployment/static.json',
      ),
    ).toBe(true);
    expect(
      createDeploymentPlan(saasProject(), 'production', 'node-server').files.some(
        ({ path: filePath }) => filePath === 'forgeki.node-server.json',
      ),
    ).toBe(true);
    const next = saasProject();
    next.services = [
      { ...next.services[0]!, implementation: 'nextjs', staticExportCompatible: false },
    ];
    expect(() => createDeploymentPlan(next, 'production', 'static-export')).toThrow(
      /cannot be exported/u,
    );
  });

  it('reports expected readiness warnings without network checks', () => {
    const project = saasProject();
    project.ciDetected = false;
    const readiness = assessDeploymentReadiness(project, 'staging', 'docker-compose');
    expect(readiness.status).toBe('ready-with-warnings');
    expect(readiness.warnings.some(({ code }) => code === 'CI_NOT_DETECTED')).toBe(true);
  });

  it('never prints or stores secret examples in templates', () => {
    const content = environmentTemplate(
      [
        {
          name: 'DATABASE_URL',
          owner: 'service:api',
          description: 'secret',
          required: true,
          secret: true,
          browserVisible: false,
          profiles: ['production'],
          exampleValue: 'must-not-leak',
        },
      ],
      'production',
    );
    expect(content).toContain('DATABASE_URL=');
    expect(content).not.toContain('must-not-leak');
  });

  it('previews and exports the same plan atomically without overwriting', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'forgeki-deploy-'));
    const plan = createDeploymentPlan(saasProject(), 'staging', 'docker-compose');
    const inspection = await inspectDeploymentExport(plan, root);
    expect(inspection.safe).toBe(true);
    const result = await exportDeploymentPlan(plan, root);
    expect(result.createdFiles).toEqual(plan.files.map(({ path: filePath }) => filePath));
    expect(await readFile(path.join(root, 'docker-compose.staging.yml'), 'utf8')).toBe(
      plan.files.find(({ path: filePath }) => filePath === 'docker-compose.staging.yml')!.content,
    );
    await expect(exportDeploymentPlan(plan, root)).rejects.toMatchObject({ code: 'COLLISION' });
  });

  it('blocks a conflicting non-empty directory without changing existing files', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'forgeki-conflict-'));
    await writeFile(path.join(root, 'DEPLOYMENT.md'), 'owned by user');
    const plan = createDeploymentPlan(saasProject(), 'production', 'kubernetes');
    await expect(exportDeploymentPlan(plan, root)).rejects.toBeInstanceOf(DeploymentError);
    expect(await readFile(path.join(root, 'DEPLOYMENT.md'), 'utf8')).toBe('owned by user');
  });

  it('blocks traversal and symlink destinations', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'forgeki-safe-'));
    const plan = createDeploymentPlan(saasProject(), 'production', 'kubernetes');
    plan.files[0]!.path = '../escape';
    await expect(inspectDeploymentExport(plan, root)).rejects.toMatchObject({
      code: 'UNSAFE_PATH',
    });
    if (process.platform !== 'win32') {
      await mkdir(path.join(root, 'real'));
      const { symlink } = await import('node:fs/promises');
      await symlink(path.join(root, 'real'), path.join(root, 'k8s'));
      const safePlan = createDeploymentPlan(saasProject(), 'production', 'kubernetes');
      await expect(inspectDeploymentExport(safePlan, root)).rejects.toMatchObject({
        code: 'UNSAFE_PATH',
      });
    }
  });
});
