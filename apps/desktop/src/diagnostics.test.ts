import { describe, expect, it } from 'vitest';
import { createDefaultDesktopState } from './persistence';
import {
  containsForbiddenDiagnosticData,
  createSafeDiagnostics,
  diagnosticsJson,
} from './diagnostics';

describe('safe Desktop diagnostics', () => {
  it('exports only allowlisted machine state and removes project identity and paths', () => {
    const state = createDefaultDesktopState();
    state.recentProjects.push({
      name: 'secret-customer',
      path: 'C:\\Users\\alice\\secret-customer',
      framework: 'nextjs',
      packageManager: 'pnpm',
      lastActivityAt: '2026-08-16T00:00:00.000Z',
      activityType: 'created',
    });
    state.activity.push({
      id: '1',
      type: 'creation-failed',
      projectName: 'secret-customer',
      projectPath: 'C:\\Users\\alice\\secret-customer',
      timestamp: '2026-08-16T00:00:00.000Z',
      result: 'failed',
      message: 'token=do-not-export at C:\\Users\\alice',
    });
    const json = diagnosticsJson(
      createSafeDiagnostics({
        version: '0.2.0-beta.0',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        state,
        plugins: [],
      }),
    );
    expect(JSON.parse(json)).toMatchObject({
      schemaVersion: 1,
      platform: { os: 'Windows', architecture: 'unknown' },
      recentErrors: [{ type: 'creation-failed', result: 'failed' }],
    });
    expect(json).not.toContain('secret-customer');
    expect(containsForbiddenDiagnosticData(json)).toBe(false);
  });
});
