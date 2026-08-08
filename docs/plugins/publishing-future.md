# Future publishing

ForgeKi does not provide remote plugin discovery, download, authentication, signing, or publishing in
this release. The Marketplace is explicitly an offline preview.

A future remote marketplace must add a reviewed distribution format, publisher identity, signed
metadata, revocation, immutable artifacts, transport security, compatibility policy, audit logging,
and a user-consent flow without weakening the declarative execution model. It must not turn package
installation or arbitrary JavaScript execution into a plugin capability.

Until that design is implemented and reviewed, share plugin source directories out of band and use
local validation/install commands. Do not describe a local or bundled example as remotely verified.

## Integrity, authenticity, and trust

- **Integrity** answers whether installed bytes still match their recorded SHA-256 digests. ForgeKi
  implements this locally today.
- **Authenticity** answers whether an immutable plugin version was signed by the claimed publisher.
  SHA-256 alone does not prove this, and ForgeKi does not claim it today.
- **Trust** is a policy decision about whether that authenticated publisher and contribution set are
  acceptable. A future registry would need publisher identities, registry-signed manifest and package
  digests, transparent immutable versions, trusted-publisher verification, and revocation.
