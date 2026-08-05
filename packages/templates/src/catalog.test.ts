import { describe, expect, it } from 'vitest';
import { BUILTIN_TEMPLATES, renderBuiltinTemplate } from './catalog';

describe('built-in template catalog', () => {
  it('exposes the five trusted offline templates', () => {
    expect(BUILTIN_TEMPLATES.map(({ id }) => id)).toEqual([
      'nextjs-blank',
      'nextjs-dashboard',
      'nextjs-blog',
      'nextjs-portfolio',
      'nextjs-landing',
    ]);
  });

  it.each(BUILTIN_TEMPLATES)(
    '$name renders deterministically without remote or machine data',
    async (template) => {
      const options = { projectName: 'example-app', packageManager: 'pnpm' } as const;
      const first = await template.render(options);
      const second = await template.render(options);
      expect(first).toEqual(second);
      expect(first.files).toHaveLength(template.estimatedFileCount);
      expect(first.files.map(({ path }) => path)).toEqual(template.filePaths);
      const output = first.files.map(({ content }) => content).join('\n');
      expect(output).not.toMatch(/https?:\/\//u);
      expect(output).not.toMatch(/[A-Z]:\\Users\\|\/Users\//u);
      expect(output).not.toMatch(/\b20\d{2}-\d{2}-\d{2}\b/u);
      expect(
        first.files.some(({ path }) =>
          /(?:^|\/)(?:pnpm-lock\.yaml|package-lock\.json|yarn\.lock|bun\.lockb?)$/u.test(path),
        ),
      ).toBe(false);
    },
  );

  it('renders the dashboard structure and local-only styling', async () => {
    const rendered = await renderBuiltinTemplate('nextjs-dashboard', {
      projectName: 'dashboard-app',
      packageManager: 'npm',
    });
    expect(rendered.files.find(({ path }) => path === 'src/app/page.tsx')?.content).toContain(
      'Recent projects',
    );
    expect(rendered.files.find(({ path }) => path === 'src/app/globals.css')?.content).toContain(
      'grid-template-columns: 240px 1fr',
    );
    expect(rendered.files.find(({ path }) => path === 'package.json')?.content).toContain(
      '"packageManager": "npm@',
    );
  });
});
