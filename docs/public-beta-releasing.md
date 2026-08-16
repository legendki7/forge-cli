# ForgeKi public Beta release operations

ForgeKi is currently in Beta. Phase 7 prepares a Windows public Beta pipeline but does not publish
anything. The production Marketplace and application update providers remain unconfigured.

## Version ownership and channels

Changesets owns the ten public npm package versions. The reviewed `@forgecli7/cli` Beta version is
the application release version; `pnpm release:version:sync -- --version x.y.z-beta.n` synchronizes
the private Desktop package, Tauri config, and Cargo package only in the intentional versioning
commit. Marketplace protocol, Plugin SDK API, Marketplace schema, diagnostics schema, and release
manifest schema versions evolve independently.

| Channel | npm dist-tag | Desktop metadata                  |
| ------- | ------------ | --------------------------------- |
| Beta    | `beta`       | separately signed Beta document   |
| Stable  | `latest`     | separately signed Stable document |

The first public release must use Beta. A Beta workflow never writes `latest`.

## Release architecture and gates

`pnpm release:beta:verify` is non-publishing. It composes frozen installation, formatting, lint,
TypeScript/React and Rust tests, workspace/Desktop builds, packed npm install smoke, package metadata,
Changesets planning, Marketplace verification, key/secret checks, artifact audit, CycloneDX SBOM,
license/vulnerability scans, checksums, and the release manifest. Output goes only to ignored
`release-staging/`.

The manually dispatched **Release Dry Run** workflow uploads those files as short-lived Actions
artifacts. The separate **Public Beta Release** workflow is limited to the canonical non-fork
repository, uses concurrency protection and the protected `public-beta` environment, and requires
the exact `PUBLISH_FORGEKI_BETA` confirmation. npm publishing uses the `beta` tag and provenance;
GitHub creates a prerelease only after package publication succeeds.

## Windows artifact policy

The primary user download is `ForgeKi_<version>_x64-setup.exe` (NSIS). The optional enterprise
download is `ForgeKi_<version>_x64_en-US.msi`. The bundled worker is required at runtime but is never
a standalone release asset. Build caches, `target/`, source maps, debug output, and temporary plugin
packages are excluded. Windows is the only validated native Beta platform; CLI support follows the
documented Node.js policy.

Unsigned builds are labeled **UNSIGNED** and may trigger Microsoft reputation warnings. ForgeKi
does not claim SmartScreen trust. Authenticode may use an owner-approved certificate, hardware/cloud
provider, or Tauri `bundle.windows.signCommand`; credentials belong only in the protected
environment.

## Updater signing and hosting

ForgeKi follows the installed Tauri v2 updater contract. `scripts/prepare-tauri-release-config.mjs`
creates an ignored build overlay containing `bundle.createUpdaterArtifacts: true` and the
owner-supplied public key/HTTPS endpoint. Tauri reads the private signing key from its supported
`TAURI_SIGNING_PRIVATE_KEY` and optional `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` variables. Generate a
key offline with:

```powershell
pnpm --filter @forgeki/desktop tauri signer generate -w C:\owner-controlled\forgeki-updater.key
```

Commit only the public key after review. Keep the private key and password outside the repository.
GitHub Releases can host immutable Windows updater artifacts and channel-specific static JSON
without HTML scraping or authenticated client API calls, but no URL is configured until the owner
chooses that provider. See the [official Tauri updater guide](https://v2.tauri.app/plugin/updater/).

## Marketplace hosting and publication

The selected release-output strategy is `marketplace/v1/{index,publishers,revocations}.json` plus
immutable `plugins/` packages inside a GitHub Release or equivalent static HTTPS storage. Generated
signed output is not committed. Public clients consume predictable machine-readable assets and
verify all root/publisher/package signatures locally; they never scrape GitHub HTML or require a
GitHub account.

The manual Marketplace workflow verifies the release, obtains a key only from the protected
environment, rejects fixtures, signs all three documents, self-verifies them, and uploads an Actions
artifact for review. It intentionally performs no hosting upload while the provider is unconfigured.

## Independent trust boundaries

| Artifact             | Integrity                 | Authenticity / trust root                               |
| -------------------- | ------------------------- | ------------------------------------------------------- |
| npm packages         | registry digest, lockfile | npm account/Trusted Publishing and provenance           |
| Marketplace metadata | canonical bytes           | offline Marketplace root Ed25519 key                    |
| Plugin package       | SHA-256                   | approved publisher Ed25519 key chained through registry |
| Desktop updater      | SHA-256                   | independent Tauri updater keypair                       |
| Windows installer    | SHA-256                   | owner Authenticode certificate/provider when configured |
| SBOM                 | release checksum          | GitHub workflow provenance when attested                |
| release manifest     | SHA-256 entries           | GitHub release/provenance and reviewed commit           |

Checksums detect byte changes; they do not prove publisher identity.

## Root keys and publisher onboarding

Generate the Marketplace root key offline, maintain encrypted offline backups with access logging,
and never expose the ordinary root private key to routine CI. To rotate, publish a reviewed registry
that introduces the successor public key while the current root is trusted, allow an overlap period,
then retire the predecessor. On compromise, stop publication, revoke affected keys/artifacts,
activate an offline recovery root, publish replacement trust metadata, and notify users.

A publisher submits public metadata and an Ed25519 public key. Maintainers review policy and claimed
identity without treating key possession as identity proof, assign a status, update and root-sign the
registry, and only then allow signatures under the active key to validate.

## Recovery and rollback

If npm publication stops midway, record immutable versions already published, verify dependency
availability, resume only unpublished packages when safe, or create a corrected patch prerelease.
Never republish an existing version or blindly move tags. Resume GitHub asset uploads only after
matching the reviewed manifest.

Normal rollback means a patched Beta, dist-tag correction, Marketplace revocation, updater metadata
withdrawal, and/or marking a GitHub prerelease—not destructive npm unpublishing. For compromise:
revoke or disable, rotate the affected independent key, publish a fixed version and new signed
metadata, verify it, and notify users. Each irreversible action needs maintainer confirmation.

## Clean-machine validation

Use a fresh Windows Actions runner, Windows Sandbox, or disposable VM. Install NSIS silently or MSI,
launch ForgeKi with Node.js/pnpm/Rust/Cargo absent, create a basic project, open Stack Builder and
Marketplace, generate a workspace and deployment plan, close/reopen to verify settings, then
uninstall. Developer tools may be required by generated projects, but never merely to launch the
installed Desktop app. Record installer and installed sizes plus the largest bundled files.
