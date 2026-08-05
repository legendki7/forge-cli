export interface RuntimeValidationResult {
  supported: boolean;
  message?: string;
}

export function validateNodeRuntime(
  currentVersion: string,
  supportedRange: string,
): RuntimeValidationResult {
  const current = parseVersion(currentVersion);
  const supported = supportedRange
    .split('||')
    .map((clause) => clause.trim())
    .map((clause) => /^\^(\d+)\.(\d+)\.(\d+)$/.exec(clause))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => ({
      major: Number(match[1]),
      minor: Number(match[2]),
      patch: Number(match[3]),
    }));

  if (!current || supported.length === 0) {
    return { supported: false, message: 'ForgeCLI could not validate the Node.js runtime.' };
  }

  const match = supported.find((minimum) => minimum.major === current.major);
  if (match && compareVersions(current, match) >= 0) return { supported: true };
  return {
    supported: false,
    message: `ForgeCLI requires Node.js ${supportedRange}. Current version: ${currentVersion}. Install a supported Node.js release and try again.`,
  };
}

function parseVersion(value: string): { major: number; minor: number; patch: number } | undefined {
  const match = /^(?:v)?(\d+)\.(\d+)\.(\d+)/.exec(value);
  if (!match) return undefined;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

function compareVersions(
  left: { major: number; minor: number; patch: number },
  right: { major: number; minor: number; patch: number },
): number {
  return left.major - right.major || left.minor - right.minor || left.patch - right.patch;
}
