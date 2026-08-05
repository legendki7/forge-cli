# ForgeKi release-candidate report

**Audit date:** 2026-08-05

**Final status:** Ready for beta publication pending npm scope ownership and authentication

## Release identity

- Intended npm scope: `@forgecli7/`
- Executable: `forge`
- Supported Node.js versions: 20, 22, and 24
- Tested CI platform: Ubuntu Linux
- Additional local packed validation: platform-dependent and not a support guarantee

Repository identity is configured as `https://github.com/legendki7/forge-cli`. npm scope ownership
and package availability were not queried and must be confirmed manually.

## Planned beta versions

These versions were produced by Changesets in a temporary repository copy using prerelease mode;
tracked package versions were not edited.

| Package                            | Planned version |
| ---------------------------------- | --------------- |
| `@forgecli7/cli`                   | `0.2.0-beta.0`  |
| `@forgecli7/core`                  | `0.2.0-beta.0`  |
| `@forgecli7/plugin-docker`         | `0.1.1-beta.0`  |
| `@forgecli7/plugin-github-actions` | `0.2.0-beta.0`  |
| `@forgecli7/plugins`               | `0.2.0-beta.0`  |
| `@forgecli7/templates`             | `0.2.0-beta.0`  |

## Changesets audit

| Changeset                  | Package                            | Bump  | User-facing | Summary                                                                                                                                                                                                                                                  |
| -------------------------- | ---------------------------------- | ----- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bright-actions-build.md`  | `@forgecli7/plugin-github-actions` | minor | Yes         | Add project-aware GitHub Actions CI generation through `forge add github-actions`, including shared race-safe file creation, package-manager-specific setup, script-aware validation steps, and non-destructive handling of existing workflows.          |
| `bright-actions-build.md`  | `@forgecli7/plugins`               | minor | Yes         | Add project-aware GitHub Actions CI generation through `forge add github-actions`, including shared race-safe file creation, package-manager-specific setup, script-aware validation steps, and non-destructive handling of existing workflows.          |
| `bright-actions-build.md`  | `@forgecli7/cli`                   | minor | Yes         | Add project-aware GitHub Actions CI generation through `forge add github-actions`, including shared race-safe file creation, package-manager-specific setup, script-aware validation steps, and non-destructive handling of existing workflows.          |
| `bright-actions-build.md`  | `@forgecli7/core`                  | patch | Yes         | Add project-aware GitHub Actions CI generation through `forge add github-actions`, including shared race-safe file creation, package-manager-specific setup, script-aware validation steps, and non-destructive handling of existing workflows.          |
| `bright-desktop-studio.md` | `@forgecli7/core`                  | minor | No          | Add typed built-in template and plugin catalogs for ForgeKi Desktop, including five deterministic offline Next.js templates and package-derived plugin metadata.                                                                                         |
| `bright-desktop-studio.md` | `@forgecli7/templates`             | minor | No          | Add typed built-in template and plugin catalogs for ForgeKi Desktop, including five deterministic offline Next.js templates and package-derived plugin metadata.                                                                                         |
| `bright-desktop-studio.md` | `@forgecli7/plugins`               | minor | No          | Add typed built-in template and plugin catalogs for ForgeKi Desktop, including five deterministic offline Next.js templates and package-derived plugin metadata.                                                                                         |
| `bright-desktop-studio.md` | `@forgecli7/plugin-docker`         | patch | No          | Add typed built-in template and plugin catalogs for ForgeKi Desktop, including five deterministic offline Next.js templates and package-derived plugin metadata.                                                                                         |
| `bright-desktop-studio.md` | `@forgecli7/plugin-github-actions` | patch | No          | Add typed built-in template and plugin catalogs for ForgeKi Desktop, including five deterministic offline Next.js templates and package-derived plugin metadata.                                                                                         |
| `calm-projects-create.md`  | `@forgecli7/cli`                   | minor | Yes         | Add offline Next.js TypeScript scaffolding through `forge create`, with safe destination handling, package-manager metadata detection, optional Git initialization, and Docker/GitHub Actions plugin orchestration.                                      |
| `calm-projects-create.md`  | `@forgecli7/templates`             | minor | Yes         | Add offline Next.js TypeScript scaffolding through `forge create`, with safe destination handling, package-manager metadata detection, optional Git initialization, and Docker/GitHub Actions plugin orchestration.                                      |
| `calm-projects-create.md`  | `@forgecli7/core`                  | minor | Yes         | Add offline Next.js TypeScript scaffolding through `forge create`, with safe destination handling, package-manager metadata detection, optional Git initialization, and Docker/GitHub Actions plugin orchestration.                                      |
| `calm-projects-create.md`  | `@forgecli7/plugin-docker`         | patch | Yes         | Add offline Next.js TypeScript scaffolding through `forge create`, with safe destination handling, package-manager metadata detection, optional Git initialization, and Docker/GitHub Actions plugin orchestration.                                      |
| `calm-projects-create.md`  | `@forgecli7/plugin-github-actions` | patch | Yes         | Add offline Next.js TypeScript scaffolding through `forge create`, with safe destination handling, package-manager metadata detection, optional Git initialization, and Docker/GitHub Actions plugin orchestration.                                      |
| `gentle-create-prompts.md` | `@forgecli7/cli`                   | minor | Yes         | Add an interactive `forge create` wizard with partial-option prompting, a confirmation summary, non-TTY safeguards, and injectable prompt and process adapters while preserving named command automation.                                                |
| `quiet-windows-rename.md`  | `@forgecli7/templates`             | patch | No          | Retry transient Windows staging-directory renames without weakening concurrent-destination safety.                                                                                                                                                       |
| `safe-public-beta.md`      | `@forgecli7/cli`                   | minor | Yes         | Prepare coordinated packages for a safe public beta with package-derived version output, enforced Node.js support, publish metadata, explicit tarball inspection, packed-install smoke validation, release governance, and opt-in Changesets publishing. |
| `safe-public-beta.md`      | `@forgecli7/core`                  | patch | Yes         | Prepare coordinated packages for a safe public beta with package-derived version output, enforced Node.js support, publish metadata, explicit tarball inspection, packed-install smoke validation, release governance, and opt-in Changesets publishing. |
| `safe-public-beta.md`      | `@forgecli7/templates`             | patch | Yes         | Prepare coordinated packages for a safe public beta with package-derived version output, enforced Node.js support, publish metadata, explicit tarball inspection, packed-install smoke validation, release governance, and opt-in Changesets publishing. |
| `safe-public-beta.md`      | `@forgecli7/plugins`               | patch | Yes         | Prepare coordinated packages for a safe public beta with package-derived version output, enforced Node.js support, publish metadata, explicit tarball inspection, packed-install smoke validation, release governance, and opt-in Changesets publishing. |
| `safe-public-beta.md`      | `@forgecli7/plugin-docker`         | patch | Yes         | Prepare coordinated packages for a safe public beta with package-derived version output, enforced Node.js support, publish metadata, explicit tarball inspection, packed-install smoke validation, release governance, and opt-in Changesets publishing. |
| `safe-public-beta.md`      | `@forgecli7/plugin-github-actions` | patch | Yes         | Prepare coordinated packages for a safe public beta with package-derived version output, enforced Node.js support, publish metadata, explicit tarball inspection, packed-install smoke validation, release governance, and opt-in Changesets publishing. |
| `swift-desktop-create.md`  | `@forgecli7/core`                  | minor | No          | Expose the browser-safe project-name validator used by the private ForgeKi Desktop application.                                                                                                                                                          |

The Changesets describe distinct plugin, scaffolding, interactive, and publishability work. Their
overlapping CLI minor bumps are cumulative rather than contradictory; Changesets coalesces them into
one coherent minor prerelease. Internal dependency bumps are coordinated across all runtime packages.

## Automated checks performed

- Placeholder and machine-data classification
- Package scope and metadata consistency
- Formatting and ESLint
- CLI, package, release-utility, desktop UI, and desktop bridge Vitest suites
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
license files. No source tests, coverage, Changesets, caches, or unresolved `workspace:*` references
were found. The CLI maps `forge` to a shebang-enabled entry point and runs outside the monorepo.

Generated projects contain deterministic Next.js App Router and TypeScript files, declare the chosen
package manager in package metadata, and contain no lockfile, installed dependencies, timestamps, or
absolute machine paths. No generated-project dependencies were installed.

## Unresolved manual blockers

- None.

Technical blockers:

- None.

## Known limitations

- Only Next.js project creation is implemented.
- Framework detection targets documented Node.js project shapes.
- CI currently exercises Ubuntu only; Windows and macOS are not claimed as CI-tested platforms.
- npm package-name availability and scope ownership require a manual registry check.
- Multi-package npm publication is sequential, not atomic.

## Exact manual release sequence

1. Commit the reviewed candidate and start from a clean checkout.
2. Confirm ownership and availability of all six `@forgecli7/*` package names.
3. Configure npm Trusted Publishing, or a protected `NPM_TOKEN` secret in the `npm-beta` environment.
4. Run `pnpm release:verify` and require a ready status.
5. Run `pnpm changeset pre enter beta`, commit the prerelease state, and review the Changesets version PR.
6. Review `pnpm release:inspect` output and merge only after CI succeeds.
7. Manually dispatch the protected release workflow with `publish_beta=true`.
8. Verify `npm install --global @forgecli7/cli@beta` and the documented CLI commands.

## Partial-publication recovery

npm cannot atomically publish six packages. If publication stops partway through, do not unpublish
successful packages or reuse their versions. Record which package versions exist, correct the failure,
create follow-up patch Changesets for unpublished dependents when necessary, rerun the complete release
verification, and publish the remaining coordinated versions with the `beta` tag. Document the
partial release in release notes before retrying.
