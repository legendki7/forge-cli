import type { PackageManager, ProjectDetectionResult } from '@forgecli7/core';

export function generateDockerfile(project: ProjectDetectionResult): string {
  const lines = [
    `FROM ${project.packageManager === 'bun' ? 'oven/bun:1-alpine' : 'node:20-alpine'}`,
    '',
    'WORKDIR /app',
    '',
    copyManifestInstruction(project),
    installInstruction(project),
    '',
    'COPY . .',
  ];

  if ('build' in project.scripts) {
    lines.push('', `RUN ${scriptCommand(project.packageManager, 'build')}`);
  }

  const start = startInstruction(project);
  if (start) lines.push('', `CMD ["sh", "-c", "${start}"]`);

  return `${lines.join('\n')}\n`;
}

function copyManifestInstruction(project: ProjectDetectionResult): string {
  const lockfile = selectedLockfile(project);
  return lockfile ? `COPY package.json ${lockfile} ./` : 'COPY package.json ./';
}

function selectedLockfile(project: ProjectDetectionResult): string | undefined {
  const candidates: Record<Exclude<PackageManager, 'unknown'>, readonly string[]> = {
    pnpm: ['pnpm-lock.yaml'],
    npm: ['package-lock.json'],
    yarn: ['yarn.lock'],
    bun: ['bun.lock', 'bun.lockb'],
  };
  if (project.packageManager === 'unknown') return undefined;
  return candidates[project.packageManager].find((file) => project.detectedFiles.includes(file));
}

function installInstruction(project: ProjectDetectionResult): string {
  const frozen = selectedLockfile(project) !== undefined;
  switch (project.packageManager) {
    case 'pnpm':
      return `RUN corepack enable && pnpm install${frozen ? ' --frozen-lockfile' : ' --no-frozen-lockfile'}`;
    case 'npm':
      return frozen ? 'RUN npm ci' : 'RUN npm install';
    case 'yarn':
      return `RUN corepack enable && yarn install${frozen ? ' --frozen-lockfile' : ''}`;
    case 'bun':
      return `RUN bun install${frozen ? ' --frozen-lockfile' : ''}`;
    case 'unknown':
      return 'RUN npm install';
  }
}

function startInstruction(project: ProjectDetectionResult): string | undefined {
  if ('start' in project.scripts) return scriptCommand(project.packageManager, 'start');
  if (project.framework === 'react-vite' && 'preview' in project.scripts) {
    return `${scriptCommand(project.packageManager, 'preview')} -- --host 0.0.0.0`;
  }
  return undefined;
}

function scriptCommand(packageManager: PackageManager, script: string): string {
  switch (packageManager) {
    case 'pnpm':
      return `pnpm run ${script}`;
    case 'npm':
      return script === 'start' ? 'npm start' : `npm run ${script}`;
    case 'yarn':
      return `yarn ${script}`;
    case 'bun':
      return `bun run ${script}`;
    case 'unknown':
      return script === 'start' ? 'npm start' : `npm run ${script}`;
  }
}

export const dockerignore = `node_modules
dist
coverage
.next
.git
.env
.env.*
*.log
`;
