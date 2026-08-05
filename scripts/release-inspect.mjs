import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import console from 'node:console';
import { listTarball, packWorkspace, validatePackedWorkspace } from './release-validation.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporaryDirectory = mkdtempSync(path.join(tmpdir(), 'forgecli-release-inspect-'));

try {
  const archives = packWorkspace(root, temporaryDirectory);
  validatePackedWorkspace(archives);
  for (const archive of archives) {
    console.log(`\n${path.basename(archive)}`);
    for (const entry of listTarball(archive)) console.log(`  ${entry}`);
  }
  console.log('\nRelease inspection passed. No package was published.');
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
