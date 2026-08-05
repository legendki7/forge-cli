import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@forgecli/core': fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url)),
      '@forgecli/plugin-docker': fileURLToPath(
        new URL('./packages/plugins/plugin-docker/src/index.ts', import.meta.url),
      ),
      '@forgecli/plugin-github-actions': fileURLToPath(
        new URL('./packages/plugins/plugin-github-actions/src/index.ts', import.meta.url),
      ),
      '@forgecli/plugins': fileURLToPath(
        new URL('./packages/plugins/src/index.ts', import.meta.url),
      ),
      '@forgecli/templates': fileURLToPath(
        new URL('./packages/templates/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'node',
    include: ['packages/**/*.test.ts', 'tests/**/*.test.ts'],
    coverage: {
      reporter: ['text', 'html'],
    },
  },
});
