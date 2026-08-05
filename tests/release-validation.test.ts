import { describe, expect, it } from 'vitest';
import { requiredCliFiles, validateTarballEntries } from '../scripts/release-validation.mjs';

describe('release tarball validation', () => {
  it('accepts the required publishable CLI files', () => {
    expect(() => validateTarballEntries(requiredCliFiles)).not.toThrow();
    expect(() =>
      validateTarballEntries(requiredCliFiles.map((file) => file.replaceAll('/', '\\'))),
    ).not.toThrow();
  });

  it('fails when a required runtime file is absent', () => {
    expect(() =>
      validateTarballEntries(requiredCliFiles.filter((file) => file !== 'package/dist/index.js')),
    ).toThrow('Missing required package files: package/dist/index.js');
  });

  it('rejects source tests and development-only files', () => {
    expect(() =>
      validateTarballEntries([...requiredCliFiles, 'package/src/program.test.ts']),
    ).toThrow('Development files included');
  });

  it('rejects any unexpected coverage artifact', () => {
    expect(() =>
      validateTarballEntries([...requiredCliFiles, 'package/coverage/index.html']),
    ).toThrow('Development files included');
  });
});
