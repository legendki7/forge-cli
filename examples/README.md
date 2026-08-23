# Examples

This directory contains small, reviewable examples rather than generated applications.

- [`plugins/editorconfig`](plugins/editorconfig/README.md) is a complete declarative community plugin
  example with a manifest and local file contribution.

Validate it from the repository root after installing dependencies:

```bash
pnpm dev plugins validate ./examples/plugins/editorconfig
```

Examples must remain deterministic, free of credentials and machine-specific paths, and safe to
inspect without network access.
