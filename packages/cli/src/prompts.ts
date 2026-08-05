import inquirer from 'inquirer';

export interface InputPromptOptions {
  message: string;
  default?: string;
  validate?(value: string): true | string;
}

export interface SelectPromptOptions<T> {
  message: string;
  choices: readonly { name: string; value: T }[];
  default?: T;
}

export interface ConfirmPromptOptions {
  message: string;
  default: boolean;
}

export interface CreatePromptAdapter {
  input(options: InputPromptOptions): Promise<string>;
  select<T>(options: SelectPromptOptions<T>): Promise<T>;
  confirm(options: ConfirmPromptOptions): Promise<boolean>;
}

export function createInquirerPromptAdapter(): CreatePromptAdapter {
  return {
    async input(options) {
      const answer = await inquirer.prompt<{ value: string }>([
        { type: 'input', name: 'value', ...options },
      ]);
      return answer.value;
    },
    async select<T>(options: SelectPromptOptions<T>) {
      const answer = await inquirer.prompt<{ value: T }>([
        { type: 'list', name: 'value', ...options, choices: [...options.choices] },
      ]);
      return answer.value;
    },
    async confirm(options) {
      const answer = await inquirer.prompt<{ value: boolean }>([
        { type: 'confirm', name: 'value', ...options },
      ]);
      return answer.value;
    },
  };
}

export function isPromptInterruption(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'ExitPromptError' ||
      error.name === 'AbortPromptError' ||
      error.name === 'CancelPromptError')
  );
}
