# Deployment profiles

ForgeKi generates deployment configuration. ForgeKi does not deploy applications in Phase 5.

The shared `@forgecli7/deployments` package accepts a portable project/workspace architecture, an environment profile, and a compatible target. It validates the request and returns one deterministic plan containing every previewed/exported file, SHA-256 hashes, readiness, warnings, and an architecture fingerprint. Commander and React are adapters over this package.

The initial profiles are Local, Staging, and Production. Initial file-generation targets are Docker Compose, Generic Docker, Kubernetes, Static Export, and Node Server. No target authenticates, contacts infrastructure, builds or pushes an image, starts services, or runs a deployment command.

The workflow is intentionally explicit: scan read-only, select profile and target, review readiness, preview exact files, choose an output directory, confirm, and export only when no collision or path-safety issue exists.

See [environments](environments.md), [targets](targets.md), [readiness](readiness.md), and [security](security.md).
