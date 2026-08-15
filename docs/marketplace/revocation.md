# Revocation

Root-signed metadata can revoke publishers, publisher keys, plugin versions, or package digests.
Revoked installed plugins are disabled but retained for inspection/removal. They are excluded from
new generation plans and never delete existing project files.

New installations require non-stale revocation metadata. Cached data is labeled Fresh, Cached,
Stale, or Unavailable rather than silently represented as current.
