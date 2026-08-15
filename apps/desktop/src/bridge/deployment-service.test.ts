import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { handleWorkerEnvelope, type WorkerMessage } from './service';

const temporary: string[] = [];
afterEach(async () =>
  Promise.all(
    temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  ),
);

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'forgeki-worker-deployment-'));
  temporary.push(root);
  await writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({
      name: 'api',
      packageManager: 'pnpm@10.15.0',
      scripts: { build: 'tsc', start: 'node dist/index.js' },
      dependencies: { express: '^5.0.0' },
    }),
  );
  await writeFile(
    path.join(root, '.env.production.example'),
    'DATABASE_URL=never-read-this-value\n',
  );
  return root;
}

async function operation(
  operation: 'scan-deployment' | 'plan-deployment' | 'export-deployment',
  request: unknown,
) {
  const messages: WorkerMessage[] = [];
  await handleWorkerEnvelope({ operationId: 'deployment-test', operation, request }, (message) =>
    messages.push(message),
  );
  return messages.at(-1)!;
}

describe('Desktop deployment worker boundary', () => {
  it('scans and plans through typed operations without exposing values', async () => {
    const root = await fixture();
    const scan = await operation('scan-deployment', { projectDirectory: root });
    expect(scan.type).toBe('operation-result');
    expect(JSON.stringify(scan)).not.toContain('never-read-this-value');
    const plan = await operation('plan-deployment', {
      projectDirectory: root,
      environment: 'production',
      target: 'kubernetes',
      options: { replicas: 2, includeMetadata: true },
    });
    expect(plan.type).toBe('operation-result');
    if (plan.type === 'operation-result')
      expect(JSON.stringify(plan.payload)).toContain('k8s/api-deployment.yaml');
  });

  it('recomputes the trusted plan before export and rejects arbitrary options', async () => {
    const root = await fixture();
    const output = await mkdtemp(path.join(tmpdir(), 'forgeki-worker-output-'));
    temporary.push(output);
    const planned = await operation('plan-deployment', {
      projectDirectory: root,
      environment: 'production',
      target: 'node-server',
      options: { includeMetadata: true },
    });
    if (planned.type !== 'operation-result') throw new Error('Plan failed');
    const exported = await operation('export-deployment', {
      projectDirectory: root,
      destinationDirectory: output,
      environment: 'production',
      target: 'node-server',
      options: { includeMetadata: true },
      reviewedPlan: planned.payload,
    });
    expect(exported.type).toBe('operation-result');
    expect(await readFile(path.join(output, 'DEPLOYMENT.md'), 'utf8')).toContain('did not deploy');
    const rejected = await operation('plan-deployment', {
      projectDirectory: root,
      environment: 'production',
      target: 'node-server',
      options: { shell: 'powershell' },
    });
    expect(rejected.type).toBe('error');
  });

  it('blocks a modified reviewed plan', async () => {
    const root = await fixture();
    const output = await mkdtemp(path.join(tmpdir(), 'forgeki-worker-tamper-'));
    temporary.push(output);
    const planned = await operation('plan-deployment', {
      projectDirectory: root,
      environment: 'production',
      target: 'node-server',
      options: {},
    });
    if (
      planned.type !== 'operation-result' ||
      typeof planned.payload !== 'object' ||
      planned.payload === null
    )
      throw new Error('Plan failed');
    const reviewed = { ...(planned.payload as Record<string, unknown>), planId: 'tampered' };
    const exported = await operation('export-deployment', {
      projectDirectory: root,
      destinationDirectory: output,
      environment: 'production',
      target: 'node-server',
      options: {},
      reviewedPlan: reviewed,
    });
    expect(exported.type).toBe('error');
  });
});
