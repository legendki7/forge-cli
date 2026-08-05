import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import console from 'node:console';
import process from 'node:process';
import {
  auditExportMaps,
  auditGeneratedArtifacts,
  auditPackageMetadata,
  auditPotentialSecrets,
  inspectChangesets,
  planPrerelease,
  scanRepositoryMarkers,
  withTemporaryDirectory,
} from './release-audit.mjs';
import { validatePackedInstallation } from './packed-validation.mjs';
import { writeReleaseCandidateReport } from './release-report.mjs';
import { packWorkspace, validatePackedWorkspace, run } from './release-validation.mjs';

export const verificationCommands = [['format:check'], ['lint'], ['test'], ['build']];

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function verifyReleaseCandidate(repositoryRoot = root) {
  const audit = {
    date: new Date().toISOString().slice(0, 10),
    identityBlockers: [],
    technicalErrors: [],
    versions: {},
    changesets: [],
  };
  let failure;

  try {
    step('Identity and source audit');
    const markers = scanRepositoryMarkers(repositoryRoot);
    audit.identityBlockers = [
      ...new Set(
        markers
          .filter((occurrence) => occurrence.classification === 'must be replaced before release')
          .map((occurrence) => occurrence.file),
      ),
    ].sort();
    for (const occurrence of markers) {
      console.log(
        `  ${occurrence.classification}: ${occurrence.file}:${occurrence.line} (${occurrence.label})`,
      );
    }
    const artifacts = auditGeneratedArtifacts(repositoryRoot);
    if (artifacts.length > 0)
      throw new Error(`Suspicious generated artifacts: ${artifacts.join(', ')}`);
    const secrets = auditPotentialSecrets(repositoryRoot);
    if (secrets.length > 0)
      throw new Error(`Potential credential material found in: ${secrets.join(', ')}`);

    step('Formatting, lint, tests, and builds');
    for (const [script] of verificationCommands) runPnpm(repositoryRoot, script);

    step('Package metadata, scope, documentation, and exports');
    const metadata = auditPackageMetadata(repositoryRoot);
    if (metadata.errors.length > 0) throw new Error(metadata.errors.join('\n'));
    const exportErrors = auditExportMaps(repositoryRoot);
    if (exportErrors.length > 0) throw new Error(exportErrors.join('\n'));
    validateDocumentationIdentity(repositoryRoot);
    validateWorkflowSecurity(repositoryRoot);

    step('Changesets prerelease plan');
    audit.changesets = inspectChangesets(repositoryRoot);
    audit.versions = await planPrerelease(repositoryRoot);
    for (const [name, version] of Object.entries(audit.versions).sort()) {
      console.log(`  ${name} -> ${version}`);
    }

    step('Tarballs, public imports, CLI, projects, and plugins');
    await withTemporaryDirectory('forgecli-release-verify-', async (temporaryDirectory) => {
      mkdirSync(temporaryDirectory, { recursive: true });
      const archives = packWorkspace(repositoryRoot, temporaryDirectory, { build: false });
      validatePackedWorkspace(archives);
      await validatePackedInstallation(repositoryRoot, archives);
    });
  } catch (error) {
    failure = error;
    audit.technicalErrors.push(error instanceof Error ? error.message : String(error));
  } finally {
    if (Object.keys(audit.versions).length === 0) {
      try {
        audit.changesets = inspectChangesets(repositoryRoot);
        audit.versions = await planPrerelease(repositoryRoot);
      } catch (error) {
        audit.technicalErrors.push(
          `Release planning failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    const result = writeReleaseCandidateReport(repositoryRoot, audit);
    runPnpmExec(repositoryRoot, ['prettier', '--write', 'docs/release-candidate-report.md']);
    console.log(`\nRelease candidate status: ${result.status}`);
    if (result.blocked) process.exitCode = 2;
  }

  if (failure) throw failure;
  return audit;
}

function validateDocumentationIdentity(repositoryRoot) {
  const files = ['README.md', 'docs/releasing.md', 'packages/cli/README.md'];
  for (const file of files) {
    const content = readFileSync(path.join(repositoryRoot, file), 'utf8');
    for (const match of content.matchAll(/npm install --global\s+([^\s`]+)/gu)) {
      if (!match[1].startsWith('@forgecli7/cli')) {
        throw new Error(`${file} documents an inconsistent installation package: ${match[1]}`);
      }
    }
  }
}

function validateWorkflowSecurity(repositoryRoot) {
  const workflow = readFileSync(path.join(repositoryRoot, '.github/workflows/release.yml'), 'utf8');
  const requirements = [
    ['workflow_dispatch:', 'manual dispatch'],
    ['environment: npm-beta', 'protected npm-beta environment'],
    ['pnpm changeset publish --tag beta', 'beta distribution tag'],
    ['needs: validate', 'validation dependency'],
    ['pnpm install --frozen-lockfile', 'lockfile enforcement'],
    ['pnpm release:verify', 'complete release verification'],
    ['concurrency:', 'release concurrency control'],
  ];
  for (const [expected, label] of requirements) {
    if (!workflow.includes(expected)) throw new Error(`Release workflow is missing ${label}.`);
  }
  if (workflow.includes('--tag latest')) {
    throw new Error('Release workflow must never publish the beta under the latest tag.');
  }
}

function runPnpm(repositoryRoot, script) {
  runPnpmExec(repositoryRoot, [script]);
}

function runPnpmExec(repositoryRoot, args) {
  const pnpmScript = process.env.npm_execpath;
  if (pnpmScript && path.basename(pnpmScript).toLowerCase().includes('pnpm')) {
    const commandArgs =
      args[0] === 'prettier' ? [pnpmScript, 'exec', ...args] : [pnpmScript, ...args];
    run(process.execPath, commandArgs, { cwd: repositoryRoot });
  } else {
    const commandArgs = args[0] === 'prettier' ? ['exec', ...args] : args;
    run(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', commandArgs, {
      cwd: repositoryRoot,
    });
  }
}

function step(label) {
  console.log(`\n[release:verify] ${label}`);
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  await verifyReleaseCandidate();
}
