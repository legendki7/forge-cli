import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { withTemporaryDirectory } from './release-audit.mjs';
import { run, validatePackedWorkspace } from './release-validation.mjs';

const expectedProjectFiles = [
  '.gitignore',
  'README.md',
  'eslint.config.mjs',
  'next-env.d.ts',
  'next.config.ts',
  'package.json',
  'public/.gitkeep',
  'src/app/globals.css',
  'src/app/layout.tsx',
  'src/app/page.tsx',
  'tsconfig.json',
];

export async function validatePackedInstallation(root, archives, dependencies = {}) {
  return withTemporaryDirectory(
    'forgecli-packed-validation-',
    async (temporaryDirectory) => {
      const installationDirectory = path.join(temporaryDirectory, 'installation');
      const workspace = path.join(temporaryDirectory, 'workspace');
      mkdirSync(installationDirectory, { recursive: true });
      mkdirSync(workspace, { recursive: true });
      validatePackedWorkspace(archives);

      const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
      const installArgs = createPackedInstallArgs(installationDirectory, archives);
      if (installArgs.includes('--global') || installArgs.includes('config')) {
        throw new Error('Packed validation must not change global npm state.');
      }
      (dependencies.run ?? run)(npm, installArgs, { cwd: temporaryDirectory });

      const executable = path.join(
        installationDirectory,
        'node_modules',
        '.bin',
        process.platform === 'win32' ? 'forge.cmd' : 'forge',
      );
      const invoke = (args, cwd = workspace) =>
        (dependencies.run ?? run)(executable, args, { cwd, capture: true });
      const cliMetadata = JSON.parse(
        readFileSync(path.join(root, 'packages/cli/package.json'), 'utf8'),
      );

      for (const flag of ['--version', '-V']) {
        if (invoke([flag]).trim() !== cliMetadata.version) {
          throw new Error(`Packed forge ${flag} did not match package metadata.`);
        }
      }
      for (const args of [
        ['--help'],
        ['create', '--help'],
        ['add', '--help'],
        ['check', '--help'],
        ['plugins', '--help'],
        ['plugin', '--help'],
        ['workspaces', '--help'],
        ['workspace', '--help'],
      ]) {
        const output = invoke(args);
        if (!output.includes('Usage:')) throw new Error(`Packed forge ${args.join(' ')} failed.`);
      }

      await validatePublicImports(installationDirectory, dependencies.run ?? run);

      for (const packageManager of ['pnpm', 'npm', 'yarn', 'bun']) {
        const projectName = `${packageManager}-app`;
        invoke(['create', projectName, '--package-manager', packageManager, '--no-git']);
        const projectDirectory = path.join(workspace, projectName);
        validateGeneratedProject(projectDirectory, projectName, packageManager);
        const report = invoke(['check'], projectDirectory);
        for (const expected of [
          'Framework: Next.js',
          'Language: TypeScript',
          `Package manager: ${packageManager}`,
        ]) {
          if (!report.includes(expected))
            throw new Error(`${projectName} detection missed ${expected}.`);
        }
      }

      const pluginProject = path.join(workspace, 'pnpm-app');
      for (const plugin of ['docker', 'github-actions']) {
        invoke(['add', plugin], pluginProject);
        const managed =
          plugin === 'docker' ? ['Dockerfile', '.dockerignore'] : ['.github/workflows/ci.yml'];
        const before = Object.fromEntries(
          managed.map((file) => [file, readFileSync(path.join(pluginProject, file), 'utf8')]),
        );
        invoke(['add', plugin], pluginProject);
        for (const file of managed) {
          if (readFileSync(path.join(pluginProject, file), 'utf8') !== before[file]) {
            throw new Error(`${plugin} changed ${file} during repeated application.`);
          }
        }
      }

      invoke(['workspace', 'create', 'packed-platform', '--preset', 'saas-foundation', '--no-git']);
      const workspaceDirectory = path.join(workspace, 'packed-platform');
      for (const required of [
        'forgeki.workspace.json',
        'docker-compose.yml',
        'apps/web/package.json',
        'apps/api/package.json',
        'packages/shared/package.json',
      ]) {
        if (!existsSync(path.join(workspaceDirectory, required)))
          throw new Error(`Packed workspace generation missed ${required}.`);
      }
      if (!invoke(['workspace', 'check', workspaceDirectory]).includes('Services: 5'))
        throw new Error('Packed workspace check failed.');
      if (
        !invoke([
          'workspace',
          'validate',
          path.join(workspaceDirectory, 'forgeki.workspace.json'),
        ]).includes('configuration is valid')
      )
        throw new Error('Packed workspace validation failed.');
      if (existsSync(path.join(workspaceDirectory, 'node_modules')))
        throw new Error('Packed workspace unexpectedly installed dependencies.');

      return { cliVersion: cliMetadata.version, projects: 4, workspaces: 1, plugins: 2 };
    },
    dependencies.temporaryDirectory,
  );
}

export function createPackedInstallArgs(installationDirectory, archives) {
  return [
    'install',
    '--prefix',
    installationDirectory,
    '--no-audit',
    '--no-fund',
    '--ignore-scripts',
    '--prefer-offline',
    ...archives,
  ];
}

async function validatePublicImports(installationDirectory, runner) {
  const consumer = path.join(installationDirectory, 'public-api-consumer.mjs');
  writeFileSync(
    consumer,
    [
      "import { validateProjectName } from '@forgecli7/core';",
      "import { validatePluginManifest } from '@forgecli7/plugin-sdk';",
      "import { renderNextjsTemplate } from '@forgecli7/templates';",
      "import { getWorkspacePreset, validateWorkspace } from '@forgecli7/workspaces';",
      "import { dockerPlugin } from '@forgecli7/plugin-docker';",
      "import { githubActionsPlugin } from '@forgecli7/plugin-github-actions';",
      "if (!validateProjectName('consumer-app').valid) throw new Error('core export failed');",
      "if (validatePluginManifest({}).valid) throw new Error('plugin SDK export failed');",
      "if (renderNextjsTemplate('consumer-app', 'pnpm').length === 0) throw new Error('templates export failed');",
      "if (!validateWorkspace(getWorkspacePreset('saas-foundation').definition).valid) throw new Error('workspaces export failed');",
      "if (dockerPlugin.id !== 'docker') throw new Error('Docker export failed');",
      "if (githubActionsPlugin.id !== 'github-actions') throw new Error('GitHub Actions export failed');",
    ].join('\n'),
    'utf8',
  );
  runner(process.execPath, [consumer], { cwd: installationDirectory, capture: true });
}

function validateGeneratedProject(directory, projectName, packageManager) {
  const files = listFiles(directory);
  if (JSON.stringify(files) !== JSON.stringify([...expectedProjectFiles].sort())) {
    throw new Error(`${projectName} generated an unexpected file set: ${files.join(', ')}.`);
  }
  if (files.some((file) => /(?:^|\/)(?:node_modules|[^/]*lock[^/]*)/u.test(file))) {
    throw new Error(`${projectName} unexpectedly contains dependencies or a lockfile.`);
  }
  const metadata = JSON.parse(readFileSync(path.join(directory, 'package.json'), 'utf8'));
  if (!metadata.packageManager.startsWith(`${packageManager}@`)) {
    throw new Error(`${projectName} does not declare ${packageManager}.`);
  }
  const forbiddenContent = [
    new RegExp(`C:${'\\\\'}Users${'\\\\'}`, 'u'),
    /\/Users\//u,
    /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/u,
  ];
  for (const file of files) {
    const content = readFileSync(path.join(directory, file), 'utf8');
    if (forbiddenContent.some((pattern) => pattern.test(content))) {
      throw new Error(`${projectName}/${file} contains machine-specific or nondeterministic data.`);
    }
  }
  if (existsSync(path.join(directory, 'node_modules'))) {
    throw new Error(`${projectName} unexpectedly contains node_modules.`);
  }
}

function listFiles(root) {
  const files = [];
  const pending = [root];
  while (pending.length > 0) {
    const directory = pending.pop();
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) pending.push(target);
      else if (entry.isFile()) files.push(path.relative(root, target).replaceAll('\\', '/'));
    }
  }
  return files.sort();
}
