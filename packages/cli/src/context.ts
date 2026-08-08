export interface CommandContext {
  cwd: string;
  /** Override used by tests and embedders; defaults to ForgeKi application data. */
  pluginStorageRoot?: string;
  write(message: string): void;
  setExitCode?(code: number): void;
}

export function createDefaultContext(): CommandContext {
  return {
    cwd: process.cwd(),
    write: (message) => console.log(message),
    setExitCode: (code) => {
      process.exitCode = code;
    },
  };
}
