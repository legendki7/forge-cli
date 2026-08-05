import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { detectProject } from '@forgecli7/core';
import {
  handleWorkerEnvelope,
  scanProjectDirectory,
  validateRequest,
  type WorkerMessage,
} from './service';

const temporaryDirectories: string[] = [];

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
    expect(() => validateRequest({ ...request('C:\\projects'), executable: 'powershell' })).toThrow(
      'Invalid desktop bridge payload',
    );
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
          projectDirectory: 'C:\\projects',
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
        ...request('C:\\projects'),
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
});
