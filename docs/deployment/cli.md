# Deployment CLI

```bash
forge environments list
forge deployment targets
forge deployment targets ./my-platform
forge deployment check ./my-platform --env production --target kubernetes
forge deployment plan ./my-platform --env production --target kubernetes
forge deployment export ./my-platform --env staging --target docker --output ./forgeki-deployment
```

`plan` prints the exact files used by export. `export` lists additions, checks collisions, and asks for confirmation; automation may pass `--yes` as explicit confirmation. Existing files are never overwritten.

There is deliberately no `forge deploy` command. CLI output labels secret variables but never prints their values.
