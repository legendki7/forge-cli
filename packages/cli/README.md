# @forgecli7/cli

ForgeKi CLI provides deterministic project, stack, workspace, deployment, and restricted plugin
workflows. It also provides trusted Marketplace status/refresh/search/show, explicit verified remote
plugin install/update commands, deterministic package verification, and an informational signed
update check. Production Marketplace and update providers are currently unconfigured; arbitrary
package URLs and self-update are intentionally unsupported.

The publishable command-line package for ForgeKi. The public package name must be confirmed before
the first beta release; the executable command remains `forge`.

```bash
npm install --global @forgecli7/cli
forge --help
forge doctor --json
forge workspaces presets
forge workspace create my-platform --preset saas-foundation --no-git
forge workspace check ./my-platform
forge environments list
forge deployment check ./my-platform --env production --target kubernetes
forge deployment plan ./my-platform --env production --target kubernetes
forge deployment export ./my-platform --env staging --target docker --output ./deployment
```

Workspace creation uses the shared closed architecture model and atomic generator. It does not
install dependencies or start Docker, databases, or Redis. See the repository README and
`docs/workspaces/cli.md` for commands, safety guarantees, and contribution guidance.

ForgeKi generates deployment configuration. It does not deploy, contact clouds or Kubernetes, push
images, or store secret values. There is no `forge deploy` command.
