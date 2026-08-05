export type SupportedPackageManager = 'pnpm' | 'npm' | 'yarn' | 'bun';

export const SUPPORTED_PACKAGE_MANAGER_VERSIONS: Record<SupportedPackageManager, string> = {
  pnpm: '10.15.0',
  npm: '11.5.2',
  yarn: '4.9.2',
  bun: '1.2.20',
};

export function packageManagerCommand(
  packageManager: SupportedPackageManager,
  script: 'dev' | 'build' | 'start' | 'lint' | 'typecheck' | 'test',
): string {
  switch (packageManager) {
    case 'pnpm':
      return `pnpm ${script}`;
    case 'npm':
      return `npm run ${script}`;
    case 'yarn':
      return `yarn ${script}`;
    case 'bun':
      return `bun run ${script}`;
  }
}
