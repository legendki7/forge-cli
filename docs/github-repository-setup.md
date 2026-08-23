# GitHub repository setup recommendations

These are owner actions for `https://github.com/legendki7/forge-cli`. They document recommended
remote settings but do not claim those settings are currently enabled.

## Description

> Open-source, local-first Desktop and CLI tools for deterministic project, stack, and workspace
> generation.

## Topics

Suggested accurate topics:

```text
developer-tools
typescript
rust
tauri
react
cli
open-source
nextjs
vite
express
docker
```

## Repository features

- Enable Issues for bug reports and focused feature requests.
- Consider Discussions for community questions when maintainers are ready to moderate them.
- Consider Projects only if it helps maintain the public roadmap.
- Enable private vulnerability reporting through GitHub Security Advisories.
- Use the official ForgeKi brand asset as the basis for a future social preview; create a dedicated
  preview composition rather than stretching or altering the logo.

## Recommended `main` protection

- Require pull requests before merging.
- Require the CI workflow to pass.
- Prevent force pushes.
- Prevent branch deletion.
- Keep owner bypass policy explicit so protection does not unexpectedly block emergency maintenance.

Review these settings in GitHub before enabling them. This repository documentation does not mutate
or verify remote configuration.
