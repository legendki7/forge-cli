import {
  packageManagerCommand,
  SUPPORTED_PACKAGE_MANAGER_VERSIONS,
  type SupportedPackageManager,
} from '@forgecli/core';

export interface RenderedTemplateFile {
  path: string;
  content: string;
}

export const NEXTJS_DEPENDENCY_VERSIONS = {
  next: '^15.4.6',
  react: '^19.1.1',
  reactDom: '^19.1.1',
  typescript: '^5.9.2',
  reactTypes: '^19.1.10',
  reactDomTypes: '^19.1.7',
  nodeTypes: '^22.17.2',
  eslint: '^9.34.0',
  eslintConfigNext: '^15.4.6',
} as const;

export function renderNextjsTemplate(
  projectName: string,
  packageManager: SupportedPackageManager,
): RenderedTemplateFile[] {
  const manifest = {
    name: projectName,
    version: '0.1.0',
    private: true,
    packageManager: `${packageManager}@${SUPPORTED_PACKAGE_MANAGER_VERSIONS[packageManager]}`,
    scripts: {
      dev: 'next dev',
      build: 'next build',
      start: 'next start',
      lint: 'eslint .',
      typecheck: 'tsc --noEmit',
    },
    dependencies: {
      next: NEXTJS_DEPENDENCY_VERSIONS.next,
      react: NEXTJS_DEPENDENCY_VERSIONS.react,
      'react-dom': NEXTJS_DEPENDENCY_VERSIONS.reactDom,
    },
    devDependencies: {
      '@types/node': NEXTJS_DEPENDENCY_VERSIONS.nodeTypes,
      '@types/react': NEXTJS_DEPENDENCY_VERSIONS.reactTypes,
      '@types/react-dom': NEXTJS_DEPENDENCY_VERSIONS.reactDomTypes,
      eslint: NEXTJS_DEPENDENCY_VERSIONS.eslint,
      'eslint-config-next': NEXTJS_DEPENDENCY_VERSIONS.eslintConfigNext,
      typescript: NEXTJS_DEPENDENCY_VERSIONS.typescript,
    },
  };

  return [
    file('package.json', `${JSON.stringify(manifest, null, 2)}\n`),
    file(
      'tsconfig.json',
      `${JSON.stringify(
        {
          compilerOptions: {
            target: 'ES2017',
            lib: ['dom', 'dom.iterable', 'esnext'],
            allowJs: false,
            skipLibCheck: true,
            strict: true,
            noEmit: true,
            esModuleInterop: true,
            module: 'esnext',
            moduleResolution: 'bundler',
            resolveJsonModule: true,
            isolatedModules: true,
            jsx: 'preserve',
            incremental: true,
            plugins: [{ name: 'next' }],
            paths: { '@/*': ['./src/*'] },
          },
          include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'],
          exclude: ['node_modules'],
        },
        null,
        2,
      )}\n`,
    ),
    file(
      'next-env.d.ts',
      '/// <reference types="next" />\n/// <reference types="next/image-types/global" />\n',
    ),
    file(
      'next.config.ts',
      "import type { NextConfig } from 'next';\n\nconst config: NextConfig = {};\n\nexport default config;\n",
    ),
    file(
      'eslint.config.mjs',
      "import { defineConfig, globalIgnores } from 'eslint/config';\nimport nextVitals from 'eslint-config-next/core-web-vitals';\nimport nextTypeScript from 'eslint-config-next/typescript';\n\nexport default defineConfig([\n  ...nextVitals,\n  ...nextTypeScript,\n  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts']),\n]);\n",
    ),
    file('.gitignore', 'node_modules\n.next\nout\ndist\ncoverage\n.env\n.env.*\n*.log\n'),
    file('public/.gitkeep', ''),
    file(
      'src/app/layout.tsx',
      "import type { Metadata } from 'next';\nimport type { ReactNode } from 'react';\nimport './globals.css';\n\nexport const metadata: Metadata = {\n  title: 'ForgeCLI App',\n  description: 'Created with ForgeCLI',\n};\n\nexport default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {\n  return (\n    <html lang=\"en\">\n      <body>{children}</body>\n    </html>\n  );\n}\n",
    ),
    file(
      'src/app/page.tsx',
      `export default function Home() {\n  return (\n    <main>\n      <section>\n        <p>ForgeCLI</p>\n        <h1>${escapeJsx(projectName)}</h1>\n        <p>Your Next.js project is ready.</p>\n      </section>\n    </main>\n  );\n}\n`,
    ),
    file(
      'src/app/globals.css',
      '* { box-sizing: border-box; }\nhtml, body { margin: 0; min-height: 100%; }\nbody { background: #0b1020; color: #f7f8fc; font-family: Arial, sans-serif; }\nmain { display: grid; min-height: 100vh; place-items: center; padding: 2rem; }\nsection { max-width: 42rem; }\nh1 { font-size: clamp(2.5rem, 8vw, 5rem); margin: 0.5rem 0; }\np { color: #aeb8d0; line-height: 1.6; }\n',
    ),
    file('README.md', renderReadme(projectName, packageManager)),
  ];
}

function renderReadme(projectName: string, packageManager: SupportedPackageManager): string {
  const install = packageManager === 'npm' ? 'npm install' : `${packageManager} install`;
  return `# ${projectName}\n\nCreated with ForgeCLI using Next.js, TypeScript, and the App Router.\n\n## Commands\n\n\`\`\`bash\n${install}\n${packageManagerCommand(packageManager, 'dev')}\n${packageManagerCommand(packageManager, 'build')}\n${packageManagerCommand(packageManager, 'lint')}\n${packageManagerCommand(packageManager, 'typecheck')}\n\`\`\`\n`;
}

function file(path: string, content: string): RenderedTemplateFile {
  return { path, content };
}

function escapeJsx(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
