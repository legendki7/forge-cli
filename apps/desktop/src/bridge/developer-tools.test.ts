import { describe, expect, it, vi } from 'vitest';
import {
  checkDeveloperTools,
  DEVELOPER_TOOL_ALLOWLIST,
  sanitizeVersion,
  type ToolProcessExecutor,
} from './developer-tools';

describe('developer-tool checks', () => {
  it('uses only fixed executable and argument definitions', () => {
    expect(DEVELOPER_TOOL_ALLOWLIST).toHaveLength(10);
    expect(DEVELOPER_TOOL_ALLOWLIST.map(({ id }) => id)).toEqual([
      'node',
      'npm',
      'pnpm',
      'yarn',
      'bun',
      'git',
      'docker',
      'vscode',
      'rust',
      'cargo',
    ]);
    expect(DEVELOPER_TOOL_ALLOWLIST.every(({ args }) => args.length === 1)).toBe(true);
  });

  it('maps installed, missing, timeout, and failed checks accurately', async () => {
    const executor: ToolProcessExecutor = {
      run: vi.fn(async (executable) => {
        if (executable.startsWith('node')) return { exitCode: 0, stdout: 'v24.0.0\n', stderr: '' };
        if (executable.startsWith('git'))
          return { exitCode: null, stdout: '', stderr: '', timedOut: true };
        if (executable.startsWith('docker')) return { exitCode: 1, stdout: '', stderr: 'failed' };
        return { exitCode: null, stdout: '', stderr: '', errorCode: 'ENOENT' };
      }),
    };
    const report = await checkDeveloperTools(executor);
    expect(report.tools.find(({ id }) => id === 'node')).toMatchObject({
      status: 'installed',
      version: 'v24.0.0',
    });
    expect(report.tools.find(({ id }) => id === 'git')?.status).toBe('unavailable');
    expect(report.tools.find(({ id }) => id === 'docker')?.status).toBe('check-failed');
    expect(report.tools.find(({ id }) => id === 'pnpm')?.status).toBe('not-detected');
  });

  it('sanitizes and bounds version output', () => {
    const token = `npm_${'a'.repeat(30)}`;
    expect(sanitizeVersion(`tool 1.0\nC:\\Users\\secret\\tool ${token}`)).toContain(
      '%USERPROFILE%\\tool [redacted]',
    );
    expect(sanitizeVersion('x'.repeat(500))).toHaveLength(160);
  });
});
