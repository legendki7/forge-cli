# Good first issue guidance

ForgeKi welcomes small, focused contributions. Maintainers can apply GitHub's `good first issue`
label to work that has a clear boundary, reproducible acceptance criteria, and no hidden security
decisions. This guide does not create remote issues.

Good starting categories include:

- correcting or clarifying documentation and local links;
- improving Arabic translations while preserving stable identifiers and terminology;
- adding regression tests for existing deterministic behavior;
- extending built-in template content without adding network dependencies;
- improving keyboard navigation, semantics, contrast, and RTL accessibility;
- refining small declarative plugin examples; and
- improving safe diagnostics without exposing private paths or values.

Before starting, comment on or open the relevant issue so the scope can be confirmed. A first change
should normally avoid Marketplace cryptography, updater trust, plugin permissions, network policy,
path safety, deployment generation, and release infrastructure. Those areas require deeper threat-
model review and explicit maintainer approval.

Follow [CONTRIBUTING.md](../../CONTRIBUTING.md), include tests when behavior changes, and run the
documented verification commands before opening a pull request.
