# Contributing

1. Install Node.js 20, 22, or 24 and pnpm 9+.
2. Run `pnpm install`.
3. Create a focused branch and add a changeset when public package behavior changes.
4. Run `pnpm lint`, `pnpm test`, and `pnpm build` before submitting a pull request.

Keep package APIs explicit, avoid importing package internals, and add tests at the narrowest useful
boundary.

Next.js template foundations are rendered in `packages/templates/src/nextjs/template.ts`; the typed
catalog and specialized local content live in `packages/templates/src/catalog.ts`. Keep rendering
deterministic, centralize dependency versions, terminate generated text files with newlines, and
never include timestamps, absolute paths, fetched content, remote assets, or fabricated lockfiles.

Stack component metadata and compatibility belong in `packages/core/src/stacks.ts`; do not duplicate
rules in React or Commander commands. Framework/component output must contribute through the unified
generation-plan builder, with tests for dependency, script, environment, and file conflicts. New IDs
also require worker and native allowlist review, scanner evidence, CLI coverage, persistence-tampering
coverage, and updates to `docs/stack-builder.md`.

Desktop pages belong in the React application, while detection, templates, plugins, and filesystem
rules remain in shared packages or the Node worker. Native commands must be allowlisted, validate
typed payloads, require a folder selected through the native picker, sanitize output, and never
accept raw executable names or shell strings. Persistence changes require schema migration,
corruption recovery, bounded-history, and sensitive-value tests.

For desktop work run `pnpm desktop:check`, `pnpm desktop:test`, and, when native prerequisites are
available, `pnpm desktop:build`. Use temporary directories, in-memory storage, fake process
executors, and mocked native adapters in tests; never touch real user projects.

Prompt flows belong in the CLI package and must depend on `CreatePromptAdapter`, not direct Inquirer
calls. Keep question order deterministic, test default and explicit-option behavior with a fake
adapter, and ensure all confirmation occurs before invoking filesystem scaffolding.

For package or dependency changes, run `pnpm release:inspect` and `pnpm release:smoke`. These commands
pack the public workspaces, reject missing runtime files or unresolved `workspace:*` dependencies,
and install the tarballs under a temporary prefix. They never publish or alter a global npm install.
