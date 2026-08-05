import { createRequire } from 'node:module';

export interface CliPackageMetadata {
  name: string;
  version: string;
  engines: {
    node: string;
  };
}

export function readCliPackageMetadata(moduleUrl: string = import.meta.url): CliPackageMetadata {
  const require = createRequire(moduleUrl);
  const metadata: unknown = require('../package.json');
  if (!isCliPackageMetadata(metadata)) {
    throw new Error('The installed ForgeCLI package metadata is missing or invalid.');
  }
  return metadata;
}

function isCliPackageMetadata(value: unknown): value is CliPackageMetadata {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.name !== 'string' || typeof candidate.version !== 'string') return false;
  if (typeof candidate.engines !== 'object' || candidate.engines === null) return false;
  return typeof (candidate.engines as Record<string, unknown>).node === 'string';
}
