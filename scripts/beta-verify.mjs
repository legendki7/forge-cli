import { copyFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { inspectChangesets, planPrerelease } from './release-audit.mjs';
import { run } from './release-validation.mjs';
import {
  artifactSize,
  auditPrivateReleaseMaterial,
  auditVersionConsistency,
  createChecksums,
  createCycloneDxSbom,
  createGithubReleasePlan,
  createReleaseManifest,
  createUpdaterMetadata,
  discoverPublishablePackages,
  orderPackages,
  prepareReleaseStaging,
  validateDistTag,
  writeJson,
} from './beta-release.mjs';

export const betaVerificationCommands = [
  ['install', '--frozen-lockfile'],
  ['format:check'],
  ['lint'],
  ['test'],
  ['build'],
  ['desktop:check'],
  ['desktop:build'],
  ['release:verify'],
  ['marketplace:verify'],
];

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function verifyBetaRelease(repositoryRoot = root) {
  for (const args of betaVerificationCommands) runPnpm(repositoryRoot, args);
  run('cargo', ['test', '--locked'], {
    cwd: path.join(repositoryRoot, 'apps/desktop/src-tauri'),
  });

  const packages = discoverPublishablePackages(repositoryRoot);
  const ordered = orderPackages(packages);
  validateDistTag('beta', 'beta');
  auditVersionConsistency(repositoryRoot);
  const privateMaterial = auditPrivateReleaseMaterial(repositoryRoot);
  if (privateMaterial.length) {
    throw new Error(`Private release material found: ${privateMaterial.join(', ')}`);
  }
  const versions = await planPrerelease(repositoryRoot);
  const changesets = inspectChangesets(repositoryRoot);
  const intendedVersion = versions['@forgecli7/cli'];
  if (!intendedVersion) throw new Error('Changesets did not plan a ForgeKi CLI beta version.');
  const commit = git(repositoryRoot, ['rev-parse', 'HEAD']).trim();

  const nativeArtifacts = findFiles(
    path.join(repositoryRoot, 'apps/desktop/src-tauri/target/release/bundle'),
    (file) => /(?:-setup\.exe|\.msi)$/u.test(file),
  );
  if (!nativeArtifacts.length) throw new Error('No Windows NSIS/MSI artifacts were built.');
  const staging = prepareReleaseStaging(repositoryRoot, []);
  const stagedArtifacts = nativeArtifacts.map((source) => {
    const original = path.basename(source);
    const filename = original.replace(/\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?/u, intendedVersion);
    const destination = path.join(staging, filename);
    copyFileSync(source, destination);
    const signatureFile = `${source}.sig`;
    const updaterSignature = existsSync(signatureFile)
      ? readFileSync(signatureFile, 'utf8').trim()
      : undefined;
    return {
      file: filename,
      filename,
      platform: 'windows',
      architecture: 'x86_64',
      type: filename.endsWith('.msi') ? 'msi' : 'nsis',
      ...(updaterSignature ? { updaterSignature } : {}),
    };
  });
  const signedUpdater = stagedArtifacts.find(
    ({ type, updaterSignature }) => type === 'nsis' && updaterSignature,
  );
  if (signedUpdater) {
    const baseUrl = process.env.FORGEKI_RELEASE_BASE_URL?.replace(/\/$/u, '');
    if (!baseUrl) throw new Error('Signed updater artifacts require FORGEKI_RELEASE_BASE_URL.');
    const updater = createUpdaterMetadata({
      version: intendedVersion,
      channel: 'beta',
      notes: `ForgeKi ${intendedVersion} Beta`,
      artifactUrl: `${baseUrl}/${signedUpdater.filename}`,
      signature: signedUpdater.updaterSignature,
    });
    writeJson(path.join(staging, 'beta.json'), updater);
    stagedArtifacts.push({
      file: 'beta.json',
      filename: 'beta.json',
      platform: 'windows',
      architecture: 'x86_64',
      type: 'updater-metadata',
    });
  }
  const sbom = createCycloneDxSbom(repositoryRoot);
  writeJson(path.join(staging, 'forgeki-sbom.cdx.json'), sbom);
  copyFileSync(
    path.join(repositoryRoot, 'THIRD_PARTY_NOTICES.md'),
    path.join(staging, 'THIRD_PARTY_NOTICES.md'),
  );
  stagedArtifacts.push({
    file: 'forgeki-sbom.cdx.json',
    filename: 'forgeki-sbom.cdx.json',
    platform: 'any',
    architecture: 'any',
    type: 'sbom',
  });
  stagedArtifacts.push({
    file: 'THIRD_PARTY_NOTICES.md',
    filename: 'THIRD_PARTY_NOTICES.md',
    platform: 'any',
    architecture: 'any',
    type: 'notices',
  });
  const manifest = createReleaseManifest({
    root: staging,
    version: intendedVersion,
    channel: 'beta',
    commit,
    artifacts: stagedArtifacts,
  });
  writeJson(path.join(staging, 'release-manifest.json'), manifest);
  writeFileSync(path.join(staging, 'SHA256SUMS.txt'), createChecksums(manifest), 'utf8');
  writeFileSync(
    path.join(staging, 'release-notes.md'),
    createReleaseNotes(intendedVersion, changesets),
    'utf8',
  );
  const filenames = readdirSync(staging).sort();
  const githubPlan = createGithubReleasePlan(intendedVersion, filenames);
  writeJson(path.join(staging, 'github-prerelease-plan.json'), githubPlan);

  const npm = npmStatus(repositoryRoot);
  const vulnerabilityResult = pnpmJson(repositoryRoot, ['audit', '--prod', '--json']);
  const vulnerability = {
    ...vulnerabilityResult,
    ok: Boolean(vulnerabilityResult.value?.metadata?.vulnerabilities),
  };
  const licenses = pnpmJson(repositoryRoot, ['licenses', 'list', '--prod', '--json']);
  const severities = vulnerability.value?.metadata?.vulnerabilities ?? {};
  if ((severities.critical ?? 0) > 0 || (severities.high ?? 0) > 0) {
    throw new Error('Critical/high production dependency vulnerabilities require review.');
  }
  const sizes = Object.fromEntries(
    stagedArtifacts.map(({ filename }) => [filename, artifactSize(path.join(staging, filename))]),
  );
  const runtimePayload = {
    application: artifactSize(
      path.join(repositoryRoot, 'apps/desktop/src-tauri/target/release/forgeki-desktop.exe'),
    ),
    worker: artifactSize(
      path.join(
        repositoryRoot,
        'apps/desktop/src-tauri/binaries/forgeki-worker-x86_64-pc-windows-msvc.exe',
      ),
    ),
  };
  runtimePayload.total = runtimePayload.application + runtimePayload.worker;
  writeBetaReadinessReport(repositoryRoot, {
    intendedVersion,
    commit,
    packages: ordered,
    versions,
    sizes,
    npm,
    vulnerability,
    licenses,
    sbomComponents: sbom.components.length,
    runtimePayload,
  });
  return { intendedVersion, packages, manifest, githubPlan, npm, vulnerability, licenses, staging };
}

function writeBetaReadinessReport(repositoryRoot, audit) {
  const versionTable = formatMarkdownTable(
    ['Package', 'Current', 'Planned Beta'],
    audit.packages.map((item) => [
      `\`${item.name}\``,
      `\`${item.version}\``,
      `\`${audit.versions[item.name] ?? 'unchanged'}\``,
    ]),
  );
  const sizeTable = formatMarkdownTable(
    ['Artifact', 'Size'],
    Object.entries(audit.sizes).map(([name, size]) => [`\`${name}\``, formatBytes(size)]),
    new Set([1]),
  );
  const report = `# ForgeKi public Beta readiness report

**Generated:** ${new Date().toISOString()}

**Final status:** Technically ready; blocked by owner configuration

## Release candidate

- Intended Desktop/CLI Beta version: \`${audit.intendedVersion}\`
- Channel: \`beta\` (npm dist-tag \`beta\`, never \`latest\`)
- Commit: \`${audit.commit}\`
- Public packages: ${audit.packages.length}
- Windows native platform: validated by the local release dry run
- npm authentication: ${audit.npm.authenticated ? `Authenticated as \`${audit.npm.user}\`` : 'Unavailable — owner must run `npm login` or configure Trusted Publishing'}
- npm scope ownership: ${audit.npm.authenticated ? 'Must still be confirmed by the owner before publication' : 'Not verifiable without authentication'}

${versionTable}

## Artifact audit

${sizeTable}

- Primary public installer: NSIS \`ForgeKi_<version>_x64-setup.exe\`
- Optional enterprise installer: MSI \`ForgeKi_<version>_x64_en-US.msi\`
- Installed core payload: ${formatBytes(audit.runtimePayload.total)} (application ${formatBytes(audit.runtimePayload.application)} + bundled worker/runtime ${formatBytes(audit.runtimePayload.worker)}); filesystem/installer overhead is excluded
- Largest required bundled file: worker/runtime at ${formatBytes(audit.runtimePayload.worker)}
- Internal worker binaries: bundled only; excluded from the GitHub asset plan
- Release manifest/checksums: generated from actual staged bytes
- SBOM: CycloneDX 1.5, ${audit.sbomComponents} JavaScript/Rust workspace and lockfile components
- License audit: ${audit.licenses.ok ? 'completed across JavaScript/Rust inventories; THIRD_PARTY_NOTICES.md is staged and maintainer/legal review remains required' : 'scanner unavailable — blocks a public release until completed'}
- Vulnerability audit: ${audit.vulnerability.ok ? 'completed with no critical/high production finding reported by pnpm' : 'scanner unavailable — blocks a public release until completed'}

## Production configuration status

- Windows Authenticode: **UNSIGNED** — no owner certificate is configured; SmartScreen trust is not claimed
- Tauri updater signing: prepared, not configured; no production public/private key supplied
- Production Marketplace Provider: **Unconfigured**
- Application Update Provider: **Prepared, not configured**
- Clean-machine installer test: workflow prepared; an isolated install/uninstall run is still required
- Marketplace root key: no production private key exists in the repository

## Release gates

The Beta verifier composes frozen installation, formatting, lint, TypeScript/React tests, Rust tests,
workspace and Desktop builds, packed-install smoke, package metadata, Marketplace verification,
private-key/secret checks, version consistency, artifact generation, SBOM, license/vulnerability audit,
checksums, and the deterministic release manifest. It never publishes.

## Unresolved blockers

1. Confirm \`@forgecli7\` npm ownership and configure npm Trusted Publishing or a protected token.
2. Approve the intended Beta version and enter Changesets prerelease mode intentionally.
3. Supply a Tauri updater keypair and commit only the public key; protect the private key/password.
4. Select and configure immutable HTTPS Marketplace and update metadata hosting.
5. Configure the protected \`public-beta\` GitHub Environment with required reviewers.
6. Provide a legitimate Windows code-signing mechanism, or explicitly accept unsigned Beta warnings.
7. Run and approve the clean-machine Windows install/launch/persistence/uninstall workflow.
8. Review license and vulnerability scanner output before publication.

No npm package, GitHub Release, tag, installer, Marketplace metadata, or updater metadata was published.
`;
  writeFileSync(path.join(repositoryRoot, 'docs/beta-readiness-report.md'), report, 'utf8');
}

export function formatMarkdownTable(headers, rows, rightAligned = new Set()) {
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => row[index].length)),
  );
  const render = (row) =>
    `| ${row
      .map((value, index) =>
        rightAligned.has(index) ? value.padStart(widths[index]) : value.padEnd(widths[index]),
      )
      .join(' | ')} |`;
  const divider = widths.map((width, index) =>
    rightAligned.has(index) ? `${'-'.repeat(width - 1)}:` : '-'.repeat(width),
  );
  return [render(headers), render(divider), ...rows.map(render)].join('\n');
}

function npmStatus(repositoryRoot) {
  const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['whoami'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    shell: false,
  });
  return result.status === 0
    ? { authenticated: true, user: result.stdout.trim() }
    : { authenticated: false };
}

function pnpmJson(repositoryRoot, args) {
  const invocation = pnpmInvocation(args);
  const result = spawnSync(invocation.command, invocation.args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    shell: false,
    maxBuffer: 20 * 1024 * 1024,
  });
  try {
    return { ok: result.status === 0, value: JSON.parse(result.stdout || '{}') };
  } catch {
    return { ok: false, error: 'The scanner did not return JSON.' };
  }
}

function runPnpm(repositoryRoot, args) {
  const invocation = pnpmInvocation(args);
  run(invocation.command, invocation.args, { cwd: repositoryRoot });
}

function pnpmInvocation(args) {
  const pnpmScript = process.env.npm_execpath;
  return pnpmScript && path.basename(pnpmScript).toLowerCase().includes('pnpm')
    ? { command: process.execPath, args: [pnpmScript, ...args] }
    : { command: process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', args };
}

function git(repositoryRoot, args) {
  const result = spawnSync('git', args, { cwd: repositoryRoot, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || 'git failed');
  return result.stdout;
}

function findFiles(rootDirectory, predicate) {
  if (!existsSync(rootDirectory)) return [];
  const result = [];
  const pending = [rootDirectory];
  while (pending.length) {
    const directory = pending.pop();
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) pending.push(file);
      else if (entry.isFile() && predicate(entry.name)) result.push(file);
    }
  }
  return result.sort();
}

function formatBytes(value) {
  return `${(value / 1024 / 1024).toFixed(2)} MiB`;
}

function createReleaseNotes(version, changesets) {
  const highlights = changesets.map(({ summary }) => `- ${summary}`).join('\n');
  return `# ForgeKi ${version} Beta

ForgeKi is currently in Beta. APIs and plugin schemas may still evolve.

## Highlights

${highlights}

## Desktop

Windows x64 is the only currently validated native Beta platform.

## CLI

Run \`forge doctor\` or \`forge doctor --json\` for privacy-safe readiness diagnostics.

## Stack Builder

Visual stack planning and deterministic local generation remain available.

## Workspaces

Multi-service workspace planning, generation, and read-only scanning remain available.

## Deployment

ForgeKi generates deployment plans and files; it does not deploy infrastructure.

## Plugins

Declarative plugins remain permission-restricted and integrity checked.

## Marketplace

Production Marketplace hosting remains unconfigured until the owner selects a provider.

## Security

Marketplace, updater, Authenticode, and provenance trust boundaries use separate controls.

## Known limitations

- macOS and Linux native installers are unvalidated.
- Unsigned Windows installers may trigger reputation warnings.
- Production Marketplace and application update providers require owner configuration.

## Installation

Use the NSIS setup executable for the primary Windows Beta experience; MSI is optional for managed environments.

## Checksums

Verify downloaded bytes against \`SHA256SUMS.txt\`. Checksums provide integrity, not publisher authenticity.
`;
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  await verifyBetaRelease();
}
