# ForgeKi Desktop

## Visual identity

ForgeKi Desktop uses the official supplied ForgeKi logo as its sole product mark. The canonical,
transparent UI mark and padded application-icon source are stored in
`apps/desktop/src/assets/brand/`. The sidebar, Home page, and About page render the canonical mark;
components do not recreate or recolor it.

Semantic light and dark theme tokens are centralized at the top of `apps/desktop/src/styles.css`.
The palette is derived from the source logo (`#4088f8`, `#3898e8`, and `#38c0f0`) with darker or
lighter accessible interaction shades where needed. Status colors remain semantic and independent
from the brand palette.

Tauri-generated PNG, ICO, ICNS, and Windows tile assets live under
`apps/desktop/src-tauri/icons/`. `tauri.conf.json` assigns `icons/icon.ico` to NSIS installer and
uninstaller output; the shared bundle icon list supplies the executable and MSI bundle. The
application icon uses a dark neutral tile behind the unchanged mark so its white terminal glyph
remains legible on light and dark Windows surfaces.

Phase 6 adds trusted remote Marketplace, Security Center, and signed update-checking foundations.
Environments and Deployment continue using `@forgecli7/deployments` through the fixed
worker boundary for schema matrices, compatible target filtering, readiness, exact previews,
confirmed export, fingerprints, and drift. ForgeKi generates deployment configuration; it does not
deploy applications.

Workspace Builder is a lazy-loaded visual canvas for services and typed connections. It supports built-in/custom presets, deterministic validation, destination selection, exact file-owner review, confirmed atomic generation, config/ASCII copy, and read-only import. Workspace state is local and bounded; recent workspaces are not rescanned on startup.

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
- `@forgecli7/workspaces` owns the multi-service architecture model and local generator.
- `@forgecli7/deployments` owns environment/deployment plans and safe export.

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

The persistent sidebar opens on Home and provides Create Project, Templates, Scan Project, Marketplace,
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
- **Marketplace** separates Installed, Built-in, Community, and Developer views. It shows permissions,
  provenance, integrity, publisher trust, signature status, compatibility, revocation, and explicit
  plugin updates. Local, bundled, and remote installation require confirmation. Production remote
  discovery remains unavailable until an owned provider is configured; verified cached metadata and
  the local test transport exercise the same trust pipeline.
- **Security** shows root trust, cache/revocation state, installed/revoked remote plugins, Stable/Beta
  channel state, updater signature status, and the current unsigned Windows status.
- **Developer Tools** checks Node.js, npm, pnpm, Yarn, Bun, Git, Docker, VS Code, Rust, and Cargo only
  after the page action is used.
- **Activity** stores at most 200 concise local entries with event/result filters and confirmed
  clearing. It stores no file contents, secrets, or stack traces.
- **Settings** controls system/light/dark theme, sidebar, project defaults, Beginner/Advanced mode,
  local-history clearing, and reset. It displays the application identity and privacy promises.
- **Environments** shows Local, Staging, and Production schemas, ownership, secret/public boundaries,
  workspace topology, profile comparison, and drift without showing values.
- **Deployment** filters compatible targets, reports readiness, previews exact files, and exports only
  after native folder selection and confirmation. It has no Deploy button.

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
validates the complete payload again with shared validators and resolves declarative components from
the installed, integrity-valid plugin registry.

### Unsafe paths and symlinks

The frontend never supplies a trusted final path. The engine combines the canonical selected parent
with the validated project name, rejects traversal, symbolic-link destinations, non-empty folders,
and unsafe template entries, and uses staging, atomic rename, and exclusive file creation.

### Arbitrary command execution

The webview has no shell permission. Rust launches only the bundled `forgeki-worker` sidecar with no
frontend-provided arguments. The worker accepts only allowlisted creation, scan, built-in,
declarative-plugin, and tool-check operation identifiers. Declarative plugins are parsed data and
never executable hooks. Tool checks use fixed executable/argument definitions,
`shell: false`, timeouts, bounded output, and sanitization. Existing Git execution remains limited
to the injectable `git init` call already used by the CLI.

### Native commands and boundaries

| Command                                     | Boundary                                                                            |
| ------------------------------------------- | ----------------------------------------------------------------------------------- |
| `select_destination`                        | Native folder picker; canonical result is added to the capability list.             |
| `plan_stack`                                | Selected destination plus built-in component IDs; returns a read-only trusted plan. |
| `create_project`                            | Typed template/stack allowlist, reviewed-plan verification, single operation.       |
| `scan_project`                              | Exact canonical directory previously selected by the user.                          |
| `inspect_builtin_plugins`                   | Metadata only, or detection for an exact selected project.                          |
| `apply_builtin_plugin`                      | Docker/GitHub Actions allowlist and exact selected project only.                    |
| `list_marketplace_plugins`                  | Offline-first provider composition; no install side effect.                         |
| Marketplace status/refresh/search/show      | Fixed provider operations; frontend URLs are never accepted.                        |
| Remote plugin install/update                | Bounded ID and confirmation through signature/quarantine validation.                |
| Application update check                    | Stable/Beta metadata only; no silent installation.                                  |
| `validate_community_plugin`                 | Selected local directory; closed manifest and safety report only.                   |
| `install_community_plugin`                  | Selected source; validated app-data copy plus integrity metadata.                   |
| `install_bundled_plugin`                    | Curated identifier allowlist; explicit local install only.                          |
| `remove_community_plugin`                   | Bounded plugin identifier; project files are never removed.                         |
| `create_plugin_project`                     | Selected parent and safe starter name; declarative files only.                      |
| `check_developer_tools`                     | Fixed backend tool definitions; no frontend executable or arguments.                |
| `load_desktop_state` / `save_desktop_state` | Bounded schema in Tauri app data only.                                              |
| `open_project_folder` / `copy_project_path` | Exact selected or newly created project only.                                       |

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

The Visual Stack Builder supports trusted Next.js, React/Vite, and Express foundations plus installed,
validated declarative plugin components. There is no dependency installation, deployment,
security-vulnerability scanner, account, silent update installation, or community
code-execution path. Planned future work:

- Production Marketplace/update hosting, public publisher onboarding, and signed releases
- Additional databases
- Authentication components
- UI component libraries
- Visual multi-service architecture
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
