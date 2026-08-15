# Publisher Identities

The root-signed registry assigns publisher IDs, display names, trust status, and Ed25519 public keys.
UI labels distinguish ForgeKi, Verified Publisher, Community Publisher, Revoked, and Unknown. Authors
cannot mark themselves verified in plugin manifests.

Keys are active, retired, or revoked. Active keys may sign new installs. Retired keys remain usable
to verify historical packages. Revoked keys block installation and update.
