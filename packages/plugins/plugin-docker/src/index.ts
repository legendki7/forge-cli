import { access } from 'node:fs/promises';
import path from 'node:path';
import type {
  ForgePlugin,
  PluginApplyResult,
  PluginContext,
  PluginDetectionResult,
} from '@forgecli/core';
import { createFileSafely, detectProject } from '@forgecli/core';
import { dockerignore, generateDockerfile } from './templates.js';

const managedFiles = ['Dockerfile', '.dockerignore'] as const;

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function detect(context: PluginContext): Promise<PluginDetectionResult> {
  const states = await Promise.all(
    managedFiles.map(async (file) => ({
      file,
      exists: await exists(path.join(context.cwd, file)),
    })),
  );
  const files = states.filter((state) => state.exists).map((state) => state.file);
  const detected = files.length === managedFiles.length;

  return {
    detected,
    state: detected ? 'configured' : files.length > 0 ? 'partial' : 'not-configured',
    files,
    message: detected
      ? 'Docker is already configured; Dockerfile and .dockerignore are present.'
      : files.length > 0
        ? `Docker is partially configured; found ${files.join(', ')}.`
        : 'Docker is not configured yet.',
  };
}

async function apply(context: PluginContext): Promise<PluginApplyResult> {
  const project = await detectProject(context.cwd);
  if (project.framework === 'unknown') {
    return {
      status: 'unsupported',
      message:
        'Docker configuration was not created because this directory is not a supported Node.js project.',
      createdFiles: [],
      skippedFiles: [],
    };
  }

  const contents: Record<(typeof managedFiles)[number], string> = {
    Dockerfile: generateDockerfile(project),
    '.dockerignore': dockerignore,
  };
  const createdFiles: string[] = [];
  const skippedFiles: string[] = [];

  for (const file of managedFiles) {
    const created = await createFileSafely(path.join(context.cwd, file), contents[file]);
    (created ? createdFiles : skippedFiles).push(file);
  }

  if (createdFiles.length === 0) {
    return {
      status: 'skipped',
      message: 'Docker is already configured. Existing files were left unchanged.',
      createdFiles,
      skippedFiles,
    };
  }

  const preserved = skippedFiles.length > 0 ? ` Preserved: ${skippedFiles.join(', ')}.` : '';
  return {
    status: 'applied',
    message: `Docker configuration created: ${createdFiles.join(', ')}.${preserved}`,
    createdFiles,
    skippedFiles,
  };
}

export const dockerPlugin: ForgePlugin = {
  id: 'docker',
  name: 'Docker',
  description: 'Add a Dockerfile and .dockerignore to a Node.js project.',
  detect,
  apply,
};
