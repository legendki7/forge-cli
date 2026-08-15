import type { ForgeWorkspace } from '@forgecli7/workspaces';
import { deploymentProjectFromWorkspace, type DeploymentProject } from './model.js';

export function saasWorkspace(): ForgeWorkspace {
  return {
    schemaVersion: 1,
    id: 'my-platform',
    name: 'my-platform',
    packageManager: 'pnpm',
    services: [
      {
        id: 'web',
        name: 'web',
        type: 'web',
        implementation: 'react-vite',
        path: 'apps/web',
        port: 5173,
      },
      {
        id: 'api',
        name: 'api',
        type: 'api',
        implementation: 'express',
        path: 'apps/api',
        port: 4000,
      },
      {
        id: 'postgres',
        name: 'postgres',
        type: 'database',
        implementation: 'postgres',
        path: 'infrastructure/postgres',
        port: 5432,
      },
      {
        id: 'cache',
        name: 'cache',
        type: 'infrastructure',
        implementation: 'redis',
        path: 'infrastructure/cache',
        port: 6379,
      },
      {
        id: 'shared',
        name: 'shared',
        type: 'shared-package',
        implementation: 'shared-types',
        path: 'packages/shared',
      },
    ],
    connections: [
      { id: 'web-http-api', sourceServiceId: 'web', targetServiceId: 'api', type: 'HTTP' },
      {
        id: 'api-database-postgres',
        sourceServiceId: 'api',
        targetServiceId: 'postgres',
        type: 'DATABASE',
      },
      { id: 'api-cache-cache', sourceServiceId: 'api', targetServiceId: 'cache', type: 'CACHE' },
      {
        id: 'web-shared-package-shared',
        sourceServiceId: 'web',
        targetServiceId: 'shared',
        type: 'SHARED_PACKAGE',
      },
    ],
    tooling: { initializeGit: false, docker: true, githubActions: true },
  };
}

export function saasProject(): DeploymentProject {
  return deploymentProjectFromWorkspace(saasWorkspace());
}
