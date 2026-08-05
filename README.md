# ForgeKi

ForgeKi is an open-source, TypeScript-based command-line toolkit for scaffolding and configuring
development projects. It provides a modular CLI shell, stable extension contracts, and dedicated
packages for templates and plugins.

ForgeKi now has two local interfaces over the same tested project engine:

- **ForgeKi Desktop** is a local developer studio for creating, inspecting, and configuring
  development projects without using a terminal.
- **ForgeKi CLI** is the `forge` terminal interface for automation and advanced users.

ForgeKi Desktop is an MVP under active development. Native installers are not publicly available,
and production readiness or cross-platform support is not yet claimed.

## Product identity

- Product: **ForgeKi**
- npm scope: **`@forgecli7`**
- CLI command: **`forge`**
- Desktop application: **ForgeKi Desktop**
- Source repository: **https://github.com/legendki7/forge-cli**

> **Beta status:** ForgeKi is preparing for its first public prerelease. APIs and generated output
> may change before a stable release. It scaffolds deterministic Next.js, React/Vite, and Express
> TypeScript projects and provides visual stack planning, project detection, Docker configuration,
> and GitHub Actions CI generation.

## Highlights

- Type-safe Node.js CLI built with Commander.js, Inquirer, and Chalk
- pnpm workspace with independently versioned packages
- Typed, automatically loaded plugin registry
- Project detection for Next.js, React/Vite, Express, and generic Node.js projects
- Safe and idempotent plugin application
- Project-aware GitHub Actions CI generation
- Fast builds with tsup and tests with Vitest
- Shared ESLint and Prettier configuration
- Changesets-ready release workflow and GitHub Actions CI
- Five deterministic, offline Next.js templates shared by CLI and Desktop
- Local project scanning, rule-based recommendations, developer-tool checks, and activity history
- Offline Visual Stack Builder with shared compatibility rules, architecture review, and file preview
- Deterministic React/Vite and Express generation with optional Tailwind, database, ORM, and tests

## Requirements

- Node.js 20, 22, or 24
- pnpm 9 or newer

ForgeKi supports the maintained Node.js majors exercised by CI: 20, 22, and 24. Unsupported
versions fail at startup with an actionable message.

## Installation

The intended package name is `@forgecli7/cli`, but scope ownership and npm availability must be
confirmed manually before release. Until then, treat this command as a placeholder:

```bash
npm install --global @forgecli7/cli
forge --version
```

The npm package name may change after the availability check; the executable will remain `forge`.

## Getting started

```bash
git clone https://github.com/legendki7/forge-cli.git
cd forge-cli
pnpm install
pnpm build
pnpm --filter @forgecli7/cli start -- --help
```

During development, run the CLI directly from TypeScript:

```bash
pnpm dev -- create my-app --no-git
pnpm dev -- add docker
pnpm dev -- check
pnpm dev -- stacks list
pnpm dev -- create api --framework express --database sqlite --orm drizzle --testing vitest
```

Run `forge add docker` from a Node.js project to create a starter `Dockerfile` and `.dockerignore`.
Existing files are always preserved, so the command is safe to run repeatedly.

## Commands

| Command                    | Responsibility                                                 |
| -------------------------- | -------------------------------------------------------------- |
| `forge create [name]`      | Scaffold a trusted framework, preset, or explicit stack        |
| `forge stacks list`        | List deterministic built-in stack presets                      |
| `forge stacks show <id>`   | Inspect a built-in preset and its resolved components          |
| `forge add docker`         | Add non-destructive Docker configuration                       |
| `forge add github-actions` | Add non-destructive, script-aware GitHub Actions CI            |
| `forge add`                | List the currently available plugins                           |
| `forge check`              | Report project framework, language, package manager, and files |

## Repository layout

```text
forge-cli/
|-- apps/
|   `-- desktop/                # React, Tauri, and typed Node worker bridge
|-- packages/
|   |-- cli/                    # Commands and terminal presentation
|   |-- core/                   # Shared contracts and domain types
|   |-- templates/              # Template registry boundary
|   `-- plugins/                # Plugin registry and loading
|       `-- plugin-docker/      # Built-in Docker plugin
|       `-- plugin-github-actions/ # Built-in GitHub Actions plugin
|-- docs/                       # Architecture and contributor documentation
|-- examples/                   # Usage examples and future fixtures
`-- tests/                      # Cross-package and CLI composition tests
```

Dependencies flow inward: plugin contracts live in `core`, individual plugins implement those
contracts without importing the CLI, and `@forgecli7/plugins` loads built-ins into a registry. The
CLI resolves plugins through that registry, so future implementations can be added without changing
command parsing.

The [Visual Stack Builder guide](docs/stack-builder.md) documents the supported components,
compatibility rules, presets, shared generation plan, scanner evidence, CLI usage, and security model.

## ForgeKi Desktop

ForgeKi Desktop opens on a persistent local application shell with Home, Create Project, Templates,
Stack Builder, Scan Project, Plugins, Developer Tools, Activity, and Settings pages. Its creation wizard
uses the same project-name validation, scaffolder, detection engine, and trusted built-in plugins as
the CLI. It never installs project dependencies.

Built-in templates are Blank Next.js App, Next.js Dashboard, Next.js Blog, Next.js Portfolio, and
Next.js Landing Page. They use TypeScript, App Router, local CSS, deterministic content, and no
remote runtime assets. The Templates page supports local search, category and difficulty filters,
details, and preselection into the wizard.

The scanner reports framework, language, package manager, scripts, recognized files, dependency
counts, warnings, Docker state, and GitHub Actions state. Recommendations are deterministic rules;
ForgeKi does not claim vulnerability findings. Docker and GitHub Actions can be applied only after a
file preview and confirmation, with existing files preserved.

Developer-tool checks are requested explicitly and limited to a backend allowlist. Settings,
recent projects, and the latest 200 activity entries are stored locally in the Tauri application
data directory. Beginner mode is concise; Advanced mode adds safe metadata, expected scripts, file
previews, and configuration details without changing validation.

```bash
pnpm desktop:dev
pnpm desktop:check
pnpm desktop:test
pnpm desktop:build
```

Desktop development requires Rust and the platform prerequisites documented in
[the desktop guide](docs/desktop.md). `desktop:check` and `desktop:test` are headless; the native
build command reports missing prerequisites and never installs them automatically.

ForgeKi Desktop requires no account, API key, external API, cloud service, analytics, telemetry, or
AI feature. Project source contents are not persisted or uploaded.

## Plugin API

Every plugin exposes `id`, `name`, `description`, `detect()`, and `apply()`. Detection reports the
current project state; application returns structured status, created-file, and skipped-file data.
Plugins should use exclusive file creation and preserve user-owned files.

The built-in GitHub Actions plugin writes `.github/workflows/ci.yml`. It supports pnpm, npm, Yarn,
and Bun, runs only the available `lint`, `typecheck`, `test`, and `build` scripts, and uses Node.js
20/22 for Node-based package managers. Existing workflow files are never modified.

## Project detection

`forge check` reads project evidence from `package.json`, dependencies, configuration files,
lockfiles, and source extensions. Supported framework results are Next.js, React with Vite,
Express, generic Node.js, and unknown. TypeScript is detected from `tsconfig.json`, TypeScript
dependencies, or `.ts`/`.tsx` source; otherwise recognizable JavaScript projects report JavaScript.

Package managers are detected from lockfiles first, then the valid `packageManager` field in
`package.json`. If several lockfiles exist, ForgeKi reports a warning and uses the deterministic
priority `pnpm > npm > yarn > bun`. A conflicting lockfile wins with a warning. Malformed or missing
package metadata produces warnings rather than exceptions.

Detection currently targets Node.js projects and does not infer monorepo subprojects, runtime ports,
custom build pipelines, or application entry points. See [CLI commands](docs/commands.md) for output
and Docker-generation details.

## Creating a project

```bash
forge create
forge create my-app
forge create my-app --interactive
forge create my-app --package-manager npm --no-git
forge create my-app --docker --github-actions
```

Omitting the name starts an interactive wizard. `--interactive` (or `-i`) also enables the wizard
when a name is supplied. Explicit flags are preserved and their questions are skipped; ForgeKi asks
only for missing values, shows a summary, and asks for confirmation before writing files. Next.js is
the only framework currently supported, so it is selected without a framework question.

`forge create my-app` remains fully non-interactive for scripts and CI. Its defaults are Next.js,
pnpm, Git enabled, Docker disabled, and GitHub Actions disabled. npm, Yarn, and Bun are also supported.
ForgeKi does not install dependencies or fabricate lockfiles. Git initialization runs `git init`
only. Use `--no-git`, `--no-docker`, and `--no-github-actions` to explicitly disable features in a
partially or fully specified interactive command.

Names are restricted to safe single-directory names. New projects are staged before atomic exposure;
existing empty directories use exclusive creation locking. Existing files, non-empty directories,
symbolic-link destinations, absolute paths, and traversal are rejected.

## Development

```bash
pnpm dev          # Run the CLI source
pnpm build        # Build every workspace package
pnpm lint         # Run ESLint across the repository
pnpm format       # Format supported files with Prettier
pnpm test         # Run the Vitest suite once
pnpm test:watch   # Run Vitest in watch mode
pnpm desktop:check # Validate the desktop UI, bridge, types, and Tauri configuration
```

## Releases

ForgeKi uses [Changesets](https://github.com/changesets/changesets) to describe and publish package
versions. `pnpm release:inspect` builds and validates the actual package tarballs without publishing;
`pnpm release:smoke` installs them into an isolated temporary directory and exercises the packed
CLI. `pnpm release:verify` performs the complete non-publishing release-candidate audit and remains
blocked until repository identity is configured. Publishing is intentionally separate and opt-in.
See [the release checklist](docs/releasing.md) and
[current candidate report](docs/release-candidate-report.md) for the beta process.

## Contributing

Contributions are welcome. Keep new behavior in the package that owns the relevant concern, add
tests for public behavior, and ensure `pnpm lint`, `pnpm test`, and `pnpm build` pass before opening
a pull request. See [CONTRIBUTING.md](CONTRIBUTING.md) and
[`docs/architecture.md`](docs/architecture.md) for package boundaries.

## Roadmap

- Community plugin marketplace
- Visual stack builder
- Additional frameworks
- macOS native validation
- Linux native validation
- Signed Windows installers
- Automatic updates

### Beta feedback

Beta testers can [open a bug report](https://github.com/legendki7/forge-cli/issues/new?template=bug_report.yml).
Please include your operating system, Node.js version, package manager, command executed, expected
behavior, actual behavior, sanitized error output, and whether the issue reproduces. Remove project
secrets, tokens, usernames, and absolute paths before posting.

## License

ForgeKi is available under the [MIT License](LICENSE).
