import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { scanWorkspace } from './scanner.js';

const temporary: string[] = [];
afterEach(async () =>
  Promise.all(
    temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  ),
);

describe('workspace scanner', () => {
  it('infers supported services without changing the workspace', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'forgeki-scan-'));
    temporary.push(root);
    await mkdir(path.join(root, 'apps/web'), { recursive: true });
    await mkdir(path.join(root, 'apps/api'), { recursive: true });
    await writeFile(
      path.join(root, 'package.json'),
      JSON.stringify({ name: 'scan-demo', packageManager: 'pnpm@10.15.0' }),
    );
    await writeFile(
      path.join(root, 'apps/web/package.json'),
      JSON.stringify({ dependencies: { react: '^19', vite: '^7' } }),
    );
    await writeFile(
      path.join(root, 'apps/api/package.json'),
      JSON.stringify({ dependencies: { express: '^5' } }),
    );
    const result = await scanWorkspace(root);
    expect(result.source).toBe('inferred');
    expect(result.definition.services.map(({ implementation }) => implementation).sort()).toEqual([
      'express',
      'react-vite',
    ]);
    expect(result.definition.connections[0]?.type).toBe('HTTP');
  });
});
