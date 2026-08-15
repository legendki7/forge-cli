# Workspace CLI

```bash
forge workspaces presets
forge workspaces show saas-foundation
forge workspace create my-platform --preset saas-foundation --no-git
forge workspace create --config forgeki.workspace.json --destination .
forge workspace check ./my-platform
forge workspace validate ./my-platform/forgeki.workspace.json
```

`create` uses the shared atomic generator. `check` is read-only and reports configuration or inferred evidence. Re-running creation into an existing destination fails safely. Configuration contains architecture only—never secrets, absolute paths, or executable commands.
