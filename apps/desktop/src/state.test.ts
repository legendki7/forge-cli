import { describe, expect, it } from 'vitest';
import {
  createRequest,
  devCommand,
  initialFormState,
  initialProgress,
  installCommand,
  sanitizeTechnicalDetails,
  validateForm,
} from './state';

describe('desktop form state', () => {
  it('trims accidental surrounding whitespace without renaming the project', () => {
    const form = {
      ...initialFormState,
      projectName: '  my-app  ',
      destinationDirectory: '/projects',
    };
    expect(validateForm(form)).toEqual({});
    expect(createRequest(form).projectName).toBe('my-app');
  });

  it('marks only unrequested optional progress as skipped', () => {
    const progress = initialProgress({ ...initialFormState, addDocker: true });
    expect(progress.find((step) => step.step === 'git')?.state).toBe('waiting');
    expect(progress.find((step) => step.step === 'docker')?.state).toBe('waiting');
    expect(progress.find((step) => step.step === 'github-actions')?.state).toBe('skipped');
  });

  it.each([
    ['pnpm', 'pnpm install', 'pnpm dev'],
    ['npm', 'npm install', 'npm run dev'],
    ['yarn', 'yarn install', 'yarn dev'],
    ['bun', 'bun install', 'bun dev'],
  ] as const)('renders %s-specific next-step commands', (manager, install, dev) => {
    expect(installCommand(manager)).toBe(install);
    expect(devCommand(manager)).toBe(dev);
  });

  it('redacts machine paths and token-shaped details', () => {
    const fakeToken = ['npm', '_abcdefghijklmnopqrstuvwxyz'].join('');
    expect(sanitizeTechnicalDetails(`C:\\Users\\secret\\repo ${fakeToken}`)).toBe(
      '%USERPROFILE%\\repo [redacted]',
    );
  });
});
