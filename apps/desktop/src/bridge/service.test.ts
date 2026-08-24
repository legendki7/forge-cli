import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { detectProject } from '@forgecli7/core';
import { getWorkspacePreset, type WorkspaceGenerationPlan } from '@forgecli7/workspaces';
import {
  handleWorkerEnvelope,
  scanProjectDirectory,
  validateRequest,
  type WorkerMessage,
} from './service';

const temporaryDirectories: string[] = [];
const absoluteTestDirectory = path.join(tmpdir(), 'forgeki-projects');

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

function request(destinationDirectory: string) {
  return {
    projectName: 'desktop-app',
    destinationDirectory,
    framework: 'nextjs',
    packageManager: 'pnpm',
    initializeGit: false,
    addDocker: true,
    addGitHubActions: true,
  } as const;
}

describe('desktop worker security boundary', () => {
  it('rejects invalid IPC payloads and arbitrary command fields', () => {
    expect(() =>
      validateRequest({ ...request(absoluteTestDirectory), executable: 'powershell' }),
    ).toThrow('Invalid desktop bridge payload');
    expect(() =>
      validateRequest({ ...request('relative'), shellArguments: ['rm', '-rf'] }),
    ).toThrow();
  });

  it('rejects unselected relative destinations', () => {
    expect(() => validateRequest(request('../escape'))).toThrow('selected absolute destination');
  });

  it('uses the shared engine and plugins in deterministic progress order', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'forgeki-desktop-'));
    temporaryDirectories.push(root);
    const messages: WorkerMessage[] = [];
    await handleWorkerEnvelope({ operationId: 'test-1', request: request(root) }, (message) =>
      messages.push(message),
    );
    const project = path.join(root, 'desktop-app');
    const detection = await detectProject(project);
    expect(detection.framework).toBe('nextjs');
    expect(
      messages
        .filter((message) => message.type === 'progress')
        .map((message) => message.payload.step),
    ).toEqual([
      'validate',
      'validate',
      'prepare',
      'scaffold',
      'prepare',
      'scaffold',
      'git',
      'docker',
      'docker',
      'github-actions',
      'github-actions',
      'finish',
      'finish',
    ]);
    const final = messages.at(-1);
    expect(final?.type).toBe('result');
    if (final?.type === 'result') {
      expect(final.payload.initializedFeatures).toEqual(['Docker', 'GitHub Actions']);
      expect(final.payload.projectDirectory).toBe(project);
    }
  });

  it('reports an existing non-empty destination as a safe error', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'forgeki-desktop-'));
    temporaryDirectories.push(root);
    const first: WorkerMessage[] = [];
    await handleWorkerEnvelope(
      {
        operationId: 'first',
        request: { ...request(root), addDocker: false, addGitHubActions: false },
      },
      (message) => first.push(message),
    );
    const second: WorkerMessage[] = [];
    await handleWorkerEnvelope(
      {
        operationId: 'second',
        request: { ...request(root), addDocker: false, addGitHubActions: false },
      },
      (message) => second.push(message),
    );
    expect(second.at(-1)).toMatchObject({
      type: 'error',
      payload: { code: 'DESTINATION_NOT_EMPTY' },
    });
  });

  it('generates rule-based scanner recommendations from shared detection state', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'forgeki-desktop-scan-'));
    temporaryDirectories.push(root);
    await handleWorkerEnvelope(
      {
        operationId: 'create-scan',
        request: { ...request(root), addDocker: false, addGitHubActions: false },
      },
      () => undefined,
    );
    const project = path.join(root, 'desktop-app');
    const scan = await scanProjectDirectory(project);
    expect(scan.framework).toBe('nextjs');
    expect(scan.language).toBe('typescript');
    expect(scan.recommendations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'docker-missing', pluginId: 'docker' }),
        expect.objectContaining({ id: 'github-actions-missing', pluginId: 'github-actions' }),
        expect.objectContaining({ id: 'typescript-present' }),
      ]),
    );
  });

  it('rejects arbitrary plugin ids and executable fields in operation payloads', async () => {
    const messages: WorkerMessage[] = [];
    await handleWorkerEnvelope(
      {
        operationId: 'unsafe-plugin',
        operation: 'apply-plugin',
        request: {
          projectDirectory: absoluteTestDirectory,
          pluginId: 'remote-package',
          executable: 'cmd',
        },
      },
      (message) => messages.push(message),
    );
    expect(messages.at(-1)).toMatchObject({
      type: 'error',
      payload: { code: 'UNEXPECTED_ERROR' },
    });
  });

  it('plans and creates only backend-validated built-in stacks', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'forgeki-stack-worker-'));
    temporaryDirectories.push(root);
    const stack = {
      framework: 'express',
      components: ['typescript', 'sqlite', 'drizzle', 'vitest'],
      packageManager: 'pnpm',
      initializeGit: false,
      addDocker: false,
      addGitHubActions: false,
    } as const;
    const planned: WorkerMessage[] = [];
    await handleWorkerEnvelope(
      {
        operationId: 'plan-stack',
        operation: 'plan-stack',
        request: {
          projectName: 'api',
          destinationDirectory: root,
          stack,
        },
      },
      (message) => planned.push(message),
    );
    expect(planned.at(-1)).toMatchObject({
      type: 'operation-result',
      payload: { framework: 'express' },
    });
    const plan =
      planned.at(-1)?.type === 'operation-result'
        ? (planned.at(-1)!.payload as { files: Array<{ path: string }> })
        : undefined;
    expect(plan?.files.map(({ path: filePath }) => filePath)).toContain('drizzle.config.ts');
  });

  it('rejects unknown component IDs and forged generation plans', () => {
    expect(() =>
      validateRequest({
        ...request(absoluteTestDirectory),
        stack: {
          framework: 'nextjs',
          components: ['remote-package'],
          packageManager: 'pnpm',
          initializeGit: false,
          addDocker: false,
          addGitHubActions: false,
        },
      }),
    ).toThrow('Invalid desktop bridge payload');
  });

  it('rejects a syntactically valid plugin component that is not installed', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'forgeki-plugin-boundary-'));
    temporaryDirectories.push(root);
    const messages: WorkerMessage[] = [];
    await handleWorkerEnvelope(
      {
        operationId: 'missing-community-plugin',
        operation: 'plan-stack',
        request: {
          projectName: 'safe-app',
          destinationDirectory: root,
          stack: {
            framework: 'nextjs',
            components: ['typescript', 'plain-css'],
            pluginComponents: ['plausible-but-not-installed'],
            packageManager: 'pnpm',
            initializeGit: false,
            addDocker: false,
            addGitHubActions: false,
          },
        },
      },
      (message) => messages.push(message),
    );
    expect(messages.at(-1)).toMatchObject({
      type: 'error',
      payload: { code: 'UNEXPECTED_ERROR' },
    });
    expect(messages.at(-1)?.payload).toMatchObject({
      details: expect.stringMatching(
        /(?:not provided by an installed, valid plugin|Unknown or disabled plugin components)/u,
      ),
    });
  });

  it('keeps production Marketplace and update providers honestly unconfigured', async () => {
    const marketplace: WorkerMessage[] = [];
    await handleWorkerEnvelope(
      { operationId: 'marketplace-status', operation: 'marketplace-status', request: {} },
      (message) => marketplace.push(message),
    );
    expect(marketplace.at(-1)).toMatchObject({
      type: 'operation-result',
      payload: { configured: false, connectivity: 'unconfigured' },
    });
    const updates: WorkerMessage[] = [];
    await handleWorkerEnvelope(
      {
        operationId: 'update-check',
        operation: 'application-update-check',
        request: { channel: 'beta', currentVersion: '0.1.0' },
      },
      (message) => updates.push(message),
    );
    expect(updates.at(-1)).toMatchObject({
      type: 'operation-result',
      payload: { state: 'unconfigured', signatureStatus: 'unavailable' },
    });
  });

  it('recomputes reviewed workspace plans, blocks forgery, creates, and scans read-only', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'forgeki-workspace-worker-'));
    temporaryDirectories.push(root);
    const definition = {
      ...getWorkspacePreset('saas-foundation')!.definition,
      id: 'worker-platform',
      name: 'worker-platform',
      tooling: { initializeGit: false, docker: true, githubActions: true },
    };
    const planned: WorkerMessage[] = [];
    await handleWorkerEnvelope(
      {
        operationId: 'plan-workspace',
        operation: 'plan-workspace',
        request: { definition, destinationDirectory: root },
      },
      (message) => planned.push(message),
    );
    const plan =
      planned.at(-1)?.type === 'operation-result'
        ? (planned.at(-1)!.payload as WorkspaceGenerationPlan)
        : undefined;
    expect(plan?.files.map(({ path: filePath }) => filePath)).toContain('docker-compose.yml');

    const forged = structuredClone(plan!);
    forged.files.push({ path: 'evil.js', content: 'process.exit()', owner: 'workspace' });
    const blocked: WorkerMessage[] = [];
    await handleWorkerEnvelope(
      {
        operationId: 'forged-workspace',
        operation: 'create-workspace',
        request: { definition, destinationDirectory: root, reviewedPlan: forged },
      },
      (message) => blocked.push(message),
    );
    expect(blocked.at(-1)?.type).toBe('error');

    const created: WorkerMessage[] = [];
    await handleWorkerEnvelope(
      {
        operationId: 'create-workspace',
        operation: 'create-workspace',
        request: { definition, destinationDirectory: root, reviewedPlan: plan },
      },
      (message) => created.push(message),
    );
    expect(created.at(-1)).toMatchObject({
      type: 'operation-result',
      payload: { serviceCount: 5 },
    });
    const scanned: WorkerMessage[] = [];
    await handleWorkerEnvelope(
      {
        operationId: 'scan-workspace',
        operation: 'scan-workspace',
        request: { projectDirectory: path.join(root, 'worker-platform') },
      },
      (message) => scanned.push(message),
    );
    expect(scanned.at(-1)).toMatchObject({
      type: 'operation-result',
      payload: { source: 'forgeki-config', definition: { name: 'worker-platform' } },
    });
  });
});
