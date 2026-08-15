# Update Security

Update metadata is bounded, strict-schema validated, root-signed, channel-bound, and expiry checked.
Downloaded artifacts must match signed SHA-256 and Ed25519 signatures before reaching pre-install
state. Invalid metadata/signatures, download failures, cancellation, disk/installer/restart failures,
and unavailable services are explicit states. Unverified artifacts are never run.
