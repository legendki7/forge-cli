import path from 'node:path';

export interface ProjectNameValidationResult {
  valid: boolean;
  message?: string;
}

const windowsReservedName = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

export function validateProjectName(projectName: string): ProjectNameValidationResult {
  if (!projectName) return invalid('Project name is required.');
  if (projectName === '.' || projectName === '..' || projectName.includes('..')) {
    return invalid('Project name must not contain path traversal.');
  }
  if (path.isAbsolute(projectName) || /^[a-zA-Z]:[\\/]/.test(projectName)) {
    return invalid('Project name must be relative to the current directory.');
  }
  if (/[\\/]/.test(projectName)) return invalid('Project name must not contain path separators.');
  if (
    [...projectName].some((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127;
    })
  ) {
    return invalid('Project name must not contain control characters.');
  }
  if (windowsReservedName.test(projectName) || /[. ]$/.test(projectName)) {
    return invalid('Project name is reserved or unsafe on supported filesystems.');
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(projectName)) {
    return invalid(
      'Project name may contain only letters, numbers, dots, hyphens, and underscores.',
    );
  }
  return { valid: true };
}

function invalid(message: string): ProjectNameValidationResult {
  return { valid: false, message };
}
