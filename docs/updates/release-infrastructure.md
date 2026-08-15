# Future Release Infrastructure

Future signed Desktop releases require an owned HTTPS metadata endpoint, protected updater signing
secrets, immutable artifacts, CI-generated signed metadata, and an Authenticode certificate if
Windows publisher trust is desired. Use the exact Tauri environment-variable names documented for
the adopted Tauri version when this is configured; do not place values in package metadata,
configuration, workflow plaintext, logs, or snapshots.

No endpoint, CI secret, tag, release, npm publication, or installer upload is configured by Phase 6.
