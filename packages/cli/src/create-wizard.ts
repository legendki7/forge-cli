import {
  SUPPORTED_PACKAGE_MANAGER_VERSIONS,
  validateProjectName,
  type SupportedPackageManager,
} from '@forgecli7/core';
import type { CreatePromptAdapter } from './prompts.js';

export interface CreateWizardInput {
  projectName?: string;
  packageManager?: SupportedPackageManager;
  initializeGit?: boolean;
  addDocker?: boolean;
  addGitHubActions?: boolean;
}

export interface ResolvedCreateConfiguration {
  projectName: string;
  framework: 'nextjs';
  packageManager: SupportedPackageManager;
  initializeGit: boolean;
  addDocker: boolean;
  addGitHubActions: boolean;
}

export interface CreateWizardResult {
  confirmed: boolean;
  configuration: ResolvedCreateConfiguration;
}

const packageManagerLabels: Record<SupportedPackageManager, string> = {
  pnpm: 'pnpm',
  npm: 'npm',
  yarn: 'Yarn',
  bun: 'Bun',
};

export async function runCreateWizard(
  input: CreateWizardInput,
  prompts: CreatePromptAdapter,
  writeSummary: (summary: string) => void,
): Promise<CreateWizardResult> {
  const projectName = input.projectName ?? (await promptForProjectName(prompts));
  const validation = validateProjectName(projectName);
  if (!validation.valid) throw new Error(validation.message ?? 'Invalid project name.');

  const packageManager =
    input.packageManager ??
    (await prompts.select<SupportedPackageManager>({
      message: 'Package manager:',
      choices: Object.keys(SUPPORTED_PACKAGE_MANAGER_VERSIONS).map((value) => {
        const packageManager = value as SupportedPackageManager;
        return { name: packageManagerLabels[packageManager], value: packageManager };
      }),
      default: 'pnpm',
    }));
  const initializeGit =
    input.initializeGit ??
    (await prompts.confirm({ message: 'Initialize a Git repository?', default: true }));
  const addDocker =
    input.addDocker ??
    (await prompts.confirm({ message: 'Add Docker configuration?', default: false }));
  const addGitHubActions =
    input.addGitHubActions ??
    (await prompts.confirm({ message: 'Add GitHub Actions CI?', default: false }));
  const configuration: ResolvedCreateConfiguration = {
    projectName,
    framework: 'nextjs',
    packageManager,
    initializeGit,
    addDocker,
    addGitHubActions,
  };

  writeSummary(formatCreateSummary(configuration));
  const confirmed = await prompts.confirm({ message: 'Create this project?', default: true });
  return { confirmed, configuration };
}

export function formatCreateSummary(configuration: ResolvedCreateConfiguration): string {
  const yesNo = (value: boolean) => (value ? 'Yes' : 'No');
  return [
    'Project configuration',
    '',
    `Name: ${configuration.projectName}`,
    'Framework: Next.js',
    `Package manager: ${packageManagerLabels[configuration.packageManager]}`,
    `Git: ${yesNo(configuration.initializeGit)}`,
    `Docker: ${yesNo(configuration.addDocker)}`,
    `GitHub Actions: ${yesNo(configuration.addGitHubActions)}`,
  ].join('\n');
}

async function promptForProjectName(prompts: CreatePromptAdapter): Promise<string> {
  const value = await prompts.input({
    message: 'Project name:',
    validate(input) {
      const validation = validateProjectName(input.trim());
      return validation.valid ? true : (validation.message ?? 'Invalid project name.');
    },
  });
  return value.trim();
}
