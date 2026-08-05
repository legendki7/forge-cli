import { describe, expect, it } from 'vitest';
import { validateProjectName } from './project-name.js';

describe('validateProjectName', () => {
  it.each(['my-app', 'web', 'forge-demo', 'app123'])('accepts %s', (name) => {
    expect(validateProjectName(name)).toEqual({ valid: true });
  });

  it.each([
    ['', 'required'],
    ['..', 'traversal'],
    ['../outside', 'traversal'],
    ['/absolute/path', 'relative'],
    ['C:\\project', 'relative'],
    ['my/app', 'path separators'],
    ['my\\app', 'path separators'],
    ['bad\u0000name', 'control'],
    ['CON', 'reserved'],
  ])('rejects unsafe name %j', (name, message) => {
    const result = validateProjectName(name);
    expect(result.valid).toBe(false);
    expect(result.message?.toLowerCase()).toContain(message);
  });
});
