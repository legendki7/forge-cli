# Manifest v1 reference

Every community plugin contains `forgeki.plugin.json`. Manifest v1 has a closed schema: unknown fields
are rejected.

```json
{
  "manifestVersion": 1,
  "id": "example.editorconfig",
  "name": "EditorConfig",
  "version": "0.1.0",
  "description": "Adds editor defaults.",
  "author": { "name": "Example Publisher" },
  "license": "MIT",
  "compatibility": { "forgeki": ">=0.3.0" },
  "supportedFrameworks": ["nextjs", "react-vite", "express"],
  "permissions": ["project:generate-files", "project:add-stack-components"],
  "contributions": {
    "stackComponents": [
      {
        "id": "editorconfig",
        "name": "EditorConfig",
        "description": "Consistent editor behavior.",
        "category": "tooling",
        "supportedFrameworks": ["nextjs", "react-vite", "express"]
      }
    ],
    "generatedFiles": [
      {
        "path": ".editorconfig",
        "content": "root = true\n",
        "condition": { "component": "editorconfig" }
      }
    ]
  }
}
```

Supported permissions are `project:generate-files`, `project:add-dependencies`,
`project:add-scripts`, `project:add-env-schema`, `project:add-stack-components`, and
`project:add-scanner-rules`. A contribution is rejected unless its matching permission is declared.

Generated files use a safe relative `path` and either inline `content` or a relative `source` file.
Only `{{project.name}}`, `{{project.framework}}`, and `{{project.packageManager}}` template variables
are supported. Dependencies must be registry versions or ranges. Install lifecycle scripts, shell
operators, executable file extensions, absolute/traversal paths, URLs as file sources, duplicate IDs,
and oversized bundles are blocked.

Scanner evidence is bounded to dependency, dev dependency, file, package script, or environment
variable presence. Rules cannot read arbitrary locations or execute probes.
