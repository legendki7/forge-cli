# @forgecli7/cli

The publishable command-line package for ForgeKi. The public package name must be confirmed before
the first beta release; the executable command remains `forge`.

```bash
npm install --global @forgecli7/cli
forge --help
forge workspaces presets
forge workspace create my-platform --preset saas-foundation --no-git
forge workspace check ./my-platform
```

Workspace creation uses the shared closed architecture model and atomic generator. It does not
install dependencies or start Docker, databases, or Redis. See the repository README and
`docs/workspaces/cli.md` for commands, safety guarantees, and contribution guidance.
