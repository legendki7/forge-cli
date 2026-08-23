# Security policy

## Supported versions

No public release exists yet. Until the first beta is published, security fixes apply to the latest
commit on `main`. After publication, only the latest beta will be eligible for fixes; older
prereleases may be unsupported. This policy will be updated when stable release lines exist.

## Reporting a vulnerability

Do not initially disclose suspected vulnerabilities in a public issue, discussion, or pull request.
Use [GitHub private vulnerability reporting](https://github.com/legendki7/forge-cli/security/advisories/new).
If private reporting has not yet been enabled, contact the repository owner through a private channel
shown on their GitHub profile and ask how to submit the report securely; do not include sensitive
details in that first message.

Include the affected version, reproduction steps, impact, and any suggested mitigation. Maintainers
will acknowledge receipt, investigate, and coordinate disclosure and remediation when appropriate.

## Marketplace and update threat model

ForgeKi assumes a Marketplace server, publisher key, root key, update provider, artifact host, local
cache, or network path may be compromised. It independently addresses MITM and substitution with
HTTPS plus Ed25519 signatures and SHA-256 digests; stale/replayed metadata with expiry, revocation,
and downgrade policy; SSRF/DNS rebinding/redirect attacks with backend allowlists and private-address
blocking; cache poisoning with verify-before-atomic-write; and archive traversal, links, executable
payloads, decompression-style expansion, and malicious README content with a closed deterministic
package format and strict inspection limits.

A cryptographically valid plugin can still be malicious in intent. Signatures never bypass the
declarative manifest schema, permission checks, contribution safety report, collision protections,
or the prohibition on arbitrary code, shell commands, credentials, and ForgeKi network APIs.
Permission expansion requires explicit review, and revoked/corrupted plugins are excluded from new
generation while their files remain available for inspection/removal.

Application metadata and artifacts require separate signatures and digest checks. An updater-signing
key compromise does not establish Windows publisher identity; Authenticode and SmartScreen trust are
separate. Phase 6 has no production Marketplace/update endpoint, no production signing key, and no
silent installer path.
