import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@forgecli7/core': fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url)),
      '@forgecli7/plugin-docker': fileURLToPath(
        new URL('./packages/plugins/plugin-docker/src/index.ts', import.meta.url),
      ),
      '@forgecli7/plugin-github-actions': fileURLToPath(
        new URL('./packages/plugins/plugin-github-actions/src/index.ts', import.meta.url),
      ),
      '@forgecli7/plugins': fileURLToPath(
        new URL('./packages/plugins/src/index.ts', import.meta.url),
      ),
      '@forgecli7/templates': fileURLToPath(
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
