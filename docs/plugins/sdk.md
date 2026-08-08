# Plugin SDK

Install the public type-and-validation package in a plugin authoring workspace:

```sh
pnpm add -D @forgecli7/plugin-sdk
```

Use `defineForgeKiPlugin()` for typed manifests and `validatePluginManifest()` at trust boundaries.
The SDK also exports helpers for stack components, template contributions, compatibility rules, and
scanner rules, plus deterministic serialization and a user-facing safety report.

```ts
import { defineForgeKiPlugin } from '@forgecli7/plugin-sdk';

export const manifest = defineForgeKiPlugin({
  manifestVersion: 1,
  id: 'example.editorconfig',
  name: 'EditorConfig',
  version: '0.1.0',
  description: 'Adds editor defaults.',
  author: 'Example Publisher',
  license: 'MIT',
  compatibility: { forgeki: '>=0.3.0' },
  supportedFrameworks: ['nextjs'],
  permissions: ['project:generate-files'],
  contributions: { generatedFiles: [{ path: '.editorconfig', content: 'root = true\n' }] },
});
```

The TypeScript helper is for authoring only. ForgeKi installs the JSON manifest and referenced data
files; it never loads the module above.
