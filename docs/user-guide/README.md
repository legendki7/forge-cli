# ForgeKi User Guide

**English** | [العربية](./README.ar.md)

[ForgeKi repository](../../README.md) · [Security](../../SECURITY.md) ·
[Contributing](../../CONTRIBUTING.md)

ForgeKi is an open-source desktop development tool that helps you create, configure, inspect, and
prepare software projects without assembling every configuration file by hand. You can use the
graphical **ForgeKi Desktop** application for the complete visual workflow or the `forge` CLI when a
terminal is more convenient. Beginners can use Desktop without learning the CLI.

> **Beta notice:** ForgeKi is preparing for its first public prerelease. Generated output, APIs, and
> plugin schemas may change before a stable release. Windows is the validated native Desktop
> platform. Production Marketplace and update providers are not configured.

## Contents

- [What ForgeKi can do](#what-forgeki-can-do)
- [Requirements and installation](#requirements-and-installation)
- [Your first project](#creating-your-first-project)
- [Stack and Workspace builders](#visual-stack-builder)
- [Scanning, recommendations, and plugins](#project-scanner)
- [Environments and deployment](#environment-profiles)
- [Settings, security, and privacy](#settings)
- [CLI guide](#cli-introduction)
- [Troubleshooting](#troubleshooting)
- [FAQ](#faq)

## What ForgeKi can do

ForgeKi can:

- create deterministic TypeScript projects from five local Next.js starter templates;
- assemble Next.js, React/Vite, or Express projects in the Visual Stack Builder;
- model and generate multi-service workspaces;
- scan existing projects without executing their code;
- add Docker and GitHub Actions configuration without overwriting existing files;
- validate and install restricted declarative plugins;
- inspect a signed remote Marketplace when an official provider is configured;
- model Local, Staging, and Production environment-variable schemas;
- generate and preview Docker, Kubernetes, static, and Node deployment configuration;
- check developer tools, security state, updates, and local activity; and
- export privacy-safe diagnostics or run `forge doctor`.

ForgeKi does **not** host or deploy applications, operate Kubernetes clusters, provision cloud
infrastructure, install project dependencies, run arbitrary Marketplace code, or use AI.

## Requirements and installation

### Running ForgeKi Desktop

An installed ForgeKi Desktop application contains the runtime it needs to launch. Normal users do
not need Rust, Cargo, pnpm, or a separate Node.js installation merely to open it. Windows is the only
native Desktop platform currently validated by the project. The repository does not claim a minimum
Windows version or validated macOS/Linux Desktop support.

### Developing generated projects

The project you generate has its own requirements. Most generated projects need a supported Node.js
version and the package manager you selected: pnpm, npm, Yarn, or Bun. Git is needed only when you
want repository initialization. Docker is needed only to build or run generated container assets.
The **Developer Tools** page checks these tools without installing them.

The ForgeKi CLI itself supports Node.js 20, 22, and 24. Repository contributors also use pnpm 9 or
newer; see [CONTRIBUTING.md](../../CONTRIBUTING.md) for contributor setup.

### Installing on Windows

The intended installation flow is:

```text
GitHub repository
→ Releases
→ latest appropriate ForgeKi release
→ download the ForgeKi setup executable
→ run the installer
→ launch ForgeKi
```

**Public installer releases may not be available yet. Check the
[Releases section](https://github.com/legendki7/forge-cli/releases) of the repository.** Do not
download an installer from an unrelated source.

Current Beta installers are not Authenticode-signed. Windows SmartScreen may therefore show an
unknown-publisher or reputation warning. Confirm that the download came from the official repository
and review its published checksum when one is provided. Do not disable Windows security globally.

## First launch

ForgeKi opens on **Home**. The sidebar provides Home, Create Project, Templates, Stack Builder,
Workspace Builder, Environments, Deployment, Scan Project, Marketplace, Security, Developer Tools,
Activity, About, and Settings. Home offers quick actions and locally stored recent projects,
workspaces, and activity. The sidebar can be collapsed.

The default theme follows your system; choose System, Light, or Dark in Settings. The default user
mode is Beginner. ForgeKi has no sign-in screen, cloud account, analytics prompt, or telemetry setup.

## Beginner Mode and Advanced Mode

**Beginner Mode** emphasizes plain-language choices and hides secondary metadata. It is a good place
to start when you know the result you want but not every underlying package.

**Advanced Mode** exposes additional safe details such as dependency versions, scripts, environment
schemas, file ownership, and exact previews. It does not weaken validation, permissions, or security
boundaries. Databases and ORMs are never selected automatically.

Change the mode in **Settings → Project defaults → User mode**.

## Creating your first project

Open **Create Project** or choose **Create a project** on Home. The wizard writes nothing until you
confirm it.

1. **Project** — enter a lowercase npm-compatible project name, choose a parent destination folder,
   and review the final path.
2. **Template** — choose one of the five built-in Next.js templates.
3. **Tooling** — select pnpm, npm, Yarn, or Bun, then optionally enable **Initialize Git
   repository**, **Add Docker configuration**, and **Add GitHub Actions CI**.
4. **Review** — check the path, template, package manager, optional tools, and expected file list.
5. **Create** — select **Confirm and create**. ForgeKi validates the request, creates files through a
   safe staging process, and reports each operation.

ForgeKi creates source files and configuration only. It does not install dependencies. On success,
use **Open project folder** or **Copy project path**, then run the displayed install and development
commands yourself. A destination that already contains files is rejected rather than overwritten.

## Templates

All built-in templates use Next.js App Router, TypeScript, local CSS, deterministic content, and no
remote runtime assets. They are starter foundations, not complete production applications.

| Template                 | Best for                        | Included foundation                                       |
| ------------------------ | ------------------------------- | --------------------------------------------------------- |
| **Blank Next.js App**    | A clean starting point          | Minimal App Router page and local CSS                     |
| **Next.js Dashboard**    | Admin panels and internal tools | Responsive navigation, metrics, and a sample table        |
| **Next.js Blog**         | Content-oriented sites          | Local sample posts, post routes, metadata, and typography |
| **Next.js Portfolio**    | Personal or project showcases   | Introduction, projects, skills, and contact placeholders  |
| **Next.js Landing Page** | Product or service pages        | Hero, feature grid, call to action, and footer            |

The **Templates** page can search and filter the catalog before opening the creation wizard.

## Visual Stack Builder

A **Stack** is the technology and tooling for one application. The Stack Builder lets you choose
those pieces visually, validates compatibility, and prepares the files that represent the selection.

The built-in catalog contains:

- frameworks: Next.js, React + Vite, and Express;
- language/runtime: TypeScript and Node.js;
- styling: Plain CSS and Tailwind CSS;
- data: PostgreSQL or SQLite with Prisma or Drizzle;
- testing: Vitest and Playwright; and
- tooling: Git, Docker, and GitHub Actions.

Select components from the catalog and inspect the architecture tree and component details. ForgeKi
marks required components, explains unsupported choices, and blocks conflicts such as two databases,
Prisma without a database, or server database tools on React/Vite. The review shows the exact file
tree and file contents from the same plan used for generation. You can also load a preset or save a
bounded local preset. Existing files are not overwritten and dependencies are not installed.

## Stack presets

| Preset ID              | Name                   | Intended use and major technologies                                                 |
| ---------------------- | ---------------------- | ----------------------------------------------------------------------------------- |
| `nextjs-starter`       | Next.js Starter        | General web starting point: Next.js, TypeScript, CSS, Vitest, Git, CI               |
| `nextjs-fullstack`     | Next.js Full Stack     | Full-stack foundation: Tailwind, PostgreSQL, Prisma, Vitest, Playwright, Docker, CI |
| `nextjs-dashboard`     | Next.js Dashboard      | Dashboard template with Tailwind, Vitest, Docker, and CI                            |
| `react-frontend`       | React Frontend         | Client application with React/Vite, Tailwind, Vitest, Playwright, Git, CI           |
| `express-api`          | Express API            | Minimal TypeScript API with Vitest, Docker, Git, and CI                             |
| `express-postgres-api` | Express PostgreSQL API | Express API with PostgreSQL, Drizzle, Vitest, Docker, Git, and CI                   |

## Workspace Builder

A Project or Stack describes one application. A **Workspace** describes a local monorepo containing
multiple services and the relationships between them. For example:

```text
Web App
   ↓ HTTP
API
   ↓ DATABASE
PostgreSQL
```

The service catalog includes Next.js, React + Vite, Express API, PostgreSQL, SQLite, Redis, and a
shared TypeScript library. Supported connections are:

- `HTTP`: a web application calls an API;
- `DATABASE`: Express or server-capable Next.js uses PostgreSQL or SQLite;
- `CACHE`: Express or server-capable Next.js uses Redis; and
- `SHARED_PACKAGE`: a web or API service uses the shared TypeScript library.

The canvas plans deterministic ports and environment-variable definitions. React/Vite cannot connect
directly to a database or Redis. Duplicate, self-referencing, missing-endpoint, and unsupported
connections are rejected. Review the architecture, exact files, Docker Compose plan, CI plan, and
environment matrix before generation. ForgeKi creates a `forgeki.workspace.json` model and service
folders, but does not install dependencies, start containers, or deploy anything.

## Workspace presets

| Preset ID             | Name                  | Useful for                                                      |
| --------------------- | --------------------- | --------------------------------------------------------------- |
| `full-stack-starter`  | Full Stack Starter    | React frontend connected to an Express API                      |
| `full-stack-postgres` | Full Stack PostgreSQL | React, Express, and PostgreSQL foundation                       |
| `nextjs-full-stack`   | Next.js Full Stack    | Server-capable Next.js connected directly to PostgreSQL         |
| `saas-foundation`     | SaaS Foundation       | React, Express, PostgreSQL, Redis, shared types, Docker, and CI |
| `api-platform`        | API Platform          | Express, PostgreSQL, Redis, Docker, and CI                      |

## Project Scanner

Open **Scan Project**, choose a project directory, and select **Scan project**. Scanning is read-only
and configuration-based: ForgeKi reads bounded known files such as `package.json`, lockfiles, and
recognized configuration paths. It does not execute project scripts or unknown source code.

The result can identify the project name, Next.js/React-Vite/Express/generic Node framework,
TypeScript or JavaScript, package manager, scripts, dependencies, recognized files, Docker, GitHub
Actions, built-in plugin state, supported stack components, warnings, and installed declarative-plugin
scanner evidence. Detection may be **Detected**, **Likely detected**, **Conflicting**, or unknown when
evidence is incomplete.

## Recommendations

Recommendations are deterministic/rule-based. **ForgeKi does not send your project to an AI
service.** Current examples include missing Docker configuration, missing GitHub Actions CI, no
recognized test/lint/typecheck script, multiple package-manager lockfiles, and confirmation that
TypeScript configuration exists. You decide whether to apply a supported recommendation; dismissals
are stored locally.

## Plugins

Plugins extend the files and configuration ForgeKi can generate:

- **Built-in plugins** are trusted TypeScript implementations shipped with ForgeKi. Docker and GitHub
  Actions are the current built-ins.
- **Community plugins** are restricted declarative packages from bundled examples, local imports, or
  a configured remote Marketplace.
- **Developer plugins** are local declarative projects you create and validate before sharing.

Community plugins are data, not programs. They cannot execute JavaScript, shell commands, lifecycle
scripts, binaries, arbitrary processes, deployment actions, or ForgeKi network APIs. Their declared
permissions cover bounded actions such as generating safe files, adding registry dependencies or
scripts, defining environment schemas, adding Stack components, and adding conservative scanner
rules. Every matching contribution must declare its permission and pass validation.

See the [plugin overview](../plugins/overview.md), [manifest reference](../plugins/manifest.md), and
[security model](../plugins/security.md) for advanced details.

## Marketplace

The **Marketplace** page has **Installed**, **Built-in**, **Community**, and **Developer** tabs. You
can inspect details, frameworks, categories, permissions, integrity, install state, and compatibility.
Built-in plugins remain available offline. Bundled community examples are previews until installed.

Publisher labels include **ForgeKi**, **Verified Publisher**, **Community Publisher**, **Revoked**,
and **Unknown** where applicable. A valid signature proves which key signed the plugin; it does not
automatically mean ForgeKi endorses the plugin. Declarative safety validation always runs.

Remote Marketplace metadata is verified before it replaces the local cache. Search uses that local
verified index. A failed refresh preserves a previously verified cache, so cached information may be
available offline. Revoked or corrupted installed plugins are disabled for new generation.

The production remote Marketplace is currently unconfigured. Remote availability depends on the
provider configured by an official ForgeKi release. The page reports this state rather than falling
back to an untrusted service. See [Marketplace security](../marketplace/overview.md).

## Installing a plugin

1. Open Marketplace and choose a Built-in, Community, or Developer entry.
2. Select **View details** and inspect the publisher and supported frameworks.
3. Review the requested permissions and declared contributions.
4. For remote entries, verify that signature, digest, revocation, and compatibility checks passed.
5. Review the exact changes and safety report.
6. Confirm the installation or built-in application.
7. ForgeKi validates the package again, stages it in quarantine, and installs only declarative data.

Local community plugins must be enabled in Settings. Applying a built-in requires selecting a target
project. Existing files are preserved. Removing a plugin removes its installed metadata, not files it
previously generated in projects.

## Plugin updates

An update review shows the installed and available versions, publisher status, integrity, and any new
permissions. Permission expansion requires a separate explicit confirmation. ForgeKi verifies and
installs the selected update atomically; it does not silently upgrade a plugin when generated output
or permissions may change. A revoked update or publisher is blocked.

## Environment Profiles

ForgeKi models **Local**, **Staging**, and **Production** profiles. A variable definition describes a
name, purpose, owner, whether it is required, whether it is secret, and which profiles use it. A
secret value is the real password, token, or credential. ForgeKi stores the definitions, not your
production secret values.

The **Environments** page shows profile cards, ownership, Public/Secret and Required/Optional badges,
workspace topology, comparisons, and drift state. Generated `.env*.example` files contain safe public
examples or blank secret assignments. ForgeKi does not generate a real `.env` file.

## Deployment

ForgeKi **generates deployment configuration**; it does not deploy to a cloud, authenticate to a
provider, run `kubectl`, start services, build or push images, or provision infrastructure.

Supported targets are **Docker Compose**, **Generic Docker**, **Kubernetes**, **Static Export**, and
**Node Server**. Compatibility depends on the scanned project or workspace. The workflow is:

| Target ID        | Generated foundation                        |
| ---------------- | ------------------------------------------- |
| `docker-compose` | Multi-service Docker configuration          |
| `generic-docker` | Production-oriented Dockerfiles             |
| `kubernetes`     | Starter manifests for manual review and use |
| `static-export`  | Static frontend hosting metadata            |
| `node-server`    | Generic Node runtime instructions           |

1. select or scan a project/workspace;
2. choose Local, Staging, or Production and a compatible target;
3. review readiness errors and warnings;
4. preview the exact deterministic files;
5. choose a separate export directory and confirm; and
6. export only when paths are safe and no files collide.

Optional `forgeki.deployment.json` metadata records an architecture fingerprint and generated-file
hashes without paths, usernames, timestamps, or secrets. A later scan reports matching, modified,
missing, or unknown files. Modified files are never overwritten. See the
[deployment guide](../deployment/overview.md).

## Docker

For a single project, enabling Docker generates a framework-aware `Dockerfile` and `.dockerignore`.
Existing files are skipped rather than overwritten. A multi-service Workspace can additionally
generate root Docker Compose configuration and per-service Docker assets.

Generation does not start Docker, build an image, push an image, or authenticate to a registry. Use
the preview and then run Docker yourself after reviewing the files.

## GitHub Actions

Enabling GitHub Actions generates `.github/workflows/ci.yml`. For project plugins, ForgeKi detects
available package scripts and includes supported lint, typecheck, test, and build steps where present.
Workspace CI runs the workspace validation scripts. The workflow is continuous integration only;
ForgeKi does not generate a cloud deployment workflow.

## Developer Tools

Select **Check tools** on the Developer Tools page to run fixed, allowlisted version checks for
Node.js, npm, pnpm, Yarn, Bun, Git, Docker, VS Code, Rust, and Cargo. Node.js is marked required for
JavaScript development; the other tools are optional and depend on your workflow.

- **Installed/Available** means the fixed version command succeeded.
- **Not detected/Missing** means the command was not found.
- **Unavailable** means the check timed out.
- **Check failed** means the command returned an error.

Checks are conservative. On Windows, command-backed package-manager tools can occasionally appear
not detected even when a different shell can run them. Confirm with the tool's own terminal command
before reinstalling it. ForgeKi never installs a missing tool.

## Activity History

The **Activity** page stores up to 200 recent ForgeKi operations on this device. Entries can include
project creation and scanning, Stack/Workspace generation, plugin operations, Marketplace refreshes,
update checks, deployment checks/exports, warnings, and failures. You can filter or clear the list.
There is no cloud history, account synchronization, or telemetry upload.

## Settings

Settings currently include:

- **Language:** English or العربية; the Desktop interface switches immediately and uses RTL
  layout in Arabic. This setting is stored locally. CLI output remains English-only;
- **Appearance:** System/Light/Dark theme and collapsed sidebar;
- **Project defaults:** package manager, destination, Git, Docker, GitHub Actions, Beginner/Advanced;
- **Stack Builder defaults:** framework, styling, testing, last-stack memory, required-component
  confirmation;
- **Deployment defaults:** environment, target, Kubernetes replicas, production Docker profile,
  metadata, advanced options;
- **Plugin platform:** remote Marketplace, automatic checks, local community plugins, experimental
  bundled examples;
- **Secure updates:** Stable/Beta channel and automatic checks; and
- **Application:** clear recent projects/activity or reset settings.

There is no unsafe mode. Plugin validation, integrity checks, and restricted permissions cannot be
disabled. Update checks use only a configured trusted provider and installation is never silent.

## Security

ForgeKi's practical safety model is:

- local-first, deterministic core generation;
- native-selected directories, safe relative paths, and bounded input reads;
- exclusive creation and no overwrite by default;
- reviewed plans recomputed before execution;
- declarative community plugins with closed schemas and permissions;
- signature, digest, revocation, quarantine, and integrity checks;
- bounded downloads and restricted provider networking;
- no arbitrary plugin code, shell execution, telemetry, or AI; and
- no deployment credentials or automatic cloud actions.

For vulnerability reporting and the complete threat model, read [SECURITY.md](../../SECURITY.md).
Do not place vulnerability details in a public issue before following that policy.

## Privacy

Core workflows remain on your device. Marketplace requests are limited to fixed signed metadata and
the one package you explicitly select. ForgeKi does not send project/workspace names, source code,
paths, dependencies, environment values, secrets, npm identity, GitHub identity, install events, or
a persistent client ID to Marketplace services. It has no telemetry, analytics, tracking pixels, or
remote plugin images.

Production remote Marketplace and update services are currently unconfigured. If official providers
are configured later, their requests remain subject to the documented fixed protocol and privacy
boundaries. See [Marketplace privacy](../marketplace/privacy.md).

## About ForgeKi

The **About** page shows the Desktop version, Stable/Beta channel, MIT license, repository, current
Marketplace and updater trust state, and Beta notice. **Check for updates** reports the configured
provider state. The page also provides the diagnostics workflow below.

## Diagnostics

In **About → Export Diagnostics**, first choose **Preview diagnostics**. The allowlisted JSON report
contains product/version/channel, broad operating-system name, configuration schema version,
developer-tool statuses and sanitized versions, plugin IDs/version/integrity, provider states, and up
to 20 recent warning/failure types with timestamps. Choose **Save JSON** only after reviewing it.

Diagnostics intentionally exclude project names and paths, home paths, usernames, source code,
environment values, secrets, tokens, passwords, credentials, and private configuration. Review every
file yourself before attaching it to an issue.

The CLI equivalent is:

```bash
forge doctor
forge doctor --json
```

CLI diagnostics report the ForgeKi/Node versions, supported runtime policy, basic tool availability,
preferred package manager, provider states, and warnings. They do not inspect or upload source code.

## CLI introduction

You do not need to use the CLI to use ForgeKi Desktop. The CLI is useful for repeatable commands,
terminal workflows, and automation. Run `forge --help` or `forge <command> --help` before changing a
project. The current intended package is `@forgecli7/cli`; public npm availability must be confirmed
on the official repository before installation.

## Essential CLI commands

| Command                                   | Purpose                                                |
| ----------------------------------------- | ------------------------------------------------------ |
| `forge --help`                            | Show commands and examples                             |
| `forge --version`                         | Show the installed CLI version                         |
| `forge doctor` / `forge doctor --json`    | Check runtime, tools, and provider readiness           |
| `forge check`                             | Inspect the current project without changing it        |
| `forge create`                            | Open the interactive creation wizard                   |
| `forge create <name> [options]`           | Generate a project from explicit options or a preset   |
| `forge add [docker\|github-actions]`      | Add a supported built-in feature safely                |
| `forge stacks list`                       | List the six built-in Stack presets                    |
| `forge stacks show <preset>`              | Inspect one Stack preset                               |
| `forge workspaces presets`                | List the five built-in Workspace presets               |
| `forge workspaces show <preset>`          | Inspect one Workspace preset                           |
| `forge workspace create [name] [options]` | Generate a multi-service workspace                     |
| `forge workspace check [directory]`       | Scan a Workspace without changing it                   |
| `forge environments list`                 | List Local, Staging, and Production profiles           |
| `forge deployment targets [directory]`    | List all or compatible deployment targets              |
| `forge deployment check [directory]`      | Check readiness without writing files                  |
| `forge deployment plan [directory]`       | Preview the exact deployment plan                      |
| `forge deployment export [directory]`     | Export after explicit review and confirmation          |
| `forge plugins list`                      | List built-in, bundled, and installed plugins          |
| `forge marketplace status`                | Show provider, cache, root trust, and revocation state |
| `forge update check`                      | Check signed release metadata without self-updating    |

Use `--env local|staging|production` and
`--target docker|docker-compose|kubernetes|static|node` with deployment check/plan/export. Run the
command's help for confirmation and destination options before exporting.

## CLI examples

### Create a project

```bash
forge create my-app --preset nextjs-starter
forge create api --framework express --database postgres --orm drizzle --testing vitest --docker
```

Omit the name or add `--interactive` to use prompts. Explicit creation defaults to pnpm and Git, with
Docker and GitHub Actions disabled unless requested.

### Add Docker

```bash
cd my-app
forge add docker
```

Run it again safely: existing `Dockerfile` or `.dockerignore` files are preserved.

### Inspect a project

```bash
cd my-app
forge check
```

### Inspect available Stacks

```bash
forge stacks list
forge stacks show nextjs-fullstack
```

### Diagnose ForgeKi

```bash
forge doctor
forge doctor --json
```

### Work with a Workspace

```bash
forge workspaces presets
forge workspace create my-workspace --preset full-stack-postgres --destination . --docker
forge workspace check ./my-workspace
```

## Keyboard navigation

ForgeKi currently uses standard operating-system and browser-style keyboard navigation; it does not
define product-specific hotkeys. Use `Tab` and `Shift+Tab` to move between controls, arrow keys in
selects/radio groups, `Space` for checkboxes and buttons, and `Enter` to activate the focused control.
Visible focus rings identify the active control. Dialogs and actions remain labelled for assistive
technology. Do not rely on an undocumented shortcut.

## Troubleshooting

### ForgeKi does not open

Restart the application, confirm it came from the official repository, and check whether endpoint
security quarantined the file. Reinstall from an official release if available. If the problem is
reproducible, include safe diagnostics in an issue.

### Windows SmartScreen warning

Current Beta installers may be unsigned. Verify the official repository source and checksum. Use the
Windows review flow only if you trust that exact file; do not disable SmartScreen globally.

### Node.js, Git, Docker, or a package manager is not detected

Run the tool's version command in a new terminal (for example `node --version`, `git --version`, or
`docker --version`). Install or repair it from its official source, then reopen ForgeKi. Docker is not
required merely to generate configuration. Windows command wrappers can produce conservative
not-detected results, so verify manually before reinstalling.

### Project creation failed

Return to Review, verify the project name and destination, and confirm you have write permission.
ForgeKi does not install dependencies, so dependency installation errors happen afterward in your
terminal rather than during creation.

### Destination directory is not empty

Choose a new project name or an empty destination. ForgeKi refuses to merge into or overwrite an
existing directory.

### Marketplace unavailable or offline

Open Settings and confirm Remote Marketplace is enabled, then check the Marketplace notice. The
production provider is currently unconfigured. When a provider exists, a verified cache can remain
available offline; a failed refresh does not replace it with unverified data.

### Plugin rejected or revoked

Open **View details** and read the safety, integrity, permission, and publisher messages. Fix a local
manifest rather than bypassing validation. Revoked or corrupted plugins are disabled and cannot be
used for new generation.

### Update service not configured

This is the expected current production state. ForgeKi does not fall back to an unofficial endpoint
and the CLI does not self-update. Check the official Releases page manually.

### GitHub Actions generation issue

Confirm `.github/workflows/ci.yml` does not already exist and that `package.json` contains the scripts
you expect. Existing workflows are preserved. Review the generated workflow before pushing it.

### Docker generation issue

Confirm the framework is recognized and that `Dockerfile` and `.dockerignore` do not already exist.
Generation does not require the Docker daemon; building or running the result does.

### Permission or path error

Choose a normal local directory you own. Avoid protected system directories, symbolic links, and
paths that escape the selected parent. ForgeKi intentionally rejects unsafe paths.

### Reporting a reproducible bug

Open [GitHub Issues](https://github.com/legendki7/forge-cli/issues) and provide the ForgeKi version,
operating system, exact reproduction steps, expected behavior, actual behavior, and reviewed safe
diagnostics. Never include secrets, credentials, private source code, or private environment values.

## FAQ

### Is ForgeKi free?

Yes. ForgeKi is open source under the [MIT License](../../LICENSE).

### Does ForgeKi use AI?

No. Generation, scanning, recommendations, validation, and compatibility checks are deterministic
and local. ForgeKi does not send projects to an AI service.

### Does ForgeKi upload my source code?

No. Core project and workspace workflows remain local. Marketplace requests do not include project
source or identity data.

### Can ForgeKi deploy my application?

No. ForgeKi generates reviewable deployment configuration. You remain responsible for credentials,
infrastructure, commands, and the actual deployment.

### Can community plugins run code on my computer?

No. They are validated declarative data and cannot execute JavaScript, shell commands, binaries, or
arbitrary processes. Built-in Docker and GitHub Actions integrations are trusted code shipped with
ForgeKi and still use safe, no-overwrite generation.

### Do I need Node.js to open ForgeKi Desktop?

No for an installed Desktop build: its required worker runtime is bundled. You usually need Node.js
to develop the JavaScript/TypeScript project that ForgeKi creates. The CLI also requires Node.js.

### Does ForgeKi support macOS or Linux?

The Node.js CLI is designed for supported Node environments, but native Desktop release validation is
currently Windows-only. macOS and Linux Desktop builds are not claimed as validated.

### Why does Windows warn about ForgeKi?

Current Beta installers are not Authenticode-signed, so SmartScreen reputation may be unavailable.
Only use files from the official repository and review available checksums.

### Where are updates downloaded from?

No production update provider is currently configured. Future official builds must use configured,
signed metadata and verified artifacts with explicit user confirmation. ForgeKi does not silently
install updates and the CLI does not self-update.

## More documentation

- [Desktop architecture and behavior](../desktop.md)
- [Visual Stack Builder](../stack-builder.md)
- [Workspace guide](../workspaces/overview.md)
- [Deployment guide](../deployment/overview.md)
- [Plugin platform](../plugins/overview.md)
- [Marketplace security](../marketplace/overview.md)
- [Secure updates](../updates/overview.md)
- [Contributing to ForgeKi](../../CONTRIBUTING.md)
