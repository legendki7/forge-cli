# Contributing to ForgeKi

Thank you for helping improve ForgeKi. Contributions should remain focused, deterministic,
local-first, and consistent with the project security boundaries.

Please follow the [Code of Conduct](CODE_OF_CONDUCT.md). For approachable contribution categories,
see [good first issues](docs/contributing/good-first-issues.md).

## Before starting

- Search existing issues before opening a duplicate.
- Open an issue before a large feature, architecture change, or security-sensitive change so scope
  can be agreed before implementation.
- Report vulnerabilities privately through [SECURITY.md](SECURITY.md), not in an issue or pull
  request.
- Read the [architecture](docs/architecture.md) and detailed
  [package contribution notes](docs/contributing.md) for the area you plan to change.

## Development workflow

1. Fork the repository and clone your fork.
2. Create a focused branch from the latest `main`.
3. Install Node.js 20, 22, or 24 and pnpm 9 or newer.
4. Run `pnpm install --frozen-lockfile`.
5. Make the smallest coherent change and add tests at the narrowest useful boundary.
6. Add a Changeset when public package behavior changes.
7. Run the relevant verification commands.
8. Open a pull request explaining what changed, why, tests performed, and security implications.

Do not commit generated tarballs, installers, build output, credentials, private project data,
machine-specific paths, or signing material.

## Verification

Every contribution should pass:

```bash
pnpm format:check
pnpm lint
pnpm test
pnpm build
pnpm docs:check
```

Desktop changes also require `pnpm desktop:check` and `pnpm desktop:test`. Run
`pnpm desktop:build` only when the Rust and platform prerequisites are installed. Packaging or
runtime dependency changes should also run `pnpm release:inspect`.

## Contribution types

- **Code:** keep shared behavior in its owning package; CLI and Desktop should remain adapters.
- **Plugins:** community contributions must remain declarative and must not execute author code or
  arbitrary shell commands. Follow the [plugin development guide](docs/plugins/development.md).
- **Documentation:** update both navigation and related guides; run `pnpm docs:check`.
- **Translations:** preserve stable identifiers and product names, and follow the
  [Arabic terminology guide](docs/localization/ar-terminology.md).

## Sensitive areas

Changes to Marketplace cryptography, updater trust, plugin permissions, network restrictions, path
safety, deployment generation, or release infrastructure require explicit maintainer review and
dedicated adversarial tests. A valid pull request must not weaken a security boundary for
convenience.

## Pull requests

Keep pull requests small enough to review. Link the relevant issue when one exists, document user-
visible behavior, include screenshots for UI changes, and state whether security/privacy behavior
changed. Maintainers may request narrower scope or additional verification before merging.
