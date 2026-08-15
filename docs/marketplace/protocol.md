# Marketplace Protocol

Protocol version 1 consists of independently root-signed index, publisher-registry, and revocation
documents. Each document is bounded, strictly schema-validated, canonically serialized, and verified
before it can replace the cache. Catalog entries contain discovery metadata and a publisher signature
over plugin ID, version, publisher/key IDs, and package SHA-256.

The Phase 6 fixture uses one bounded index. Future providers may use root-signed segmented indexes;
clients must retain the same verification and size limits.
