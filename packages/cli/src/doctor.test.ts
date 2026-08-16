import { describe, expect, it } from 'vitest';
import { createDoctorReport } from './commands/doctor.js';
import { createProgram } from './program.js';
import { PluginRegistry } from '@forgecli7/plugins';

describe('forge doctor', () => {
  it('creates a stable, allowlisted report with no machine or credential data', () => {
    const report = createDoctorReport({
      version: '0.2.0-beta.0',
      nodeVersion: '22.20.0',
      enginePolicy: '^20.0.0 || ^22.0.0 || ^24.0.0',
      detect: (command) => (command === 'pnpm' ? '10.15.0' : undefined),
    });
    expect(report).toMatchObject({
      schemaVersion: 1,
      version: '0.2.0-beta.0',
      channel: 'beta',
      packageManager: { preferred: 'pnpm', status: 'available' },
      marketplace: { provider: 'unconfigured' },
      updates: { provider: 'unconfigured' },
    });
    const serialized = JSON.stringify(report);
    expect(serialized).not.toMatch(/home|username|token|credential|projectPath|environment/iu);
  });

  it('prints valid JSON through the CLI command', async () => {
    const output: string[] = [];
    const program = createProgram(
      { cwd: '.', write: (message) => output.push(message) },
      new PluginRegistry(),
      {},
      '0.2.0-beta.0',
    );
    await program.parseAsync(['node', 'forge', 'doctor', '--json']);
    expect(JSON.parse(output.join('\n'))).toMatchObject({
      schemaVersion: 1,
      product: 'ForgeKi CLI',
    });
  });
});
