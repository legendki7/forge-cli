# Developing a plugin

Create a safe starter without publishing or contacting a registry:

```sh
forge plugin create my-plugin
forge plugins validate ./my-plugin
forge plugins install ./my-plugin
forge plugins list
forge plugins inspect example.my-plugin
```

Edit `forgeki.plugin.json`, keep source files inside the plugin directory, and declare only the
permissions used by contributions. Validation prints a safety report and must succeed before install.
Installation copies a validated snapshot into ForgeKi application data; edits to the source folder do
not silently change the installed copy.

Use `forge plugins remove example.my-plugin` to remove its registry entry. Generated project files are
user-owned after generation and remain untouched. The repository includes curated EditorConfig, Zod,
Pino, CORS, and Redis examples; only EditorConfig is shown by default unless experimental bundled
plugins are enabled in ForgeKi Desktop settings.

Tests should cover valid manifests, permission mismatches, path traversal, lifecycle scripts,
duplicate contributions, idempotent install, integrity failure, generation collisions, and scanner
evidence. Run `pnpm lint`, `pnpm test`, and `pnpm build` before proposing a change.
