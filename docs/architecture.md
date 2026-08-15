# Architecture

Phase 5 adds `@forgecli7/deployments` as the shared environment/deployment domain. It owns portable environment schemas, target compatibility, readiness, exact deterministic file plans, fingerprints, non-overwriting export, and drift scanning. CLI and Desktop are adapters. The Desktop worker rescans and recomputes every reviewed plan before export behind a native selected-directory boundary.

ForgeKi is organized as a pnpm monorepo. Each package owns one concern and publishes a deliberately
small public API.

`apps/desktop` is a private workspace application. Its React frontend uses the browser-safe
`@forgecli7/core/project-name` export, while a packaged Node worker imports the full core,
templates, registry, Docker, and GitHub Actions packages. Tauri mediates native operations through
narrow typed Rust commands and never exposes a general shell or filesystem API to the webview. See
[Desktop architecture](desktop.md) for the trust boundary and packaging tradeoffs.

## Package boundaries

- **`@forgecli7/cli`** owns argument parsing, interactive prompts, and terminal output. Commands are
  registered as isolated modules and receive dependencies through a command context.
- **`@forgecli7/core`** owns shared contracts and the project detection engine. It uses Node.js
  filesystem APIs but has no terminal, prompt, or third-party runtime dependencies.
- **`@forgecli7/plugin-sdk`** owns the closed declarative Manifest v1 schema, types, validators,
  deterministic renderer, permissions, safety report, and size/path limits. It executes no plugins.
- **`@forgecli7/templates`** owns the strongly typed built-in template catalog and deterministic
  renderers. It has no React or Tauri dependency.
- **`@forgecli7/plugins`** owns the plugin registry and built-in plugin loader. Duplicate identifiers
  are rejected and lookups are case-insensitive. It also owns offline catalog providers, validated
  application-data storage, SHA-256 integrity checks, bundled examples, and scanner-rule evaluation.
- **`@forgecli7/plugin-docker`** implements Docker detection and non-destructive Docker configuration.
  It depends only on `core` and has no knowledge of Commander.js.
- **`@forgecli7/plugin-github-actions`** generates deterministic, script-aware CI workflows from the
  shared project detection result. Bun rendering is isolated from Node package-manager rendering.
- **`@forgecli7/deployments`** owns environment profile schemas, secret/public validation, deployment
  target compatibility, deterministic generators, readiness, safe export, metadata, and drift.

The browser-safe `@forgecli7/core/stacks` entry owns the built-in stack registry, presets, and pure
compatibility engine. `@forgecli7/templates/generation-plan` consumes that model and merges trusted
framework/component contributions into a single owned-file plan. Commander, React, Tauri, and the
filesystem are absent from compatibility calculation. Desktop preview and execution share the exact
plan; the worker recomputes and byte-compares it before writing through the staging scaffolder. See
[Visual Stack Builder](stack-builder.md).

## Extension model

Commands are assembled in `createProgram`, making the program easy to test and embed. Services are
injected rather than imported as global singletons. `loadPlugins()` creates an isolated registry,
registers all built-ins, and accepts additional plugin objects for future embedding and external
discovery flows.

Interactive creation is split into a pure wizard orchestrator and a thin prompt adapter. The
orchestrator receives an injectable `CreatePromptAdapter`, resolves only missing values, validates
names through `core`, and returns a complete configuration before the scaffold engine is called.
The production adapter wraps Inquirer; tests use deterministic in-memory adapters. Commander option
value sources distinguish explicit flags from parser defaults, which preserves automation while
allowing partial interactive configuration.

### Plugin lifecycle

1. The CLI automatically loads the built-in registry when constructing the program.
2. `forge add <id>` resolves the requested plugin.
3. `detect()` inspects the target directory without mutation.
4. If configuration is incomplete, `apply()` creates only missing artifacts and returns structured
   status information.

Plugin application must be idempotent. Files are created exclusively so an existing file, including
one created concurrently, is never overwritten.

Community plugins follow a different lifecycle: validate a closed JSON manifest, copy referenced
data files through a staging directory, record hashes, then revalidate integrity before catalog,
generation, or scanning. Contributions merge into the normal generation plan with
`plugin:<plugin-id>` ownership. Built-ins cannot be overridden. The frontend may request a component,
but the worker resolves it again from the installed valid registry and recomputes the plan.

`createFileSafely()` in `core` is the common exclusive-write primitive. Plugins create required
parent directories recursively, then use this primitive so concurrent attempts produce one writer
and a safe no-op rather than truncation or replacement.

## Detection engine

`detectProject(directory)` is the shared source of project metadata for commands and plugins. It
normalizes the directory, safely parses package metadata, records recognized files, and returns
warnings for ambiguous or invalid evidence. Framework matching is ordered from most specific to
least specific: Next.js, React/Vite, Express, generic Node.js, then unknown.

Package-manager selection uses lockfile priority `pnpm > npm > yarn > bun`, followed by a valid
`packageManager` manifest field. Every present lockfile is reported in `detectedFiles`; ambiguity and
manifest conflicts are never hidden. Source scanning ignores dependency, build, coverage, Git, and
Next.js output directories.

The Docker plugin consumes the complete detection result. Its template generator selects the base
image, manifest copy, frozen install command, optional build step, and start/preview command from the
detected framework, package manager, and scripts. An unknown project returns `unsupported` before
any files are created.

The GitHub Actions plugin follows the same flow, then requires a detected supported package manager
and at least one recognized validation script. It treats an existing workflow directory or custom
`ci.yml` as partial configuration, preserves all files, and owns only its stable
`.github/workflows/ci.yml` target.

## Scaffolding

`@forgecli7/templates` owns the deterministic Next.js renderer and `createProject()` orchestration.
The renderer returns an in-memory ordered file list before filesystem mutation. `core` owns reusable
name validation, package-manager metadata, commands, detection, and exclusive file creation.

For an absent destination, scaffolding occurs in a staging directory inside the resolved parent and
is exposed with an atomic rename. A pre-existing empty directory is retained and protected with an
exclusive operation lock; only files created by a failed template write are cleaned up. Non-empty
and symbolic-link destinations are rejected.

Git execution is injected behind `ProcessExecutor` and is limited to `git init`. Git failure becomes
a warning. Requested plugins receive the completed project in Docker then GitHub Actions order.
Plugin failures preserve the base scaffold and are returned as warnings rather than triggering
rollback.

The catalog contains five trusted `ForgeKiTemplate` implementations. Each returns an ordered
in-memory file list from validated project name and package-manager options. The blank renderer
preserves CLI output compatibility; Dashboard, Blog, Portfolio, and Landing Page specialize only
the page, local styles, and explicitly declared supporting files. No renderer copies uncontrolled
directories, fetches content, installs dependencies, emits timestamps, or fabricates lockfiles.

## Desktop state and operations

React owns presentation and typed application state. Rust owns the native folder picker, selected
directory capability list, sidecar lifecycle, bounded local persistence, clipboard, and folder
opening. The one-shot Node sidecar owns create, scan, built-in plugin inspection/application,
declarative plugin validation/storage/catalog operations, and developer-tool checks so core
TypeScript remains the business-logic source of truth.

The persisted schema includes only preferences, recent-project metadata, bounded activity, and
dismissed recommendation identifiers. Rust writes `desktop-state.json` under the Tauri application
data directory, caps its size, rejects unsupported top-level fields and sensitive-looking keys, and
recovers corrupted JSON as defaults through the frontend migration layer.

Project access begins with the native folder picker. Rust canonicalizes and remembers selected or
newly created directories; subsequent scan, plugin, open, and copy operations must match that
capability list. The frontend cannot provide arbitrary executable names, sidecar arguments, plugin
packages, or unrestricted paths.

Developer-tool checks use ten fixed executable/argument definitions, `shell: false`, a timeout, and
bounded sanitized output. Results distinguish installed, not detected, unavailable, and check
failed instead of treating every failure as absence.

## Deployment trust boundary

Deployment planning contains no subprocess, network, Docker, Kubernetes, or cloud adapter. React
requests a plan; the worker scans and creates it from shared code. Export sends the reviewed plan
back; the worker rescans, recomputes, byte-compares, rejects collisions/symlinks/traversal, and only
then writes. Preview and export therefore use the same content.

Community deployment contributions are intentionally deferred. Existing plugins remain declarative
and cannot contribute images, arbitrary YAML, commands, credentials, or network operations.

## Current scope

ForgeKi generates deployment configuration but does not deploy. Image building, registry publishing,
cluster access, cloud authentication, infrastructure creation, and secret storage remain out of scope.

ForgeKi Desktop supports five Next.js TypeScript App Router presentations over the same safe
scaffolder. It is not an alternative project engine: it is a graphical adapter over the same
`createProject()` operation, detection rules, and plugin order used by ForgeKi CLI. Community plugin
download, arbitrary package execution, dependency installation, deployment, accounts, automatic
updates, and AI generation remain out of scope.

## Publishing model

ForgeKi publishes coordinated scoped workspace packages rather than bundling the complete system
into the CLI artifact. `@forgecli7/cli` depends on `core`, `templates`, and the built-in plugin registry;
the registry depends on both built-in plugin packages. This preserves intentional package APIs and
keeps plugins independently versioned. pnpm converts `workspace:*` declarations to compatible
registry versions while packing and publishing, and release inspection fails if an unresolved
workspace protocol remains.

The initial intended CLI name is `@forgecli7/cli`. It is controlled by
`packages/cli/package.json`; npm scope ownership and package availability require a manual check
before release. A different available scoped name may be selected there without changing the `forge`
binary mapping. All seven public packages must be versioned and published together through Changesets.

The CLI reads its version and supported Node.js range from its installed `package.json`. The compiled
entry point therefore requires package metadata, the generated JavaScript and declaration files,
and its workspace runtime dependencies, but never resolves monorepo-relative paths. Packaging uses
an explicit `files` allowlist, and the release scripts validate tarball contents and the shebang
before performing an isolated packed-install smoke test.
