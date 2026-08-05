# Contributing

1. Install Node.js 20, 22, or 24 and pnpm 9+.
2. Run `pnpm install`.
3. Create a focused branch and add a changeset when public package behavior changes.
4. Run `pnpm lint`, `pnpm test`, and `pnpm build` before submitting a pull request.

Keep package APIs explicit, avoid importing package internals, and add tests at the narrowest useful
boundary.

Next.js template files are rendered in `packages/templates/src/nextjs/template.ts`. Keep rendering
deterministic, centralize dependency versions, terminate generated text files with newlines, and never
include timestamps, absolute paths, fetched content, or fabricated lockfile data.

Prompt flows belong in the CLI package and must depend on `CreatePromptAdapter`, not direct Inquirer
calls. Keep question order deterministic, test default and explicit-option behavior with a fake
adapter, and ensure all confirmation occurs before invoking filesystem scaffolding.

For package or dependency changes, run `pnpm release:inspect` and `pnpm release:smoke`. These commands
pack the public workspaces, reject missing runtime files or unresolved `workspace:*` dependencies,
and install the tarballs under a temporary prefix. They never publish or alter a global npm install.
