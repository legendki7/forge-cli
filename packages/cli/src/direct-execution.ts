import { realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function isDirectExecution(
  moduleUrl: string,
  argvEntry: string | undefined = process.argv[1],
): boolean {
  if (!argvEntry) return false;

  try {
    const modulePath = canonicalPath(fileURLToPath(moduleUrl));
    const entryPath = canonicalPath(path.resolve(argvEntry));
    return modulePath === entryPath;
  } catch {
    return false;
  }
}

function canonicalPath(value: string): string {
  const resolved = path.normalize(realpathSync.native(value));
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}
