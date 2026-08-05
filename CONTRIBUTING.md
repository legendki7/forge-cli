# Contributing to ForgeCLI

Thank you for contributing. Read the [architecture](docs/architecture.md), then:

1. Install a supported Node.js release and pnpm 9 or newer.
2. Run `pnpm install --frozen-lockfile`.
3. Create a focused branch and add tests at the narrowest useful boundary.
4. Add a Changeset for public package behavior.
5. Run `pnpm format:check`, `pnpm lint`, `pnpm test`, and `pnpm build`.
6. Run `pnpm release:inspect` for packaging or runtime dependency changes.

Do not include generated tarballs, credentials, fetched templates, or machine-specific paths. See
[the detailed contributor notes](docs/contributing.md) and [release checklist](docs/releasing.md).
