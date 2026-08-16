# ForgeKi public Beta owner actions

Only the repository owner can complete these items:

1. Approve the intended Changesets Beta version and intentional versioning commit.
2. Confirm npm ownership/access for all discovered `@forgecli7/*` public packages; run `npm login`
   locally if needed, then configure npm Trusted Publishing or `NPM_TOKEN` in `public-beta`.
3. Create the protected GitHub `public-beta` environment with required reviewers.
4. Generate and securely back up a production Tauri updater keypair; configure only its public key
   and endpoint as environment variables and protect its private key/password as secrets.
5. Select immutable HTTPS hosting for production Marketplace assets and update metadata.
6. Supply a legitimate Windows Authenticode certificate or cloud/hardware signing provider, or
   explicitly accept that an unsigned Beta will show trust/reputation warnings.
7. Generate and safeguard the offline Marketplace root key and approve initial publisher metadata.
8. Review license, vulnerability, SBOM, artifact-size, and clean-machine validation outputs.
9. Approve the GitHub prerelease notes and final asset manifest.
10. Manually dispatch the real workflow and type `PUBLISH_FORGEKI_BETA` only when every gate passes.

Do not send tokens, passwords, certificates, or private keys through issues or chat.
