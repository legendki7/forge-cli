import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const ignoredDirectories = new Set([
  '.git',
  'coverage',
  'dist',
  'graphify-out',
  'node_modules',
  'release-staging',
  'target',
]);

function collectMarkdownFiles(directory) {
  const files = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;

    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectMarkdownFiles(fullPath));
    else if (entry.isFile() && entry.name.endsWith('.md')) files.push(fullPath);
  }

  return files;
}

const failures = [];
let checkedLinks = 0;
const linkPattern = /!?\[[^\]]*\]\(([^)]+)\)/gu;

for (const file of collectMarkdownFiles(root)) {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/u);
  let inCodeFence = false;

  for (const [index, line] of lines.entries()) {
    if (/^\s*```/u.test(line)) {
      inCodeFence = !inCodeFence;
      continue;
    }
    if (inCodeFence) continue;

    for (const match of line.matchAll(linkPattern)) {
      const rawTarget = match[1]?.trim().replace(/^<|>$/gu, '');
      if (
        !rawTarget ||
        rawTarget.startsWith('#') ||
        /^(?:https?:|mailto:|tel:)/iu.test(rawTarget)
      ) {
        continue;
      }

      const targetWithoutAnchor = rawTarget.split('#', 1)[0]?.split('?', 1)[0];
      if (!targetWithoutAnchor) continue;

      checkedLinks += 1;
      let decodedTarget;
      try {
        decodedTarget = decodeURIComponent(targetWithoutAnchor);
      } catch {
        failures.push(`${path.relative(root, file)}:${index + 1} invalid URL encoding`);
        continue;
      }

      const targetPath = decodedTarget.startsWith('/')
        ? path.join(root, decodedTarget.slice(1))
        : path.resolve(path.dirname(file), decodedTarget);
      if (!existsSync(targetPath)) {
        failures.push(`${path.relative(root, file)}:${index + 1} missing ${targetWithoutAnchor}`);
      }
    }
  }
}

if (failures.length > 0) {
  process.stderr.write(`Markdown link check failed (${failures.length}):\n`);
  for (const failure of failures) process.stderr.write(`- ${failure}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Verified ${checkedLinks} local Markdown links.\n`);
}
