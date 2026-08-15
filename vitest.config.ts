import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@forgecli7/core/package-managers': fileURLToPath(
        new URL('./packages/core/src/package-managers.ts', import.meta.url),
      ),
      '@forgecli7/core/project-name': fileURLToPath(
        new URL('./packages/core/src/project-name.ts', import.meta.url),
      ),
      '@forgecli7/core/stacks': fileURLToPath(
        new URL('./packages/core/src/stacks.ts', import.meta.url),
      ),
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
      '@forgecli7/workspaces': fileURLToPath(
        new URL('./packages/workspaces/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'node',
    testTimeout: 15_000,
    hookTimeout: 15_000,
    include: ['packages/**/*.test.ts', 'tests/**/*.test.ts'],
    coverage: {
      reporter: ['text', 'html'],
    },
  },
});
