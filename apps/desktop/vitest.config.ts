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
      '@forgecli7/core': fileURLToPath(
        new URL('../../packages/core/src/index.ts', import.meta.url),
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
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    clearMocks: true,
  },
});
