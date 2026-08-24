# @forgecli7/core

## 0.2.0

### Minor Changes

- 7d8a66c: Add typed built-in template and plugin catalogs for ForgeKi Desktop, including five deterministic offline Next.js templates and package-derived plugin metadata.
- bd41f73: Add offline Next.js TypeScript scaffolding through `forge create`, with safe destination handling,
  package-manager metadata detection, optional Git initialization, and Docker/GitHub Actions plugin
  orchestration.
- 48f749c: Add ForgeKi's declarative plugin platform: a versioned SDK, validated local storage with integrity
  checks, offline Marketplace providers, Stack Builder and scanner contributions, plugin-management CLI
  commands, bundled examples, and security-focused validation.
- 579e4b9: Expose the browser-safe project-name validator used by the private ForgeKi Desktop application.
- d6d8f83: Add the shared Visual Stack Builder registry, compatibility engine, deterministic generation plans,
  React/Vite and Express foundations, expanded detection, and safe CLI stack commands.

### Patch Changes

- bd41f73: Add project-aware GitHub Actions CI generation through `forge add github-actions`, including shared
  race-safe file creation, package-manager-specific setup, script-aware validation steps, and
  non-destructive handling of existing workflows.
- bd41f73: Prepare coordinated packages for a safe public beta with package-derived version output, enforced
  Node.js support, publish metadata, explicit tarball inspection, packed-install smoke validation,
  release governance, and opt-in Changesets publishing.
