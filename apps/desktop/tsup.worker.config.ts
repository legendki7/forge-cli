import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/bridge/worker.ts'],
  format: ['cjs'],
  platform: 'node',
  target: 'node20',
  outDir: 'dist-worker',
  clean: true,
  splitting: false,
  sourcemap: false,
  noExternal: [/^@forgecli7\//u],
});
