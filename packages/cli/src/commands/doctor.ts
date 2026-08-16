import { spawnSync } from 'node:child_process';
import process from 'node:process';
import type { Command } from 'commander';
import type { CommandContext } from '../context.js';
import { readCliPackageMetadata } from '../package-metadata.js';
import { validateNodeRuntime } from '../runtime.js';

export const DOCTOR_SCHEMA_VERSION = 1 as const;

export interface DoctorTool {
  id: 'node' | 'npm' | 'pnpm' | 'git' | 'docker';
  status: 'available' | 'not-detected';
  version?: string;
}

export interface DoctorReport {
  schemaVersion: typeof DOCTOR_SCHEMA_VERSION;
  product: 'ForgeKi CLI';
  version: string;
  channel: 'beta';
  runtime: { node: string; supported: boolean; policy: string };
  tools: DoctorTool[];
  packageManager: { preferred: 'pnpm'; status: 'available' | 'not-detected' };
  marketplace: { provider: 'unconfigured'; verification: 'required' };
  updates: { provider: 'unconfigured'; channel: 'beta'; verification: 'required' };
  warnings: string[];
}

export interface DoctorDependencies {
  nodeVersion?: string;
  version?: string;
  enginePolicy?: string;
  detect?: (command: string, args: readonly string[]) => string | undefined;
}

export function createDoctorReport(dependencies: DoctorDependencies = {}): DoctorReport {
  const metadata = readCliPackageMetadata();
  const nodeVersion = dependencies.nodeVersion ?? process.versions.node;
  const policy = dependencies.enginePolicy ?? metadata.engines.node;
  const runtime = validateNodeRuntime(nodeVersion, policy);
  const detect = dependencies.detect ?? detectVersion;
  const tools: DoctorTool[] = [
    { id: 'node', status: 'available', version: nodeVersion },
    tool('npm', detect('npm', ['--version'])),
    tool('pnpm', detect('pnpm', ['--version'])),
    tool('git', detect('git', ['--version'])),
    tool('docker', detect('docker', ['--version'])),
  ];
  const warnings = [
    ...(!runtime.supported ? [runtime.message ?? 'Unsupported Node.js runtime.'] : []),
    ...(tools.find(({ id }) => id === 'pnpm')?.status === 'not-detected'
      ? ['pnpm was not detected; generated projects may require their selected package manager.']
      : []),
    'Production Marketplace provider is unconfigured.',
    'Production application update provider is unconfigured.',
  ];
  return {
    schemaVersion: DOCTOR_SCHEMA_VERSION,
    product: 'ForgeKi CLI',
    version: dependencies.version ?? metadata.version,
    channel: 'beta',
    runtime: { node: nodeVersion, supported: runtime.supported, policy },
    tools,
    packageManager: {
      preferred: 'pnpm',
      status: tools.find(({ id }) => id === 'pnpm')?.status ?? 'not-detected',
    },
    marketplace: { provider: 'unconfigured', verification: 'required' },
    updates: { provider: 'unconfigured', channel: 'beta', verification: 'required' },
    warnings,
  };
}

export function registerDoctorCommand(
  program: Command,
  context: CommandContext,
  dependencies: DoctorDependencies = {},
): void {
  program
    .command('doctor')
    .description('Inspect ForgeKi runtime and integration readiness without exposing secrets')
    .option('--json', 'print stable machine-readable JSON')
    .action((options: { json?: boolean }) => {
      const report = createDoctorReport(dependencies);
      if (options.json) {
        context.write(JSON.stringify(report, null, 2));
        return;
      }
      context.write(`ForgeKi CLI ${report.version} (${report.channel})`);
      context.write(
        `Node.js ${report.runtime.node}: ${report.runtime.supported ? 'supported' : 'unsupported'}`,
      );
      for (const item of report.tools.filter(({ id }) => id !== 'node')) {
        context.write(`${item.id}: ${item.status}${item.version ? ` (${item.version})` : ''}`);
      }
      context.write('Marketplace: unconfigured (signature verification required)');
      context.write('Application updates: unconfigured (Beta channel, signatures required)');
      for (const warning of report.warnings) context.write(`Warning: ${warning}`);
    });
}

function tool(id: DoctorTool['id'], version: string | undefined): DoctorTool {
  return { id, status: version ? 'available' : 'not-detected', ...(version ? { version } : {}) };
}

function detectVersion(command: string, args: readonly string[]): string | undefined {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    timeout: 3_000,
    windowsHide: true,
  });
  if (result.status !== 0) return undefined;
  return (result.stdout || result.stderr).trim().split(/\r?\n/u)[0]?.slice(0, 120);
}
