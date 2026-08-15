import path from 'node:path';
import chalk from 'chalk';
import type { Command } from 'commander';
import inquirer from 'inquirer';
import {
  DEPLOYMENT_TARGETS,
  assessDeploymentReadiness,
  compatibleDeploymentTargets,
  createDeploymentPlan,
  createEnvironmentProfiles,
  exportDeploymentPlan,
  inspectDeploymentExport,
  parseDeploymentTargetId,
  parseEnvironmentProfileId,
  scanDeploymentProject,
  type DeploymentProfile,
} from '@forgecli7/deployments';
import type { CommandContext } from '../context.js';

interface DeploymentOptions {
  env: string;
  target: string;
  output?: string;
  yes?: boolean;
  replicas?: string;
  metadata?: boolean;
}

export function registerDeploymentCommands(program: Command, context: CommandContext): void {
  program
    .command('environments')
    .description('Inspect ForgeKi environment profiles')
    .command('list')
    .description('List safe built-in environment profiles')
    .action(() => {
      const profiles = createEnvironmentProfiles([]);
      context.write(
        [
          chalk.bold('ForgeKi environment profiles'),
          '',
          ...profiles.map(
            ({ id, name, description }) => `${chalk.cyan(id)}  ${name}\n  ${description}`,
          ),
          '',
          'ForgeKi stores schemas only; real secret values are never requested or stored.',
        ].join('\n'),
      );
    });

  const deployment = program
    .command('deployment')
    .description('Generate deployment configuration without deploying');
  deployment
    .command('targets [directory]')
    .description('List deployment targets, optionally filtered for a project')
    .action(async (directory?: string) => {
      try {
        const compatible = directory
          ? compatibleDeploymentTargets(
              (await scanDeploymentProject(path.resolve(context.cwd, directory))).project,
            )
          : DEPLOYMENT_TARGETS.map(({ id }) => id);
        context.write(
          [
            chalk.bold('ForgeKi deployment targets'),
            '',
            ...DEPLOYMENT_TARGETS.map(
              ({ id, name, description }) =>
                `${compatible.includes(id) ? chalk.green('compatible') : chalk.dim('unavailable')}  ${chalk.cyan(id)}  ${name}\n  ${description}`,
            ),
            '',
            'These targets generate reviewable files only. ForgeKi never deploys.',
          ].join('\n'),
        );
      } catch (error) {
        fail(context, message(error));
      }
    });

  deploymentCommand(
    deployment,
    'check',
    'Assess deployment readiness without writing files',
  ).action(async (directory: string, options: DeploymentOptions) => {
    try {
      const { project } = await scanDeploymentProject(path.resolve(context.cwd, directory));
      const environment = parseEnvironmentProfileId(options.env);
      const target = parseDeploymentTargetId(options.target, project);
      const readiness = assessDeploymentReadiness(
        project,
        environment,
        target,
        deploymentOptions(options),
      );
      context.write(formatReadiness(readiness.status, readiness.errors, readiness.warnings));
      if (readiness.status === 'blocked') context.setExitCode?.(1);
    } catch (error) {
      fail(context, message(error));
    }
  });

  deploymentCommand(deployment, 'plan', 'Preview the exact generated deployment plan').action(
    async (directory: string, options: DeploymentOptions) => {
      try {
        const plan = await planned(context, directory, options);
        context.write(formatPlan(plan));
      } catch (error) {
        fail(context, message(error));
      }
    },
  );

  deploymentCommand(deployment, 'export', 'Export reviewed deployment configuration safely')
    .requiredOption('--output <directory>', 'Output directory (project root or separate bundle)')
    .option('--yes', 'Confirm the reviewed non-overwriting export', false)
    .action(async (directory: string, options: DeploymentOptions) => {
      try {
        const plan = await planned(context, directory, options);
        const output = path.resolve(context.cwd, options.output!);
        const inspection = await inspectDeploymentExport(plan, output);
        if (inspection.collisions.length)
          throw new Error(`Export blocked. Existing files: ${inspection.collisions.join(', ')}.`);
        context.write(
          `${chalk.bold('Files to add')}\n${inspection.files.map((file) => `  ${file}`).join('\n')}`,
        );
        let confirmed = options.yes;
        if (!confirmed) {
          const answer = await inquirer.prompt<{ confirmed: boolean }>([
            {
              type: 'confirm',
              name: 'confirmed',
              message: 'Export these deployment files without overwriting?',
              default: false,
            },
          ]);
          confirmed = answer.confirmed;
        }
        if (!confirmed)
          return context.write(chalk.yellow('Deployment export cancelled; no files were written.'));
        const result = await exportDeploymentPlan(plan, output);
        context.write(
          `${chalk.green('Deployment configuration exported.')}\n${result.destination}\n${result.createdFiles.length} files\nForgeKi did not deploy anything.`,
        );
      } catch (error) {
        fail(context, message(error));
      }
    });
}

function deploymentCommand(deployment: Command, name: string, description: string): Command {
  return deployment
    .command(`${name} [directory]`)
    .description(description)
    .option('--env <profile>', 'local, staging, or production', 'production')
    .option('--target <target>', 'docker, docker-compose, kubernetes, static, or node', 'docker')
    .option('--replicas <count>', 'Kubernetes application replicas (1-20)')
    .option('--no-metadata', 'Omit forgeki.deployment.json')
    .addHelpText(
      'after',
      `\nExample:\n  forge deployment ${name} ./my-project --env production --target kubernetes`,
    );
}

async function planned(
  context: CommandContext,
  directory: string,
  options: DeploymentOptions,
): Promise<DeploymentProfile> {
  const { project } = await scanDeploymentProject(path.resolve(context.cwd, directory));
  return createDeploymentPlan(
    project,
    parseEnvironmentProfileId(options.env),
    parseDeploymentTargetId(options.target, project),
    deploymentOptions(options),
  );
}

function deploymentOptions(options: DeploymentOptions) {
  const replicas = options.replicas === undefined ? undefined : Number(options.replicas);
  return {
    ...(replicas === undefined ? {} : { replicas }),
    includeMetadata: options.metadata !== false,
  };
}

function formatReadiness(
  status: string,
  errors: readonly { code: string; message: string }[],
  warnings: readonly { code: string; message: string }[],
): string {
  const label =
    status === 'ready'
      ? chalk.green('Ready')
      : status === 'ready-with-warnings'
        ? chalk.yellow('Ready with warnings')
        : chalk.red('Blocked');
  return [
    `Deployment readiness: ${label}`,
    ...errors.map(({ code, message: detail }) => `ERROR ${code}: ${detail}`),
    ...warnings.map(({ code, message: detail }) => `WARNING ${code}: ${detail}`),
    '',
    'No network, Docker, Kubernetes, or cloud checks were performed.',
  ].join('\n');
}

function formatPlan(plan: DeploymentProfile): string {
  return [
    chalk.bold(`Deployment plan: ${plan.environment} / ${plan.target}`),
    `Readiness: ${plan.readiness.status}`,
    `Architecture fingerprint: ${plan.architectureFingerprint}`,
    '',
    chalk.bold('Environment schema'),
    ...plan.environmentVariables.map(
      ({ name, required, secret, owner }) =>
        `${name}  ${required ? 'required' : 'optional'} ${secret ? 'secret' : 'public/config'}  ${owner}`,
    ),
    '',
    chalk.bold('Exact generated files'),
    ...plan.files.flatMap(({ path: filePath, content }) => [`--- ${filePath}`, content.trimEnd()]),
    '',
    'ForgeKi generated this preview only. No deployment command exists.',
  ].join('\n');
}

function fail(context: CommandContext, detail: string): void {
  context.write(chalk.red(detail));
  context.setExitCode?.(1);
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'Deployment operation failed.';
}
