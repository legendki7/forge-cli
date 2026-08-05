export interface CommandContext {
  cwd: string;
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
