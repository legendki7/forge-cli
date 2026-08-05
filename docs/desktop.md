# ForgeKi Desktop

ForgeKi Desktop is the graphical interface for creating ForgeKi projects. The MVP creates only
Next.js projects with TypeScript and the App Router. It does not install dependencies, access the
network, run `create-next-app`, deploy applications, or add databases, authentication, or accounts.

No installer is publicly available and the application is not production-ready. Windows, macOS,
and Linux build jobs are prepared for manual testing, but support is claimed only after a native
artifact has been tested on that platform.

## Architecture

```text
React form and progress UI
          |
          | typed Tauri invoke/event payloads
          v
Narrow Rust command boundary
          |
          | one fixed JSON request over stdin
          v
Bundled Node worker sidecar
          |
          v
@forgecli7/core + templates + built-in plugins
```

The worker is bundled as a platform-specific sidecar with its own Node runtime by `@yao-pkg/pkg`.
Users are not expected to install Node globally. The worker accepts exactly one creation request,
does not accept executable names or shell arguments, emits structured progress, and exits. It calls
`createProject()` and `loadPlugins()` directly; it never shells out to the `forge` executable.

Tauri owns native folder selection, sidecar startup, opening the last successfully created folder,
and copying that verified path. The React webview can invoke only these application commands. It has
no direct shell or filesystem capability. This architecture adds a packaged runtime and sidecar
build step, but preserves the TypeScript engine as the source of truth and avoids a second Rust
implementation of project safety rules.

## Shared packages

- `@forgecli7/core/project-name` supplies the browser-safe name validator.
- `@forgecli7/core` supplies project detection and package-manager contracts to the worker.
- `@forgecli7/templates` performs safe scaffolding and the fixed `git init` policy.
- `@forgecli7/plugins` loads the built-in registry in Docker then GitHub Actions order.
- `@forgecli7/plugin-docker` and `@forgecli7/plugin-github-actions` generate optional files.

The worker verifies the generated directory again with shared project detection before reporting
success. Plugin and Git failures remain warnings when the safe base project was created.

## Development setup

Requirements:

- Node.js 20, 22, or 24
- pnpm 9 or newer
- Rust and Cargo for native development and builds
- Tauri 2 platform prerequisites for the current operating system
- Windows: WebView2 and the Microsoft C++ build tools
- macOS: Xcode command-line tools
- Linux: the WebKitGTK, appindicator, SSL, and build packages installed by the native CI workflow

ForgeKi never installs Rust or system packages automatically. Follow the current
[Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for the platform.

```bash
pnpm install --frozen-lockfile
pnpm desktop:dev
pnpm desktop:check
pnpm desktop:test
pnpm desktop:build
```

`desktop:dev` launches Tauri development mode. `desktop:check` runs lint, TypeScript validation,
headless frontend and bridge tests, and a least-privilege configuration audit. `desktop:build`
bundles the worker runtime and attempts a native application/bundle build. Missing native
prerequisites are reported rather than installed.

## User flow

The single creation screen provides a validated project name, native parent-folder selection,
Next.js framework summary, package-manager choice, and Git, Docker, and GitHub Actions options. A
confirmation step creates no files. After confirmation, structured steps distinguish waiting,
running, succeeded, skipped, warning, and failed work. Success shows the destination, features,
warnings, package-manager-specific commands, and narrowly scoped open/copy actions.

Light and dark themes follow the operating-system preference. The interface uses local system fonts,
visible focus states, semantic labels, keyboard navigation, reduced-motion behavior, and no remote
assets, analytics, advertisements, telemetry, or account system.

## Security boundary and threat model

### Untrusted frontend input

Rust deserialization rejects unknown request fields, validates enum and boolean shapes, requires an
absolute selected parent, canonicalizes it, and allows only one creation at a time. The worker
validates the complete payload again with the shared project-name validator and engine.

### Unsafe paths and symlinks

The frontend never supplies a trusted final path. The engine combines the canonical selected parent
with the validated project name, rejects traversal, symbolic-link destinations, non-empty folders,
and unsafe template entries, and uses staging, atomic rename, and exclusive file creation.

### Arbitrary command execution

The webview has no shell permission. Rust launches only the bundled `forgeki-worker` sidecar with no
frontend-provided arguments. The worker has no arbitrary-execution field. Existing Git execution is
limited to the injectable `git init` call already used by the CLI.

### File overwrite protection

The shared scaffolder and plugins use exclusive writes and preserve existing files. A concurrent
creator cannot silently replace the destination. Failed template writes clean up only files tracked
by that operation; a valid base project survives Git and plugin warnings.

### Sensitive errors

Expected errors are mapped to user-facing messages. Technical details are capped, user-profile paths
and token-shaped values are redacted, and raw stack traces, environment variables, npm configuration,
and credentials are never returned intentionally.

## Native workflow and installer status

The manually dispatched `Desktop native builds` workflow builds Windows, macOS, and Linux artifacts
and uploads them for maintainer testing. It does not sign binaries, publish npm packages, create a
GitHub release, or publicly release installers. Generated sidecar executables, Tauri `target`
directories, bundles, and installers are ignored by Git.

## Troubleshooting

- **Rust or Cargo missing:** install a supported Rust toolchain, reopen the terminal, and retry.
- **Windows WebView2 or linker error:** install the current Tauri Windows prerequisites.
- **Linux WebKitGTK error:** install the distribution packages listed by Tauri and mirrored in CI.
- **Worker unavailable:** run `pnpm --filter @forgeki/desktop build:sidecar` and confirm the generated
  binary matches `rustc --print host-tuple`.
- **Folder rejected:** choose an existing real parent directory and a new or empty project name.
