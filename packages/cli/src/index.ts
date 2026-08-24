import { isDirectExecution } from './direct-execution.js';
import { runCli } from './run.js';

export { createProgram } from './program.js';
export { isDirectExecution } from './direct-execution.js';
export { readCliPackageMetadata } from './package-metadata.js';
export { runCli } from './run.js';
export { validateNodeRuntime } from './runtime.js';
export type { CommandContext } from './context.js';
export type { CreateCommandDependencies } from './commands/create.js';
export type {
  ConfirmPromptOptions,
  CreatePromptAdapter,
  InputPromptOptions,
  SelectPromptOptions,
} from './prompts.js';

if (isDirectExecution(import.meta.url)) {
  process.exitCode = await runCli();
}
