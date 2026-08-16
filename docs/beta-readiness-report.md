# ForgeKi public Beta readiness report

**Generated:** 2026-08-16T11:39:11.623Z

**Final status:** Technically ready; blocked by owner configuration

## Release candidate

- Intended Desktop/CLI Beta version: `0.2.0-beta.0`
- Channel: `beta` (npm dist-tag `beta`, never `latest`)
- Commit: `691e1b4b5f9c8629771243e67a6487a9fee60777`
- Public packages: 10
- Windows native platform: validated by the local release dry run
- npm authentication: Unavailable — owner must run `npm login` or configure Trusted Publishing
- npm scope ownership: Not verifiable without authentication

| Package                            | Current | Planned Beta   |
| ---------------------------------- | ------- | -------------- |
| `@forgecli7/core`                  | `0.1.0` | `0.2.0-beta.0` |
| `@forgecli7/plugin-sdk`            | `0.1.0` | `0.2.0-beta.0` |
| `@forgecli7/templates`             | `0.1.0` | `0.2.0-beta.0` |
| `@forgecli7/workspaces`            | `0.1.0` | `0.2.0-beta.0` |
| `@forgecli7/deployments`           | `0.1.0` | `0.2.0-beta.0` |
| `@forgecli7/plugin-docker`         | `0.1.0` | `0.1.1-beta.0` |
| `@forgecli7/plugin-github-actions` | `0.1.0` | `0.2.0-beta.0` |
| `@forgecli7/plugins`               | `0.1.0` | `0.2.0-beta.0` |
| `@forgecli7/marketplace`           | `0.1.0` | `0.2.0-beta.0` |
| `@forgecli7/cli`                   | `0.1.0` | `0.2.0-beta.0` |

## Artifact audit

| Artifact                             |      Size |
| ------------------------------------ | --------: |
| `ForgeKi_0.2.0-beta.0_x64_en-US.msi` | 26.15 MiB |
| `ForgeKi_0.2.0-beta.0_x64-setup.exe` | 18.38 MiB |
| `forgeki-sbom.cdx.json`              |  0.07 MiB |
| `THIRD_PARTY_NOTICES.md`             |  0.00 MiB |

- Primary public installer: NSIS `ForgeKi_<version>_x64-setup.exe`
- Optional enterprise installer: MSI `ForgeKi_<version>_x64_en-US.msi`
- Installed core payload: 71.06 MiB (application 15.67 MiB + bundled worker/runtime 55.39 MiB); filesystem/installer overhead is excluded
- Largest required bundled file: worker/runtime at 55.39 MiB
- Internal worker binaries: bundled only; excluded from the GitHub asset plan
- Release manifest/checksums: generated from actual staged bytes
- SBOM: CycloneDX 1.5, 524 JavaScript/Rust workspace and lockfile components
- License audit: completed across JavaScript/Rust inventories; THIRD_PARTY_NOTICES.md is staged and maintainer/legal review remains required
- Vulnerability audit: completed with no critical/high production finding reported by pnpm

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

1. Confirm `@forgecli7` npm ownership and configure npm Trusted Publishing or a protected token.
2. Approve the intended Beta version and enter Changesets prerelease mode intentionally.
3. Supply a Tauri updater keypair and commit only the public key; protect the private key/password.
4. Select and configure immutable HTTPS Marketplace and update metadata hosting.
5. Configure the protected `public-beta` GitHub Environment with required reviewers.
6. Provide a legitimate Windows code-signing mechanism, or explicitly accept unsigned Beta warnings.
7. Run and approve the clean-machine Windows install/launch/persistence/uninstall workflow.
8. Review license and vulnerability scanner output before publication.

No npm package, GitHub Release, tag, installer, Marketplace metadata, or updater metadata was published.
