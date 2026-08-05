import { spawn } from 'node:child_process';
import process from 'node:process';
import type { DeveloperToolId, DeveloperToolResult, DeveloperToolsReport } from '../types';

const OUTPUT_LIMIT = 512;
const COMMAND_TIMEOUT_MS = 3_000;

interface ToolDefinition {
  id: DeveloperToolId;
  name: string;
  executable: string;
  args: readonly string[];
  required: boolean;
  purpose: string;
}

const windowsCommand = (name: string) => (process.platform === 'win32' ? `${name}.cmd` : name);

export const DEVELOPER_TOOL_ALLOWLIST: readonly ToolDefinition[] = [
  {
    id: 'node',
    name: 'Node.js',
    executable: 'node',
    args: ['--version'],
    required: true,
    purpose: 'Runs JavaScript development tooling.',
  },
  {
    id: 'npm',
    name: 'npm',
    executable: windowsCommand('npm'),
    args: ['--version'],
    required: false,
    purpose: 'Installs and runs npm packages.',
  },
  {
    id: 'pnpm',
    name: 'pnpm',
    executable: windowsCommand('pnpm'),
    args: ['--version'],
    required: false,
    purpose: 'Recommended package manager for ForgeKi projects.',
  },
  {
    id: 'yarn',
    name: 'Yarn',
    executable: windowsCommand('yarn'),
    args: ['--version'],
    required: false,
    purpose: 'Alternative JavaScript package manager.',
  },
  {
    id: 'bun',
    name: 'Bun',
    executable: 'bun',
    args: ['--version'],
    required: false,
    purpose: 'Alternative JavaScript runtime and package manager.',
  },
  {
    id: 'git',
    name: 'Git',
    executable: 'git',
    args: ['--version'],
    required: false,
    purpose: 'Initializes and manages source-control repositories.',
  },
  {
    id: 'docker',
    name: 'Docker',
    executable: 'docker',
    args: ['--version'],
    required: false,
    purpose: 'Builds and runs container images.',
  },
  {
    id: 'vscode',
    name: 'VS Code',
    executable: windowsCommand('code'),
    args: ['--version'],
    required: false,
    purpose: 'Edits project source files.',
  },
  {
    id: 'rust',
    name: 'Rust',
    executable: 'rustc',
    args: ['--version'],
    required: false,
    purpose: 'Builds Rust applications and Tauri native code.',
  },
  {
    id: 'cargo',
    name: 'Cargo',
    executable: 'cargo',
    args: ['--version'],
    required: false,
    purpose: 'Builds and manages Rust packages.',
  },
] as const;

export interface ToolProcessResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  errorCode?: string;
  timedOut?: boolean;
}

export interface ToolProcessExecutor {
  run(executable: string, args: readonly string[]): Promise<ToolProcessResult>;
}

export const defaultToolProcessExecutor: ToolProcessExecutor = {
  run(executable, args) {
    return new Promise((resolve) => {
      const start = () =>
        spawn(executable, [...args], {
          shell: false,
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      let child: ReturnType<typeof start>;
      try {
        child = start();
      } catch (error) {
        const code = error instanceof Error && 'code' in error ? String(error.code) : 'SPAWN_ERROR';
        resolve({ exitCode: null, stdout: '', stderr: '', errorCode: code });
        return;
      }
      let stdout = '';
      let stderr = '';
      let settled = false;
      const finish = (result: ToolProcessResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(result);
      };
      const append = (current: string, chunk: Buffer) =>
        `${current}${chunk.toString('utf8')}`.slice(0, OUTPUT_LIMIT);
      child.stdout.on('data', (chunk: Buffer) => (stdout = append(stdout, chunk)));
      child.stderr.on('data', (chunk: Buffer) => (stderr = append(stderr, chunk)));
      child.once('error', (error: NodeJS.ErrnoException) =>
        finish({ exitCode: null, stdout, stderr, errorCode: error.code }),
      );
      child.once('close', (exitCode) => finish({ exitCode, stdout, stderr }));
      const timer = setTimeout(() => {
        child.kill();
        finish({ exitCode: null, stdout, stderr, timedOut: true });
      }, COMMAND_TIMEOUT_MS);
    });
  },
};

export async function checkDeveloperTools(
  executor: ToolProcessExecutor = defaultToolProcessExecutor,
): Promise<DeveloperToolsReport> {
  const tools = await Promise.all(
    DEVELOPER_TOOL_ALLOWLIST.map(async (definition): Promise<DeveloperToolResult> => {
      const result = await executor.run(definition.executable, definition.args);
      const base = {
        id: definition.id,
        name: definition.name,
        required: definition.required,
        purpose: definition.purpose,
      };
      if (result.errorCode === 'ENOENT') return { ...base, status: 'not-detected' };
      if (result.timedOut) return { ...base, status: 'unavailable' };
      if (result.exitCode !== 0) return { ...base, status: 'check-failed' };
      const version = sanitizeVersion(result.stdout || result.stderr);
      return { ...base, status: 'installed', ...(version ? { version } : {}) };
    }),
  );
  const node = tools.find(({ id }) => id === 'node');
  const git = tools.find(({ id }) => id === 'git');
  return {
    tools,
    checkedAt: new Date().toISOString(),
    summary: [
      node?.status === 'installed'
        ? 'Ready to create Next.js projects.'
        : 'Node.js availability could not be confirmed; generated projects remain available for later setup.',
      git?.status === 'installed'
        ? 'Git is available for optional repository initialization.'
        : 'Git is unavailable or unknown; Git initialization may be skipped.',
      'Docker is not required for project generation.',
    ],
  };
}

export function sanitizeVersion(value: string): string {
  return [...value]
    .filter((character) => character.charCodeAt(0) > 31)
    .join('')
    .replace(/[\r\n]+/gu, ' ')
    .replace(/[A-Z]:\\Users\\[^\\\s]+/giu, '%USERPROFILE%')
    .replace(/\/Users\/[^/\s]+/gu, '~')
    .replace(/(?:npm|ghp)_[A-Za-z0-9_-]+/gu, '[redacted]')
    .trim()
    .slice(0, 160);
}
