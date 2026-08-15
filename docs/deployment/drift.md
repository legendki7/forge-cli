# Drift detection

Optional `forgeki.deployment.json` metadata contains schema version, environment, target, deterministic architecture fingerprint, and SHA-256 hashes for generated files. It contains no timestamp, machine path, username, or secret.

The read-only scanner reports each tracked file as Matches ForgeKi plan, Modified since generation, Missing, or Unknown. Modified files are never overwritten. Regeneration blocks on every collision rather than merging.

The fingerprint covers services, frameworks, connections, environment schemas, and target. It excludes examples, secret values, machine paths, timestamps, and machine identity.
