# @forgecli7/plugin-sdk

Public types, deterministic helpers, and runtime validation for ForgeKi's restricted declarative
plugin format. Manifests contain data only: this package exposes no execution hooks and ForgeKi
never executes community plugin code.

```ts
import { defineForgeKiPlugin } from '@forgecli7/plugin-sdk';

const plugin = defineForgeKiPlugin({
  manifestVersion: 1,
  id: 'example.editorconfig',
  name: 'EditorConfig',
  version: '0.1.0',
  description: 'Adds a shared editor configuration.',
  author: { name: 'Example Publisher' },
  license: 'MIT',
  compatibility: { forgeki: '>=0.3.0' },
  supportedFrameworks: ['nextjs', 'react-vite', 'express'],
  permissions: ['project:generate-files'],
  contributions: {
    generatedFiles: [{ path: '.editorconfig', content: 'root = true\n' }],
  },
});
```

See `docs/plugins/sdk.md` and `docs/plugins/manifest.md` in the ForgeKi repository.
