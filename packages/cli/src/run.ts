import type { Command } from 'commander';
import { CommanderError } from 'commander';
import { readCliPackageMetadata, type CliPackageMetadata } from './package-metadata.js';
import { createProgram } from './program.js';
import { validateNodeRuntime } from './runtime.js';

export interface CliRunnerDependencies {
  argv?: readonly string[];
  nodeVersion?: string;
  readMetadata?: () => CliPackageMetadata;
  createProgram?: (version: string) => Command;
  writeError?: (message: string) => void;
}

export async function runCli(dependencies: CliRunnerDependencies = {}): Promise<number> {
  const writeError = dependencies.writeError ?? ((message: string) => console.error(message));
  let actionExitCode = 0;
  try {
    const metadata = (dependencies.readMetadata ?? readCliPackageMetadata)();
    const runtime = validateNodeRuntime(
      dependencies.nodeVersion ?? process.versions.node,
      metadata.engines.node,
    );
    if (!runtime.supported) {
      writeError(runtime.message ?? 'ForgeCLI requires a supported Node.js version.');
      return 1;
    }

    const program = (
      dependencies.createProgram ??
      ((version) =>
        createProgram(
          {
            cwd: process.cwd(),
            write: (message) => console.log(message),
            setExitCode: (code) => {
              actionExitCode = code;
            },
          },
          undefined,
          {},
          version,
        ))
    )(metadata.version);
    program.exitOverride();
    await program.parseAsync([...(dependencies.argv ?? process.argv)]);
    return actionExitCode;
  } catch (error) {
    if (error instanceof CommanderError) return error.exitCode;
    writeError(`ForgeCLI error: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}
