# ForgeKi

[![CI](https://github.com/legendki7/forge-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/legendki7/forge-cli/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Status: Beta](https://img.shields.io/badge/status-beta-orange.svg)

ForgeKi is an open-source developer tool for building and configuring projects through a visual
Desktop application or the `forge` CLI. It is local-first, deterministic, and extensible through a
restricted declarative plugin platform.

> **Beta / pre-release:** ForgeKi has no public release yet. Windows is the currently validated
> native Desktop platform; macOS and Linux native validation, production Marketplace hosting, and
> signed installers remain future work.

[English User Guide](docs/user-guide/README.md) ·
[دليل استخدام ForgeKi](docs/user-guide/README.ar.md) ·
[Documentation](docs/README.md) · [Contributing](CONTRIBUTING.md)

## Why ForgeKi?

- **Two interfaces, one engine:** Desktop and CLI reuse the same tested project logic.
- **Local-first:** project creation, scanning, planning, and generation happen on your machine.
- **Deterministic:** the same reviewed configuration produces the same file plan.
- **Non-destructive:** generators preview changes and preserve existing files.
- **Restricted extensions:** community plugins are declarative data, not executable code.
- **Private by design:** no account, telemetry, AI service, or project-source upload is required.

## Features

### ForgeKi Desktop

ForgeKi Desktop provides visual project creation, templates, Stack Builder, Workspace Builder,
project scanning, environment profiles, deployment-configuration previews, Marketplace views,
diagnostics, developer-tool checks, and safe Docker/GitHub Actions generation. It supports English
and العربية, including a complete RTL layout. Desktop users do not need to know the CLI.

### ForgeKi CLI

The `forge` executable provides the same core workflows for terminal and automation users:

```text
forge create               Create a project from a framework, template, or stack
forge check                Inspect a project using deterministic evidence
forge add docker           Add Docker files without overwriting existing files
forge add github-actions   Add project-aware GitHub Actions CI
forge stacks list          List built-in stack presets
forge workspace create     Generate a validated multi-service workspace
forge deployment plan      Preview deployment configuration
forge plugins list         Inspect built-in and local declarative plugins
forge doctor               Print safe runtime diagnostics
```

See the [CLI command reference](docs/commands.md) for the complete command surface.

## Supported technologies

Support means ForgeKi can model, detect, or generate configuration for the listed technology; it
does not install dependencies or deploy services.

| Category       | Current support                                  |
| -------------- | ------------------------------------------------ |
| Frameworks     | Next.js, React + Vite, Express                   |
| Language       | TypeScript                                       |
| Styling        | Plain CSS, Tailwind CSS                          |
| Databases      | PostgreSQL, SQLite                               |
| ORM            | Prisma, Drizzle                                  |
| Infrastructure | Redis                                            |
| Testing        | Vitest, Playwright                               |
| Tooling        | Docker, Git, GitHub Actions                      |
| Package tools  | pnpm, npm, Yarn, Bun                             |
| Deployment     | Docker, Kubernetes, static, and Node config only |

## Installation

### Current development access

ForgeKi is currently available by building the public source repository. No npm package or Desktop
installer has been published.

### Future public releases

When the owner publishes a reviewed prerelease, packages and installers will be linked from
[GitHub Releases](https://github.com/legendki7/forge-cli/releases). Until a release exists, avoid
unofficial installers and package names.

## Build from source

Prerequisites:

- Node.js 20, 22, or 24
- pnpm 9 or newer (the workspace pins pnpm 10.15.0)
- Rust and Cargo for native Desktop development
- Tauri 2 platform prerequisites; Windows builds require WebView2 and Microsoft C++ build tools

ForgeKi does not install system prerequisites automatically. See the
[Desktop development guide](docs/desktop.md#development-setup) and official
[Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

```bash
git clone https://github.com/legendki7/forge-cli.git
cd forge-cli
pnpm install --frozen-lockfile
pnpm desktop:dev
```

For CLI development:

```bash
pnpm build
pnpm dev --help
pnpm dev check
```

## Quick start

After building the workspace, run the CLI package directly:

```bash
pnpm --filter @forgecli7/cli start -- --help
pnpm dev create my-app --no-git
pnpm dev add docker
```

ForgeKi never installs generated-project dependencies. Review the created files, then install them
with the package manager selected for that project.

## Architecture

ForgeKi is a pnpm monorepo with deliberately narrow package boundaries:

| Path                   | Responsibility                                                         |
| ---------------------- | ---------------------------------------------------------------------- |
| `apps/desktop`         | React/Tauri application and typed native bridge                        |
| `packages/cli`         | Commander commands, Inquirer prompts, and Chalk output                 |
| `packages/core`        | Shared contracts, project detection, and stack compatibility           |
| `packages/templates`   | Deterministic project templates and generation plans                   |
| `packages/plugins`     | Built-in registry, declarative plugin storage, and safe loading        |
| `packages/plugin-sdk`  | Closed declarative manifest schema and validators                      |
| `packages/workspaces`  | Multi-service models, generation, and scanning                         |
| `packages/deployments` | Environment profiles, readiness, config generation, export, and drift  |
| `packages/marketplace` | Signed metadata, restricted networking, cache, revocation, and updates |

Desktop and CLI reuse the same core business logic. React, Commander, and Tauri remain adapters
around shared deterministic packages. Read the [architecture guide](docs/architecture.md) for the
trust boundaries and dependency flow.

## Security and privacy

- Community plugins are closed-schema declarative manifests; ForgeKi does not import their code or
  allow arbitrary shell execution.
- File generation rejects traversal and unsafe links, previews changes, and preserves user files.
- Marketplace networking is allowlisted and signed metadata is verified before use. Production
  Marketplace and updater providers are not configured yet.
- Marketplace requests do not include project source, local paths, environment values, or secrets.
- ForgeKi has no telemetry and no AI integration.

See the [security policy](SECURITY.md), [plugin security model](docs/plugins/security.md),
[Marketplace privacy model](docs/marketplace/privacy.md), and
[deployment security guide](docs/deployment/security.md). Report vulnerabilities privately using
the process in `SECURITY.md`, never through a public issue.

## Plugin platform

Trusted built-ins implement executable hooks such as Docker and GitHub Actions generation. Community
plugins use `forgeki.plugin.json` and may contribute only allowlisted files, metadata, safe scripts,
environment schemas, templates, stack components, and bounded scanner rules.

`@forgecli7/plugin-sdk` exists in this monorepo and is prepared for future publication; do not assume
it is available from npm yet. Start with the [plugin development guide](docs/plugins/development.md)
and the small [EditorConfig example](examples/plugins/editorconfig/README.md).

## Development

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm test
pnpm build
pnpm desktop:check
pnpm desktop:test
pnpm docs:check
```

Rust tests can be run from `apps/desktop/src-tauri` with `cargo test`. Native builds additionally
require the platform toolchain documented in the Desktop guide.

## Contributing and support

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md), the
[good first issue guide](docs/contributing/good-first-issues.md), and the
[Code of Conduct](CODE_OF_CONDUCT.md). Large or security-sensitive changes should begin with an
issue so scope and trust-boundary implications can be reviewed first.

- Use [GitHub Issues](https://github.com/legendki7/forge-cli/issues) for reproducible bugs and
  focused feature requests.
- Use the private process in [SECURITY.md](SECURITY.md) for vulnerabilities.
- Do not post secrets, private project content, or unsanitized diagnostics.

Repository-owner setup and branch-protection recommendations are documented in
[GitHub repository setup](docs/github-repository-setup.md).

## Roadmap

ForgeKi is maintainer-led and does not promise dates. Near-term possibilities include macOS/Linux
native validation, signed Windows installers, production Marketplace/updater hosting, additional
frameworks, and community ecosystem improvements. See the [roadmap](docs/roadmap.md).

## License and attribution

ForgeKi is fully open source under the [MIT License](LICENSE). Dependency attribution is available
in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md); release candidates also generate an exact SBOM
and license inventory for maintainer review.
