import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import console from 'node:console';
import { withTemporaryDirectory } from './release-audit.mjs';
import { validatePackedInstallation } from './packed-validation.mjs';
import { packWorkspace } from './release-validation.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

await withTemporaryDirectory('forgecli-packed-archives-', async (directory) => {
  mkdirSync(directory, { recursive: true });
  const archives = packWorkspace(root, directory);
  const result = await validatePackedInstallation(root, archives);
  console.log(
    `Packed-install smoke passed: ${result.projects} projects, ${result.plugins} plugins, CLI ${result.cliVersion}.`,
  );
});
