# Deployment security

Deployment inputs use closed TypeScript models, bounded file reads, safe relative paths, native-selected directories, symlink rejection, exclusive temporary writes, collision blocking, deterministic trusted images, and fixed generators.

YAML scanning is read-only and does not construct objects or process custom tags. Oversized documents are skipped with warnings. Generation does not accept arbitrary YAML, shell, Kubernetes commands, Docker images, mounts, or plugin code.

Phase 3 community plugins remain restricted declarative data. Deployment contributions are deferred because a safe fragment schema requires a separate threat model and compatibility design. Plugins cannot bypass validation, contribute arbitrary deployment files, execute commands, access credentials, or make network calls.

ForgeKi does not authenticate, upload source, call external APIs, run cloud tools, store secrets, add telemetry, or add AI.
