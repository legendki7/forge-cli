import { Command } from 'commander';
import { describe, expect, it, vi } from 'vitest';
import { runCli } from './run.js';

const metadata = {
  name: '@forgecli7/cli',
  version: '0.1.0',
  engines: { node: '^20.0.0 || ^22.0.0 || ^24.0.0' },
};

describe('CLI error boundary', () => {
  it('rejects unsupported Node.js without constructing the program', async () => {
    const createProgram = vi.fn(() => new Command());
    const errors: string[] = [];
    const exitCode = await runCli({
      nodeVersion: '18.20.0',
      readMetadata: () => metadata,
      createProgram,
      writeError: (message) => errors.push(message),
    });
    expect(exitCode).toBe(1);
    expect(createProgram).not.toHaveBeenCalled();
    expect(errors[0]).not.toContain('at ');
  });

  it('formats missing runtime metadata without a stack trace', async () => {
    const errors: string[] = [];
    const exitCode = await runCli({
      readMetadata: () => {
        throw new Error('package.json is missing');
      },
      writeError: (message) => errors.push(message),
    });
    expect(exitCode).toBe(1);
    expect(errors).toEqual(['ForgeKi error: package.json is missing']);
  });
});
