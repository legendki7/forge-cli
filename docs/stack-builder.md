# Visual Stack Builder

ForgeKi's Visual Stack Builder composes trusted, offline project foundations from a central typed
component registry. Desktop and CLI use the same compatibility engine and generation planner, so the
reviewed architecture is the architecture written to disk.

## Supported stacks

| Framework          | Styling                 | Data                                        | Testing            | Tooling                     |
| ------------------ | ----------------------- | ------------------------------------------- | ------------------ | --------------------------- |
| Next.js App Router | Plain CSS, Tailwind CSS | PostgreSQL or SQLite with Prisma or Drizzle | Vitest, Playwright | Git, Docker, GitHub Actions |
| React + Vite       | Plain CSS, Tailwind CSS | None in this phase                          | Vitest, Playwright | Git, Docker, GitHub Actions |
| Express            | Not applicable          | PostgreSQL or SQLite with Prisma or Drizzle | Vitest             | Git, Docker, GitHub Actions |

All generated applications use TypeScript and Node.js. Generation never installs dependencies,
creates lockfiles or databases, downloads templates, or contacts a remote service.

## Compatibility rules

`validateStack()` resolves built-in requirements in registry order and returns errors, warnings,
required components, conflicts, and the complete resolved component list. It never silently removes a
selection. Only one database and one ORM may be selected; Prisma and Drizzle require a database;
React/Vite cannot select server database components; and Playwright is limited to web application
frameworks. Messages include a deterministic reason and resolution.

The Desktop catalog displays unsupported cards with an explanation. Automatically required nodes are
labelled in the architecture tree and cannot be removed while another component needs them. The
inspector shows registry metadata, with versions, ownership, scripts, and environment planning in
Advanced mode.

## Presets

The built-in deterministic presets are Next.js Starter, Next.js Full Stack, Next.js Dashboard, React
Frontend, Express API, and Express PostgreSQL API. Local presets include a schema version, name,
description, stack definition, and creation/update dates. They can be loaded, renamed, duplicated, or
deleted with confirmation. At most 50 are retained. Corrupt, incompatible, or unknown component IDs
are discarded during migration, and environment values and project secrets are never stored.

## Generation plan and preview

`createGenerationPlan()` first validates the stack, then merges trusted framework and component
contributions into one deterministic plan. The merge detects dependency-version, script,
environment-variable, and file-ownership conflicts. Every planned path is relative and safe. The plan
contains the framework, template, owned text files, dependencies, development dependencies, scripts,
environment-variable definitions, plugin steps, and warnings.

Desktop asks its native worker for the plan before any filesystem mutation. The review displays the
project settings, resolved components, automatically added requirements, file tree, and contents from
that exact plan. Advanced mode also displays dependency versions, scripts, secret-labelled placeholder
variables, and file ownership. Preview content is read-only and capped at 32 KB. On confirmation the
backend validates every built-in ID, recomputes compatibility and the plan, rejects any preview/execution
mismatch, and then creates the project through an isolated staging directory without overwriting files.

PostgreSQL plans use explicit non-production placeholder values and only include a Compose service when
Docker is selected. SQLite plans describe an ignored local path but do not create a database. Prisma and
Drizzle foundations are generated without running clients or migrations. Playwright browser binaries are
not downloaded.

## Scanner integration

The read-only scanner recognizes Next.js, React/Vite, Express, Tailwind, Prisma, Drizzle, PostgreSQL,
SQLite, Vitest, Playwright, Docker, and GitHub Actions. Evidence is represented as `Detected`, `Likely
detected`, or `Conflicting`; incomplete package/file evidence is not presented as certainty. The detected
stack is rendered with the same accessible architecture-tree treatment and remains separate from
rule-based recommended additions.

## CLI usage

```bash
forge stacks list
forge stacks show nextjs-fullstack
forge create my-app --preset nextjs-fullstack
forge create api --framework express --database postgres --orm drizzle --testing vitest --docker --github-actions
```

Existing interactive and template-based `forge create` behavior is preserved. CLI options accept only
registered IDs and use the shared validation and planning APIs.

## Security and limitations

The registry is compiled into ForgeKi. There is no remote registry, arbitrary package name, template
execution, JavaScript evaluation, arbitrary command, community plugin execution, or unrestricted file
access. The Rust/native and worker boundaries validate selected directories, component IDs, templates,
paths, dependencies, scripts, collisions, persisted presets, and reviewed-plan consistency.

This phase does not include authentication, payments, Redis, queues, deployment, a community plugin
marketplace, cloud preset synchronization, real database provisioning, package installation, or a
freeform multi-service canvas. It does not add AI and requires no external API.
