# Trusted Marketplace

ForgeKi can consume a read-only, signed Marketplace catalog when a trusted provider is configured.
The production provider is currently **not configured**. The complete implementation is exercised
with a local test transport and clearly isolated test keys; core creation and installed plugins
remain available offline.

Trust has three separate layers: SHA-256 proves byte integrity, Ed25519 proves which key signed
canonical bytes, and ForgeKi policy decides whether that key is authorized for Marketplace metadata
or a publisher. A valid signature is not an endorsement, so declarative safety validation always runs.
