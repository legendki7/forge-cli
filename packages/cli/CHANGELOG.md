# @forgecli7/cli

## 0.2.0

### Minor Changes

- 0347c60: Add the shared multi-service workspace model, validator, atomic generator, read-only scanner, built-in presets, CLI commands, and ForgeKi Desktop Workspace Builder foundation.
- bd41f73: Add project-aware GitHub Actions CI generation through `forge add github-actions`, including shared
  race-safe file creation, package-manager-specific setup, script-aware validation steps, and
  non-destructive handling of existing workflows.
- 81a684c: Add shared environment schemas, deterministic deployment profiles, readiness and compatibility validation, Docker/Kubernetes/static/Node configuration generation, collision-safe export, drift scanning, and deployment CLI commands.
- bd41f73: Add offline Next.js TypeScript scaffolding through `forge create`, with safe destination handling,
  package-manager metadata detection, optional Git initialization, and Docker/GitHub Actions plugin
  orchestration.
- bd41f73: Add an interactive `forge create` wizard with partial-option prompting, a confirmation summary,
  non-TTY safeguards, and injectable prompt and process adapters while preserving named command
  automation.
- 2d5df52: Add privacy-safe `forge doctor` diagnostics and the coordinated public Beta release foundation.
- 48f749c: Add ForgeKi's declarative plugin platform: a versioned SDK, validated local storage with integrity
  checks, offline Marketplace providers, Stack Builder and scanner contributions, plugin-management CLI
  commands, bundled examples, and security-focused validation.
- bd41f73: Prepare coordinated packages for a safe public beta with package-derived version output, enforced
  Node.js support, publish metadata, explicit tarball inspection, packed-install smoke validation,
  release governance, and opt-in Changesets publishing.
- 691e1b4: Add the trusted remote Marketplace protocol, verified declarative package pipeline, revocation,
  offline cache, Marketplace CLI, and secure application update-checking foundations.
- d6d8f83: Add the shared Visual Stack Builder registry, compatibility engine, deterministic generation plans,
  React/Vite and Express foundations, expanded detection, and safe CLI stack commands.

### Patch Changes

- Updated dependencies [0347c60]
- Updated dependencies [bd41f73]
- Updated dependencies [7d8a66c]
- Updated dependencies [81a684c]
- Updated dependencies [bd41f73]
- Updated dependencies [690793a]
- Updated dependencies [48f749c]
- Updated dependencies [bd41f73]
- Updated dependencies [579e4b9]
- Updated dependencies [691e1b4]
- Updated dependencies [d6d8f83]
  - @forgecli7/workspaces@0.2.0
  - @forgecli7/plugins@0.2.0
  - @forgecli7/core@0.2.0
  - @forgecli7/templates@0.2.0
  - @forgecli7/deployments@0.2.0
  - @forgecli7/plugin-sdk@0.2.0
  - @forgecli7/marketplace@0.2.0
