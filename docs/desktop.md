# ForgeKi Desktop

ForgeKi Desktop is a local developer studio for creating, inspecting, and configuring ForgeKi
projects. Phase 1 supports five built-in Next.js templates with TypeScript and the App Router. It
does not install dependencies, access the network, run `create-next-app`, deploy applications, or
add databases, authentication, accounts, telemetry, or artificial intelligence.

No installer is publicly available and the application is not production-ready. Windows, macOS,
and Linux build jobs are prepared for manual testing, but support is claimed only after a native
artifact has been tested on that platform.

## Architecture

```text
React application shell, pages, and local state
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

The worker is bundled as a platform-specific sidecar with its own pinned Node 22.23.2 runtime by
`@yao-pkg/pkg`.
Users are not expected to install Node globally. The worker accepts exactly one allowlisted
operation, does not accept arbitrary executable names or shell arguments, emits structured output,
and exits. It calls shared project, detection, template, and plugin APIs directly; it never shells
out to the `forge` executable.

Tauri owns native folder selection, selected-directory capabilities, sidecar startup, app-data
persistence, opening verified folders, and copying verified paths. The React webview can invoke only
the documented application commands. It has no direct shell or filesystem capability. This
architecture preserves the TypeScript engine as the source of truth and avoids a second Rust
implementation of project rules.

## Shared packages

- `@forgecli7/core/project-name` supplies the browser-safe name validator.
- `@forgecli7/core` supplies project detection and package-manager contracts to the worker.
- `@forgecli7/templates` provides the typed five-template catalog, safe scaffolding, and fixed
  `git init` policy.
- `@forgecli7/plugins` loads the trusted catalog in Docker then GitHub Actions order.
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

### Verified Windows build prerequisites

ForgeKi Desktop has been built and smoke-tested locally on Windows 11 x64. No macOS or Linux native
build is claimed as tested. A Windows build requires:

- the stable `x86_64-pc-windows-msvc` Rust toolchain;
- **Visual Studio Build Tools 2022** with the **Desktop development with C++** workload;
- the **Microsoft Edge WebView2 Evergreen Runtime**; and
- the Windows **VBSCRIPT** optional feature when generating MSI installers.

The build never installs these system components. Follow the official
[Tauri Windows prerequisites](https://v2.tauri.app/start/prerequisites/#windows), then run:

```bash
pnpm install --frozen-lockfile
pnpm desktop:check
pnpm desktop:test
pnpm desktop:build
```

Successful x64 Windows builds place the application and its fixed worker sidecar at:

```text
apps/desktop/src-tauri/target/release/forgeki-desktop.exe
apps/desktop/src-tauri/target/release/forgeki-worker.exe
```

They place the unsigned installers at:

```text
apps/desktop/src-tauri/target/release/bundle/msi/ForgeKi_<version>_x64_en-US.msi
apps/desktop/src-tauri/target/release/bundle/nsis/ForgeKi_<version>_x64-setup.exe
```

These artifacts are local build output and must not be committed. ForgeKi does not currently use
code signing, so Windows may show an unknown-publisher or Microsoft Defender SmartScreen warning.
Only continue past such a warning for an artifact you built yourself or obtained from a trusted,
hash-verified source.

For manual local installation, choose one installer format, close any running ForgeKi instance, run
the MSI or NSIS setup executable, review the displayed product/version and unsigned-publisher state,
and complete the per-user installation prompts. For a repository smoke test without installation,
keep `forgeki-desktop.exe` and `forgeki-worker.exe` together and launch the application executable
directly. Do not install both formats for the same test.

## Application navigation

The persistent sidebar opens on Home and provides Create Project, Templates, Scan Project, Plugins,
Developer Tools, Activity, and Settings destinations. It has a selected state, keyboard-accessible
buttons, accessible labels, collapsed tooltips, a responsive collapsed layout, and a persisted
collapse preference.

- **Home** shows quick actions, real recent projects, and the latest five activity entries. Removing
  a recent project never deletes its directory.
- **Create Project** uses Project, Template, Tooling, Review, and Create steps. Files are not created
  until final confirmation. Progress is state-based without fake percentages.
- **Templates** provides local search, category/difficulty filters, feature details, and preselection
  into creation. It is labelled built-in templates, not a marketplace.
- **Scan Project** uses the native picker and shared detection engine. It reports concise dependency
  counts and expands scripts/files on demand. Recommendations are deterministic rules for Docker,
  GitHub Actions, validation scripts, lockfile ambiguity, and TypeScript presence.
- **Plugins** exposes only bundled Docker and GitHub Actions metadata, status, supported frameworks,
  and managed files. Application requires a preview and confirmation; removal and remote loading are
  unavailable.
- **Developer Tools** checks Node.js, npm, pnpm, Yarn, Bun, Git, Docker, VS Code, Rust, and Cargo only
  after the page action is used.
- **Activity** stores at most 200 concise local entries with event/result filters and confirmed
  clearing. It stores no file contents, secrets, or stack traces.
- **Settings** controls system/light/dark theme, sidebar, project defaults, Beginner/Advanced mode,
  local-history clearing, and reset. It displays the application identity and privacy promises.

## Built-in templates

The template contract is strongly typed, deterministic, testable, shared by CLI and Desktop, and
independent of React and Tauri. The catalog contains:

1. Blank Next.js App — the existing minimal scaffold.
2. Next.js Dashboard — responsive sidebar, top navigation, metric cards, and a sample table.
3. Next.js Blog — local posts, post routes, metadata-ready structure, and responsive typography.
4. Next.js Portfolio — introduction, projects, skills, and placeholder contact information.
5. Next.js Landing Page — hero, feature grid, call to action, and footer.

All output uses TypeScript, App Router, local CSS, selected package-manager metadata, and no remote
fonts, images, analytics, timestamps, machine paths, downloaded content, or fabricated lockfiles.

## Beginner and Advanced modes

Beginner mode is the default and presents the choices needed to create a project with short
explanations. Advanced mode adds framework metadata, expected scripts, package commands, generated
plugin details, destination safety, file previews, and detailed creation states. Mode changes only
presentation; native and shared validation are identical.

## Local persistence and privacy

`desktop-state.json` is stored under the platform Tauri application-data directory, never the
repository or selected project. Schema version 1 contains preferences, up to 25 recent projects, up
to 200 activity entries, and dismissed recommendation identifiers. The migration layer supplies
safe defaults and recovers corrupted or future data conservatively. Rust caps file/value sizes,
rejects unsupported top-level fields and sensitive-looking keys, and writes through a temporary
file.

ForgeKi does not use analytics or telemetry. Project files remain on the device, project source
contents are not persisted, and nothing is uploaded.

## Security boundary and threat model

### Untrusted frontend input

Rust deserialization rejects unknown request fields, validates enum and boolean shapes, requires an
absolute selected parent, canonicalizes it, and allows only one native operation at a time. The worker
validates the complete payload again with the shared project-name validator and engine.

### Unsafe paths and symlinks

The frontend never supplies a trusted final path. The engine combines the canonical selected parent
with the validated project name, rejects traversal, symbolic-link destinations, non-empty folders,
and unsafe template entries, and uses staging, atomic rename, and exclusive file creation.

### Arbitrary command execution

The webview has no shell permission. Rust launches only the bundled `forgeki-worker` sidecar with no
frontend-provided arguments. The worker accepts only create, scan, inspect built-ins, apply built-in,
and check-tools operation identifiers. Tool checks use fixed executable/argument definitions,
`shell: false`, timeouts, bounded output, and sanitization. Existing Git execution remains limited
to the injectable `git init` call already used by the CLI.

### Native commands and boundaries

| Command                                     | Boundary                                                                           |
| ------------------------------------------- | ---------------------------------------------------------------------------------- |
| `select_destination`                        | Native folder picker; canonical result is added to the capability list.            |
| `create_project`                            | Typed request, five-template allowlist, shared sidecar scaffold, single operation. |
| `scan_project`                              | Exact canonical directory previously selected by the user.                         |
| `inspect_builtin_plugins`                   | Metadata only, or detection for an exact selected project.                         |
| `apply_builtin_plugin`                      | Docker/GitHub Actions allowlist and exact selected project only.                   |
| `check_developer_tools`                     | Fixed backend tool definitions; no frontend executable or arguments.               |
| `load_desktop_state` / `save_desktop_state` | Bounded schema in Tauri app data only.                                             |
| `open_project_folder` / `copy_project_path` | Exact selected or newly created project only.                                      |

No command accepts a raw shell string, arbitrary plugin package, unrestricted filesystem path, or
frontend-defined executable.

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

## Current limitations and roadmap

Only Next.js TypeScript App Router projects and the two trusted built-in plugins are supported.
There is no plugin removal, dependency installation, deployment, security-vulnerability scanner,
remote template fetch, account, automatic update, or community execution path. Planned future work:

- Community plugin marketplace
- Visual stack builder
- Additional frameworks
- macOS native validation
- Linux native validation
- Signed Windows installers
- Automatic updates

## Troubleshooting

- **Rust or Cargo missing:** install a supported Rust toolchain, reopen the terminal, and retry.
- **Windows WebView2 or linker error:** install the current Tauri Windows prerequisites.
- **Linux WebKitGTK error:** install the distribution packages listed by Tauri and mirrored in CI.
- **Worker unavailable:** run `pnpm --filter @forgeki/desktop build:sidecar` and confirm the generated
  binary matches `rustc --print host-tuple`.
- **Folder rejected:** choose an existing real parent directory and a new or empty project name.
