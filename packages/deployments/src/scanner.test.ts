import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createDeploymentPlan, exportDeploymentPlan } from './generation.js';
import { saasProject, saasWorkspace } from './fixtures.js';
import { scanDeploymentProject } from './scanner.js';

async function projectFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'forgeki-scan-'));
  await writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({
      name: 'web',
      packageManager: 'pnpm@10.15.0',
      scripts: { build: 'vite build', start: 'vite preview' },
      dependencies: { react: '^19.0.0' },
      devDependencies: { vite: '^7.0.0' },
    }),
  );
  return root;
}

describe('deployment scanner', () => {
  it('detects a root project and environment schemas without reading values as output', async () => {
    const root = await projectFixture();
    await writeFile(
      path.join(root, '.env.production.example'),
      'VITE_API_URL=https://example.invalid\n',
    );
    const scan = await scanDeploymentProject(root);
    expect(scan.project.services[0]).toMatchObject({
      implementation: 'react-vite',
      path: '.',
      staticExportCompatible: true,
    });
    expect(scan.project.variables[0]).toMatchObject({ name: 'VITE_API_URL', browserVisible: true });
    expect(JSON.stringify(scan)).not.toContain('https://example.invalid');
  });

  it('detects Docker, Compose, Kubernetes, environment examples, metadata, and bundle hints', async () => {
    const root = await projectFixture();
    await writeFile(path.join(root, 'Dockerfile'), 'FROM node:22-alpine\n');
    await writeFile(path.join(root, 'docker-compose.production.yml'), 'services: {}\n');
    await mkdir(path.join(root, 'k8s'));
    await writeFile(
      path.join(root, 'k8s', 'web-deployment.yaml'),
      'apiVersion: apps/v1\nkind: Deployment\n',
    );
    await writeFile(path.join(root, '.env.example'), 'API_URL=\n');
    const kinds = (await scanDeploymentProject(root)).evidence.map(({ kind }) => kind);
    expect(kinds).toEqual(
      expect.arrayContaining(['dockerfile', 'compose', 'kubernetes', 'environment-example']),
    );
  });

  it('never executes and flags custom YAML tags', async () => {
    const root = await projectFixture();
    await writeFile(
      path.join(root, 'docker-compose.yml'),
      'value: !!js/function >\n  function () {}\n',
    );
    const scan = await scanDeploymentProject(root);
    expect(scan.evidence.some(({ kind }) => kind === 'security-warning')).toBe(true);
  });

  it('preserves public-prefix secret evidence so validation can block it', async () => {
    const root = await projectFixture();
    await writeFile(path.join(root, '.env.production.example'), 'VITE_DATABASE_PASSWORD=\n');
    const scan = await scanDeploymentProject(root);
    expect(scan.project.variables[0]).toMatchObject({
      name: 'VITE_DATABASE_PASSWORD',
      secret: true,
      browserVisible: true,
    });
  });

  it('reports matching, modified, and missing drift states from deterministic hashes', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'forgeki-drift-'));
    const plan = createDeploymentPlan(saasProject(), 'production', 'kubernetes');
    await exportDeploymentPlan(plan, root);
    await writeFile(path.join(root, 'forgeki.workspace.json'), JSON.stringify(saasWorkspace()));
    let scan = await scanDeploymentProject(root);
    expect(scan.drift.every(({ state }) => state === 'matches')).toBe(true);
    const changed = plan.files.find(({ path: filePath }) => filePath.endsWith('web-service.yaml'))!;
    await writeFile(
      path.join(root, ...changed.path.split('/')),
      `${await readFile(path.join(root, ...changed.path.split('/')), 'utf8')}# changed\n`,
    );
    const missing = plan.files.find(({ path: filePath }) => filePath.endsWith('api-service.yaml'))!;
    const { rm } = await import('node:fs/promises');
    await rm(path.join(root, ...missing.path.split('/')));
    scan = await scanDeploymentProject(root);
    expect(scan.drift.find(({ path: filePath }) => filePath === changed.path)?.state).toBe(
      'modified',
    );
    expect(scan.drift.find(({ path: filePath }) => filePath === missing.path)?.state).toBe(
      'missing',
    );
  });
});
