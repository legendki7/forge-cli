import { describe, expect, it } from 'vitest';
import { validateNodeRuntime } from './runtime.js';

const supportedRange = '^20.0.0 || ^22.0.0 || ^24.0.0';

describe('Node.js runtime validation', () => {
  it.each(['20.0.0', 'v22.12.0', '24.1.0'])('accepts supported version %s', (version) => {
    expect(validateNodeRuntime(version, supportedRange)).toEqual({ supported: true });
  });

  it.each(['18.20.0', '21.0.0', '23.9.0', '25.0.0'])(
    'rejects unsupported version %s',
    (version) => {
      const result = validateNodeRuntime(version, supportedRange);
      expect(result.supported).toBe(false);
      expect(result.message).toContain('Install a supported Node.js release');
    },
  );

  it('fails safely for an unrecognized engine expression', () => {
    expect(validateNodeRuntime('22.0.0', '>=20')).toEqual({
      supported: false,
      message: 'ForgeCLI could not validate the Node.js runtime.',
    });
  });
});
