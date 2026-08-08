# ForgeKi plugin platform

ForgeKi supports two deliberately separate extension models:

- **Built-in plugins** are trusted TypeScript implementations shipped with ForgeKi. Docker and
  GitHub Actions use this model.
- **Community plugins** are untrusted, declarative manifests. They can describe files, dependencies,
  package scripts, environment-variable schemas, Stack Builder components, templates, and bounded
  scanner rules. ForgeKi never imports or executes plugin JavaScript.

The Marketplace is an offline catalog with Built-in, Bundled, and Local providers. Bundled examples
are previews until the user confirms installation. Local plugins are copied into ForgeKi's application
data directory, validated again when loaded, and disabled if an integrity check fails. No provider
downloads remote code in this release.

Installed community components participate in the same deterministic generation plan as built-in
components. Existing conflict detection, ownership tracking, safe path rules, and no-overwrite writes
still apply. Removing a plugin does not delete files it previously generated.

See [the manifest reference](manifest.md), [SDK guide](sdk.md),
[security model](security.md), and [development workflow](development.md).
