import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@forgecli7/core/project-name': fileURLToPath(
        new URL('../../packages/core/src/project-name.ts', import.meta.url),
      ),
      '@forgecli7/core/package-managers': fileURLToPath(
        new URL('../../packages/core/src/package-managers.ts', import.meta.url),
      ),
      '@forgecli7/core/stacks': fileURLToPath(
        new URL('../../packages/core/src/stacks.ts', import.meta.url),
      ),
      '@forgecli7/core': fileURLToPath(
        new URL('../../packages/core/src/index.ts', import.meta.url),
      ),
      '@forgecli7/plugin-sdk': fileURLToPath(
        new URL('../../packages/plugin-sdk/src/index.ts', import.meta.url),
      ),
      '@forgecli7/plugin-docker': fileURLToPath(
        new URL('../../packages/plugins/plugin-docker/src/index.ts', import.meta.url),
      ),
      '@forgecli7/plugin-github-actions': fileURLToPath(
        new URL('../../packages/plugins/plugin-github-actions/src/index.ts', import.meta.url),
      ),
      '@forgecli7/plugins': fileURLToPath(
        new URL('../../packages/plugins/src/index.ts', import.meta.url),
      ),
      '@forgecli7/templates/catalog': fileURLToPath(
        new URL('../../packages/templates/src/catalog.ts', import.meta.url),
      ),
      '@forgecli7/templates': fileURLToPath(
        new URL('../../packages/templates/src/index.ts', import.meta.url),
      ),
      '@forgecli7/workspaces/model': fileURLToPath(
        new URL('../../packages/workspaces/src/model.ts', import.meta.url),
      ),
      '@forgecli7/workspaces/generation': fileURLToPath(
        new URL('../../packages/workspaces/src/generation.ts', import.meta.url),
      ),
      '@forgecli7/workspaces/scanner': fileURLToPath(
        new URL('../../packages/workspaces/src/scanner.ts', import.meta.url),
      ),
      '@forgecli7/workspaces': fileURLToPath(
        new URL('../../packages/workspaces/src/index.ts', import.meta.url),
      ),
      '@forgecli7/deployments/browser': fileURLToPath(
        new URL('../../packages/deployments/src/browser.ts', import.meta.url),
      ),
      '@forgecli7/deployments': fileURLToPath(
        new URL('../../packages/deployments/src/index.ts', import.meta.url),
      ),
      '@forgecli7/marketplace/browser': fileURLToPath(
        new URL('../../packages/marketplace/src/browser.ts', import.meta.url),
      ),
      '@forgecli7/marketplace': fileURLToPath(
        new URL('../../packages/marketplace/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'jsdom',
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    clearMocks: true,
  },
});
