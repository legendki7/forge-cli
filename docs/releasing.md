# Releasing ForgeCLI

ForgeCLI is preparing a coordinated scoped-package beta. No release command in the normal quality
workflow publishes automatically. The first public release must use the npm distribution tag
`beta`, never `latest`.

## Automated checks

- [ ] `pnpm install --frozen-lockfile`
- [ ] `pnpm format:check`
- [ ] `pnpm lint`
- [ ] `pnpm test`
- [ ] `pnpm build`
- [ ] `pnpm release:inspect` passes and its tarball file lists are reviewed
- [ ] `pnpm release:smoke` passes outside the monorepo
- [ ] `pnpm release:verify` completes with a ready status
- [ ] Required JavaScript, declarations, package metadata, README, LICENSE, and shebang are present
- [ ] Source tests, coverage, caches, Changesets, and monorepo configuration are absent from tarballs

## Manual checks

- [ ] Working tree is clean and contains the intended Changesets
- [ ] npm ownership and availability of `@forgecli/cli` and all internal scoped names are confirmed
- [ ] Repository metadata points to `https://github.com/legendki7/forge-cli`
- [ ] Package descriptions, license, repository links, homepage, bugs URL, and contributors are reviewed
- [ ] GitHub private vulnerability reporting is enabled
- [ ] npm authentication or trusted publishing is configured for the repository environment
- [ ] The `npm-beta` GitHub environment has required reviewer protection
- [ ] The prerelease version and `beta` distribution tag are confirmed
- [ ] Documentation and GitHub release notes are reviewed
- [ ] Installation is verified from npm after publication

## First beta sequence

1. **Confirm names.** Check npm scope ownership and availability manually. The intended executable
   package is `@forgecli/cli`; the executable remains `forge`. Update package metadata and repository
   placeholders if a different scope is required.
2. **Configure authentication.** Prefer npm Trusted Publishing after the package-to-workflow OIDC
   relationship is configured and reviewed. Until then, the committed workflow requires the
   repository secret `NPM_TOKEN`. Restrict the `npm-beta` GitHub environment, never print the token,
   and remove the token-presence check only when Trusted Publishing is fully configured.
3. **Enter prerelease mode.** Run `pnpm changeset pre enter beta`. Existing minor Changesets mean the
   exact first beta version is determined by Changesets (currently expected to be `0.2.0-beta.0`),
   rather than being edited manually.
4. **Create the release pull request.** Commit the prerelease state and Changesets, merge through CI,
   and let the Changesets workflow create or update its version pull request. Review and merge it.
5. **Inspect packages.** Run `pnpm release:inspect` and `pnpm release:smoke` from the release commit.
   Review every included file and confirm packed dependency versions contain no `workspace:*`.
6. **Publish the beta.** Manually dispatch the `Changesets release` workflow with
   `publish_beta=true`. The protected job runs validation first and publishes with `--tag beta`.
7. **Verify installation.** In a clean temporary environment, run
   `npm install --global @forgecli/cli@beta`, then verify `forge --version`, `forge --help`,
   `forge check`, project creation, and both built-in plugins.
8. **Prepare for stable later.** After the beta series is complete, run `pnpm changeset pre exit`,
   review the resulting stable version PR, and publish without changing `latest` until the stable
   release is explicitly approved.

Do not run `pnpm release:publish` locally unless acting in an explicitly authorized, authenticated
release environment. It is intentionally separate from inspection and smoke validation.

### Partial publication recovery

Publishing coordinated npm packages is sequential rather than atomic. If one package fails after
others are published, stop and record the versions that succeeded. Do not unpublish them or reuse
their versions. Correct the failure, add patch Changesets for affected unpublished dependents when
needed, rerun `pnpm release:verify`, then publish the remaining coordinated versions with the `beta`
tag and document the partial release in the release notes.
