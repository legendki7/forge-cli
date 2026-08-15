import { describe, expect, it } from 'vitest';
import {
  BUILTIN_WORKSPACE_PRESETS,
  createWorkspaceConnection,
  createWorkspaceService,
  parseWorkspaceDefinition,
  planWorkspacePorts,
  validateWorkspace,
} from './model.js';

describe('workspace model', () => {
  it('validates every built-in preset with deterministic non-conflicting ports', () => {
    for (const preset of BUILTIN_WORKSPACE_PRESETS) {
      const result = validateWorkspace(preset.definition);
      expect(result.errors, preset.id).toEqual([]);
      expect(new Set(result.ports.map(({ port }) => port)).size).toBe(result.ports.length);
      expect(planWorkspacePorts([...preset.definition.services].reverse())).toEqual(result.ports);
    }
  });

  it('rejects secret browser environment variables', () => {
    const web = createWorkspaceService('react-vite', 'web', {
      environmentVariables: [
        {
          name: 'VITE_API_SECRET',
          description: 'bad',
          required: true,
          secret: true,
          browserVisible: true,
        },
      ],
    });
    const result = validateWorkspace({
      schemaVersion: 1,
      id: 'demo',
      name: 'demo',
      packageManager: 'pnpm',
      services: [web],
      connections: [],
      tooling: { initializeGit: false, docker: false, githubActions: false },
    });
    expect(result.errors.map(({ code }) => code)).toContain('BROWSER_SECRET_EXPOSURE');
  });

  it('rejects invalid and unsupported connections', () => {
    const web = createWorkspaceService('react-vite', 'web');
    const redis = createWorkspaceService('redis', 'cache');
    const definition = {
      schemaVersion: 1 as const,
      id: 'demo',
      name: 'demo',
      packageManager: 'pnpm' as const,
      services: [web, redis],
      connections: [createWorkspaceConnection(web.id, redis.id, 'CACHE')],
      tooling: { initializeGit: false, docker: false, githubActions: false },
    };
    expect(validateWorkspace(definition).errors.map(({ code }) => code)).toContain(
      'INVALID_CONNECTION',
    );
  });

  it('uses a strict closed configuration schema', () => {
    expect(() =>
      parseWorkspaceDefinition({
        schemaVersion: 1,
        id: 'demo',
        name: 'demo',
        packageManager: 'pnpm',
        services: [],
        connections: [],
        tooling: { initializeGit: false, docker: false, githubActions: false },
        command: 'whoami',
      }),
    ).toThrow(/Unsupported workspace field/u);
  });

  it.each(['../escape', 'C:/escape', 'con', 'name\\escape', ''])(
    'rejects unsafe service identity %j',
    (name) => {
      expect(() => createWorkspaceService('express', name)).toThrow(/Invalid workspace service/u);
    },
  );

  it('rejects forged implementations, Docker commands, packages, and plugin contributions', () => {
    const base = structuredClone(BUILTIN_WORKSPACE_PRESETS[0]!.definition) as unknown as Record<
      string,
      unknown
    >;
    for (const [key, value] of [
      ['image', 'evil/latest'],
      ['command', 'run evil'],
      ['packages', ['evil']],
      ['contributions', { infrastructure: 'redis' }],
    ] as const) {
      expect(() => parseWorkspaceDefinition({ ...base, [key]: value })).toThrow(
        /Unsupported workspace field/u,
      );
    }
    const forged = structuredClone(BUILTIN_WORKSPACE_PRESETS[0]!.definition) as unknown as {
      services: Array<Record<string, unknown>>;
    };
    forged.services[0]!.implementation = 'remote-framework';
    expect(() => parseWorkspaceDefinition(forged)).toThrow();
  });

  it('rejects oversized workspace input before parsing fields', () => {
    expect(() => parseWorkspaceDefinition({ padding: 'x'.repeat(300_000) })).toThrow(/too large/u);
  });
});
