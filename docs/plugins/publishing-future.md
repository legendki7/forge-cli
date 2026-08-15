# Future publishing

Phase 6 provides signed remote discovery, download, authentication, deterministic packaging, and a
local test transport. The production Marketplace provider, publisher enrollment, and public
publishing service remain intentionally unconfigured.

A production Marketplace must operationalize the reviewed format, publisher enrollment, root/key
rotation, revocation response, immutable hosting, and protected signing infrastructure without
weakening the declarative execution model. It must not turn package installation or arbitrary
JavaScript execution into a plugin capability.

Until production infrastructure is configured and reviewed, use local validation/install commands
or the clearly labeled test provider. Do not describe a local or bundled example as remotely verified.

## Integrity, authenticity, and trust

- **Integrity** answers whether installed bytes still match their recorded SHA-256 digests. ForgeKi
  implements this for local and remote installations.
- **Authenticity** answers whether an immutable plugin version was signed by the claimed publisher.
  SHA-256 alone does not prove this; Phase 6 verifies Ed25519 publisher signatures.
- **Trust** is a policy decision about whether that authenticated publisher and contribution set are
  acceptable. Phase 6 uses root-signed publisher identities, signed package digests, explicit trust
  badges, immutable versions, and revocation.
