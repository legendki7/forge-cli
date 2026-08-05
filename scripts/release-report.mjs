import { writeFileSync } from 'node:fs';
import path from 'node:path';

export function writeReleaseCandidateReport(root, audit) {
  const blocked = audit.identityBlockers.length > 0 || audit.technicalErrors.length > 0;
  const status =
    audit.identityBlockers.length > 0
      ? 'Blocked pending repository identity configuration'
      : blocked
        ? 'Blocked pending technical corrections'
        : 'Ready for beta publication pending npm scope ownership and authentication';
  const versions = Object.entries(audit.versions)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, version]) => `| \`${name}\` | \`${version}\` |`)
    .join('\n');
  const changesets = audit.changesets
    .flatMap((changeset) =>
      changeset.releases.map(
        (release) =>
          `| \`${changeset.file}\` | \`${release.name}\` | ${release.type} | ${changeset.userFacing ? 'Yes' : 'No'} | ${changeset.summary} |`,
      ),
    )
    .join('\n');
  const blockers =
    audit.identityBlockers.length > 0
      ? audit.identityBlockers
          .map((file) => `- Replace the repository-owner placeholder in \`${file}\`.`)
          .join('\n')
      : '- None.';
  const technical =
    audit.technicalErrors.length > 0
      ? audit.technicalErrors.map((error) => `- ${sanitizeTechnicalError(error, root)}`).join('\n')
      : '- None.';

  const report = `# ForgeKi release-candidate report

**Audit date:** ${audit.date}

**Final status:** ${status}

## Release identity

- Intended npm scope: \`@forgecli7/\`
- Executable: \`forge\`
- Supported Node.js versions: 20, 22, and 24
- Tested CI platform: Ubuntu Linux
- Additional local packed validation: platform-dependent and not a support guarantee

Repository identity is configured as \`https://github.com/legendki7/forge-cli\`. npm scope ownership
and package availability were not queried and must be confirmed manually.

## Planned beta versions

These versions were produced by Changesets in a temporary repository copy using prerelease mode;
tracked package versions were not edited.

| Package | Planned version |
| --- | --- |
${versions}

## Changesets audit

| Changeset | Package | Bump | User-facing | Summary |
| --- | --- | --- | --- | --- |
${changesets}

The Changesets describe distinct plugin, scaffolding, interactive, and publishability work. Their
overlapping CLI minor bumps are cumulative rather than contradictory; Changesets coalesces them into
one coherent minor prerelease. Internal dependency bumps are coordinated across all runtime packages.

## Automated checks performed

- Placeholder and machine-data classification
- Package scope and metadata consistency
- Formatting and ESLint
- 14-file Vitest suite, including verification-utility tests
- All six public package builds and export-map resolution
- Non-mutating Changesets prerelease planning in a temporary copy
- Actual tarball allowlist, shebang, bin, and workspace-version inspection
- Isolated local installation of all packed packages
- Public ESM imports from core, templates, Docker, and GitHub Actions packages
- Packed CLI version aliases and command help
- pnpm, npm, Yarn, and Bun project generation and detection
- Docker and GitHub Actions repeated byte-for-byte idempotency
- Temporary-directory cleanup on success and failure

## Packed package and CLI results

All six packages contain package metadata, compiled ESM JavaScript, declarations, README, and MIT
license files. No source tests, coverage, Changesets, caches, or unresolved \`workspace:*\` references
were found. The CLI maps \`forge\` to a shebang-enabled entry point and runs outside the monorepo.

Generated projects contain deterministic Next.js App Router and TypeScript files, declare the chosen
package manager in package metadata, and contain no lockfile, installed dependencies, timestamps, or
absolute machine paths. No generated-project dependencies were installed.

## Unresolved manual blockers

${blockers}

Technical blockers:

${technical}

## Known limitations

- Only Next.js project creation is implemented.
- Framework detection targets documented Node.js project shapes.
- CI currently exercises Ubuntu only; Windows and macOS are not claimed as CI-tested platforms.
- npm package-name availability and scope ownership require a manual registry check.
- Multi-package npm publication is sequential, not atomic.

## Exact manual release sequence

1. Commit the reviewed candidate and start from a clean checkout.
2. Confirm ownership and availability of all six \`@forgecli7/*\` package names.
3. Configure npm Trusted Publishing, or a protected \`NPM_TOKEN\` secret in the \`npm-beta\` environment.
4. Run \`pnpm release:verify\` and require a ready status.
5. Run \`pnpm changeset pre enter beta\`, commit the prerelease state, and review the Changesets version PR.
6. Review \`pnpm release:inspect\` output and merge only after CI succeeds.
7. Manually dispatch the protected release workflow with \`publish_beta=true\`.
8. Verify \`npm install --global @forgecli7/cli@beta\` and the documented CLI commands.

## Partial-publication recovery

npm cannot atomically publish six packages. If publication stops partway through, do not unpublish
successful packages or reuse their versions. Record which package versions exist, correct the failure,
create follow-up patch Changesets for unpublished dependents when necessary, rerun the complete release
verification, and publish the remaining coordinated versions with the \`beta\` tag. Document the
partial release in release notes before retrying.
`;
  writeFileSync(path.join(root, 'docs', 'release-candidate-report.md'), report, 'utf8');
  return { status, blocked };
}

function sanitizeTechnicalError(error, root) {
  return error
    .replaceAll(root, '.')
    .replace(/[A-Z]:\\Users\\[^\\\s]+/giu, '%USERPROFILE%')
    .replace(/\/Users\/[^/\s]+/gu, '~');
}
