# Architecture

ForgeKi is organized as a pnpm monorepo. Each package owns one concern and publishes a deliberately
small public API.

## Package boundaries

- **`@forgecli7/cli`** owns argument parsing, interactive prompts, and terminal output. Commands are
  registered as isolated modules and receive dependencies through a command context.
- **`@forgecli7/core`** owns shared contracts and the project detection engine. It uses Node.js
  filesystem APIs but has no terminal, prompt, or third-party runtime dependencies.
- **`@forgecli7/templates`** defines template metadata and the template registry boundary.
- **`@forgecli7/plugins`** owns the plugin registry and built-in plugin loader. Duplicate identifiers
  are rejected and lookups are case-insensitive.
- **`@forgecli7/plugin-docker`** implements Docker detection and non-destructive Docker configuration.
  It depends only on `core` and has no knowledge of Commander.js.
- **`@forgecli7/plugin-github-actions`** generates deterministic, script-aware CI workflows from the
  shared project detection result. Bun rendering is isolated from Node package-manager rendering.

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

## Current scope

The Docker plugin creates local configuration files only. Deployment, image building, registry
publishing, dependency installation, template rendering, and project validation remain out of scope.

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
binary mapping. All six public packages must be versioned and published together through Changesets.

The CLI reads its version and supported Node.js range from its installed `package.json`. The compiled
entry point therefore requires package metadata, the generated JavaScript and declaration files,
and its workspace runtime dependencies, but never resolves monorepo-relative paths. Packaging uses
an explicit `files` allowlist, and the release scripts validate tarball contents and the shebang
before performing an isolated packed-install smoke test.
