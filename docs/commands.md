# CLI commands

Multi-service commands are documented in [Workspace CLI](workspaces/cli.md): `forge workspaces presets`, `forge workspaces show`, and `forge workspace create/check/validate`.

`forge --version` and `forge -V` print the version from the installed CLI package metadata.
`forge --help` lists only implemented commands and short examples.

## `forge create [project-name]`

Scaffolds an offline Next.js, React/Vite, or Express TypeScript project. pnpm is the default package
manager; npm, Yarn, and Bun are supported. Existing Next.js automation remains compatible.

```bash
forge create
forge create my-app
forge create my-app --interactive
forge create my-app --framework nextjs --package-manager npm
forge create my-app --no-git
forge create my-app --docker --github-actions
forge create my-app --preset nextjs-fullstack
forge create frontend --framework react-vite --styling tailwind --testing vitest
forge create api --framework express --database postgres --orm drizzle --testing vitest --docker
```

Stack flags are `--preset <id>`, `--framework <nextjs|react-vite|express>`,
`--styling <plain-css|tailwind>`, `--database <postgres|sqlite>`,
`--orm <prisma|drizzle>`, and `--testing <vitest|playwright>`. Common flags are
`--package-manager <pnpm|npm|yarn|bun>`, `--no-git`, `--docker`, `--no-docker`,
`--github-actions`, `--no-github-actions`, and `--interactive`/`-i`.
It does not access the network, install dependencies, invoke `create-next-app`, or fabricate
lockfiles.

With no project name, ForgeKi prompts for a validated name, package manager, Git, Docker, and
GitHub Actions. A named command becomes interactive only with `--interactive`. Options explicitly
provided on the command line are not prompted again, even when they equal a default. The wizard
then prints a stable summary and requires confirmation. Declining confirmation exits successfully
without creating files; Ctrl+C exits nonzero without starting scaffolding.

The legacy wizard continues to select Next.js. The package manager defaults to pnpm, Git defaults to
enabled, and Docker and GitHub Actions default to disabled.
`forge create my-app` retains these defaults and never prompts, preserving compatibility for scripts.
When stdin/stdout is not an interactive terminal, a command requiring prompts fails with guidance
to provide a project name instead of waiting for input.

Git initialization is enabled by default and runs only `git init`; Git failure produces a warning and
preserves the project. Plugin flags apply Docker first and GitHub Actions second. Plugin failures also
preserve the completed base project and are reported as warnings.

Generated projects include `src/app` files, `public/.gitkeep`, TypeScript and Next.js configuration,
flat ESLint configuration, package metadata, `.gitignore`, and a project-specific README. The
`packageManager` manifest field allows detection and plugin use before dependencies are installed.

Project names must be safe single-directory names. Absolute paths, traversal, separators, control
characters, reserved filesystem names, symbolic links, files, and non-empty destinations are
rejected without modifying user content. Existing empty directories are supported.

Explicit and preset stacks use the same registry, compatibility engine, and generation planner as
ForgeKi Desktop. Unsupported IDs and combinations return actionable errors before filesystem mutation.
Generation does not install packages, create lockfiles, download templates, or connect to databases.

## `forge stacks`

`forge stacks list` prints the six built-in presets. `forge stacks show <id>` prints a preset's
framework, components, package manager, and tooling choices. The accepted IDs are
`nextjs-starter`, `nextjs-fullstack`, `nextjs-dashboard`, `react-frontend`, `express-api`, and
`express-postgres-api`; arbitrary packages and remote presets are never resolved.

## `forge check`

Inspects the current directory and prints its project name, framework, language, package manager,
recognized files, and non-fatal warnings. Supported frameworks are Next.js, React with Vite,
Express, and generic Node.js. An unrecognized directory reports `Unknown` without crashing.

Package managers are inferred from lockfiles using `pnpm > npm > yarn > bun` priority, then from a
valid `packageManager` manifest field. Multiple or conflicting signals produce a warning.

## `forge add docker`

Runs project detection and generates a minimal framework-aware `Dockerfile` plus `.dockerignore`.
Install, build, start, and Vite preview commands follow the detected package manager and available
package scripts. The command never installs packages or builds an image.

Existing files are preserved using exclusive file creation. Repeated execution is safe. Unknown
projects return an unsupported-project message and no Docker files are generated.

## `forge add github-actions`

Generates `.github/workflows/ci.yml` for Next.js, React/Vite, Express, and generic Node.js projects.
The workflow supports pnpm, npm, Yarn, and Bun. Node-based jobs use the Node.js 20 and 22 matrix;
Bun uses the official `oven-sh/setup-bun` action in a separate job shape.

Only package scripts named `lint`, `typecheck`, `test`, and `build` are included, in that order. A
detected supported package manager and at least one recognized validation script are required.
ForgeKi does not execute the workflow, install dependencies locally, call GitHub, or deploy anything.

```yaml
# Generated by ForgeKi
name: CI

on:
  push:
    branches:
      - main
      - master
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [20, 22]
```

The workflow path is stable and has no timestamps or machine-specific values. An existing workflow
directory is reported as partial configuration. Unrelated workflow files and an existing custom
`ci.yml` are preserved byte-for-byte. Repeated and concurrent applications are safe no-ops after the
first successful creation.

## `forge plugins` and `forge plugin create`

Community plugin management is local and offline:

```bash
forge plugins list
forge plugins inspect example.editorconfig
forge plugins validate ./examples/plugins/editorconfig
forge plugins install ./examples/plugins/editorconfig
forge plugins remove example.editorconfig
forge plugin create my-plugin
```

Validation and inspection print declared permissions and a safety report. Installation accepts a
local directory only, copies a validated snapshot into ForgeKi application data, records SHA-256
integrity metadata, and never executes code or downloads packages. Corrupted plugins remain visible
but disabled. Removal deletes only ForgeKi's installed copy; generated project files remain. See
[plugin development](plugins/development.md) for the complete workflow.

## Known limitations

- Detection is limited to Node.js projects and the documented frameworks.
- Custom entry points, ports, workspace package selection, and nonstandard script conventions are
  not inferred.
- A valid `package.json` with no recognized framework is classified as generic Node.js.
- Docker uses npm as a fallback when the package manager is unknown; GitHub Actions refuses to
  generate a workflow when neither a supported lockfile nor valid package-manager metadata exists.
- Yarn uses `--frozen-lockfile` for broad Yarn Classic and modern compatibility; it does not infer a
  Yarn major version.
- Bun workflows do not use the Node.js matrix because Bun is configured through its own runtime
  action.
- Stack creation does not install dependencies or execute generated projects.
