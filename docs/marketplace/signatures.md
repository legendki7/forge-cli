# Signatures and Root Trust

ForgeKi uses Ed25519 through Node's maintained cryptography implementation. JSON signatures cover
deterministic canonical JSON with lexically sorted object keys. Package signatures cover a canonical
identity-and-digest payload; package bytes are also SHA-256 verified.

Only public root keys belong in application builds. Production private keys must remain in protected
release infrastructure. The repository's private keys live only in
`packages/marketplace/src/fixtures/test-keys.ts`, are labeled `TEST ONLY`, and secure no service.
Fixture modules are not exported by `@forgecli7/marketplace` and are excluded from its publishable
build and from ForgeKi Desktop runtime bundles.
