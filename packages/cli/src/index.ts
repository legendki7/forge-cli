import { pathToFileURL } from 'node:url';
import { runCli } from './run.js';

export { createProgram } from './program.js';
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

const isDirectExecution = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (isDirectExecution) {
  process.exitCode = await runCli();
}
