# Marketplace production source boundary

This directory is reserved for maintainer-reviewed, unsigned production source metadata. Phase 7
does not invent a production catalog, publisher registry, revocation list, root key, URL, or hosting
provider. Add `index.json`, `publishers.json`, and `revocations.json` only through the documented
publisher/revocation review process. Generated signed output belongs in `release-staging/` and must
not be committed.
