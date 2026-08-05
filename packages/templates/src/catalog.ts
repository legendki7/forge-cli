import type { SupportedPackageManager } from '@forgecli7/core';
import { validateProjectName } from '@forgecli7/core/project-name';
import { renderNextjsTemplate, type RenderedTemplateFile } from './nextjs/template.js';

export type TemplateId =
  'nextjs-blank' | 'nextjs-dashboard' | 'nextjs-blog' | 'nextjs-portfolio' | 'nextjs-landing';
export type TemplateCategory = 'starter' | 'dashboard' | 'content' | 'portfolio' | 'marketing';
export type TemplateDifficulty = 'beginner' | 'intermediate';

export interface TemplateOptions {
  projectName: string;
  packageManager: SupportedPackageManager;
}

export interface TemplateValidationResult {
  valid: boolean;
  message?: string;
}

export interface RenderedTemplate {
  templateId: TemplateId;
  files: RenderedTemplateFile[];
}

export interface ForgeKiTemplate {
  id: TemplateId;
  name: string;
  description: string;
  framework: 'nextjs';
  category: TemplateCategory;
  difficulty: TemplateDifficulty;
  features: readonly string[];
  estimatedFileCount: number;
  filePaths: readonly string[];
  validateOptions(options: TemplateOptions): TemplateValidationResult;
  render(options: TemplateOptions): Promise<RenderedTemplate>;
}

interface TemplateDefinition {
  id: TemplateId;
  name: string;
  description: string;
  category: TemplateCategory;
  difficulty: TemplateDifficulty;
  features: readonly string[];
  page: (projectName: string) => string;
  css: string;
  additionalFiles?: readonly RenderedTemplateFile[];
}

const definitions: readonly TemplateDefinition[] = [
  {
    id: 'nextjs-blank',
    name: 'Blank Next.js App',
    description: 'A minimal TypeScript App Router foundation.',
    category: 'starter',
    difficulty: 'beginner',
    features: ['TypeScript', 'App Router', 'Local CSS'],
    page: (name) =>
      `export default function Home() {\n  return (\n    <main>\n      <section>\n        <p>ForgeKi</p>\n        <h1>${escapeJsx(name)}</h1>\n        <p>Your Next.js project is ready.</p>\n      </section>\n    </main>\n  );\n}\n`,
    css: baseCss(
      'main { display: grid; min-height: 100vh; place-items: center; padding: 2rem; }\nsection { max-width: 42rem; }\nh1 { font-size: clamp(2.5rem, 8vw, 5rem); margin: 0.5rem 0; }',
    ),
  },
  {
    id: 'nextjs-dashboard',
    name: 'Next.js Dashboard',
    description: 'A responsive admin dashboard with navigation, metrics, and a sample table.',
    category: 'dashboard',
    difficulty: 'intermediate',
    features: ['Responsive sidebar', 'Top navigation', 'Metric cards', 'Sample table'],
    page: () =>
      `const metrics = [['Active projects', '12'], ['Deployments', '48'], ['Team members', '8']];\nconst rows = [['Atlas', 'Healthy', '2 min ago'], ['Beacon', 'Review', '1 hour ago'], ['Canvas', 'Healthy', 'Yesterday']];\n\nexport default function Dashboard() {\n  return (\n    <main className="dashboard">\n      <aside><strong>ForgeKi</strong><nav><a href="#overview">Overview</a><a href="#projects">Projects</a><a href="#settings">Settings</a></nav></aside>\n      <section className="workspace">\n        <header><div><p>Workspace</p><h1>Dashboard</h1></div><button type="button">New project</button></header>\n        <div className="metrics">{metrics.map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}</div>\n        <article className="table-card"><h2>Recent projects</h2><div className="table-wrap"><table><thead><tr><th>Project</th><th>Status</th><th>Updated</th></tr></thead><tbody>{rows.map(([project, status, updated]) => <tr key={project}><td>{project}</td><td><span className="status">{status}</span></td><td>{updated}</td></tr>)}</tbody></table></div></article>\n      </section>\n    </main>\n  );\n}\n`,
    css: baseCss(
      '.dashboard { display: grid; grid-template-columns: 240px 1fr; min-height: 100vh; }\naside { padding: 2rem; background: #111827; }\naside strong { font-size: 1.35rem; }\nnav { display: grid; gap: .5rem; margin-top: 2rem; }\nnav a { padding: .7rem; border-radius: .5rem; color: #cbd5e1; text-decoration: none; }\nnav a:first-child { color: white; background: #334155; }\n.workspace { padding: 2rem; overflow: hidden; }\nheader { display: flex; align-items: center; justify-content: space-between; }\nheader p, h1 { margin: 0; }\nbutton { border: 0; border-radius: .55rem; padding: .7rem 1rem; color: white; background: #6d5dfc; }\n.metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin: 2rem 0; }\n.metrics article, .table-card { padding: 1.2rem; border: 1px solid #263146; border-radius: .8rem; background: #111827; }\n.metrics span { display: block; color: #94a3b8; }\n.metrics strong { display: block; margin-top: .5rem; font-size: 2rem; }\n.table-wrap { overflow-x: auto; }\ntable { width: 100%; border-collapse: collapse; }\nth, td { padding: .8rem; border-bottom: 1px solid #263146; text-align: left; }\n.status { color: #86efac; }\n@media (max-width: 720px) { .dashboard { grid-template-columns: 1fr; } aside { display: none; } .metrics { grid-template-columns: 1fr; } .workspace { padding: 1rem; } }',
    ),
  },
  {
    id: 'nextjs-blog',
    name: 'Next.js Blog',
    description: 'A local-content blog with sample posts and responsive typography.',
    category: 'content',
    difficulty: 'beginner',
    features: ['Sample posts', 'Post routes', 'Metadata', 'Responsive typography'],
    page: () =>
      `import Link from 'next/link';\nimport { posts } from './posts';\n\nexport default function Blog() {\n  return <main><header><p>ForgeKi Journal</p><h1>Notes on building thoughtful software.</h1></header><section>{posts.map((post) => <article key={post.slug}><p>{post.date}</p><h2><Link href={\`/posts/\${post.slug}\`}>{post.title}</Link></h2><p>{post.summary}</p></article>)}</section></main>;\n}\n`,
    css: baseCss(
      'main { width: min(760px, calc(100% - 2rem)); margin: auto; padding: 4rem 0; }\nheader { padding-bottom: 2rem; border-bottom: 1px solid #2a3449; }\nh1 { max-width: 12ch; font-size: clamp(2.5rem, 7vw, 4.8rem); line-height: 1.02; }\narticle { padding: 1.5rem 0; border-bottom: 1px solid #2a3449; }\na { color: #f7f8fc; }\np { color: #aeb8d0; line-height: 1.75; }',
    ),
    additionalFiles: [
      file(
        'src/app/posts.ts',
        "export const posts = [{ slug: 'offline-first', title: 'Designing offline-first tools', summary: 'Why local capability creates dependable developer experiences.', date: 'Article one' }, { slug: 'safe-automation', title: 'Safe automation by default', summary: 'Boundaries that make project tooling predictable.', date: 'Article two' }] as const;\n",
      ),
      file(
        'src/app/posts/[slug]/page.tsx',
        "import { notFound } from 'next/navigation';\nimport { posts } from '../../posts';\n\nexport function generateStaticParams() { return posts.map(({ slug }) => ({ slug })); }\nexport default async function Post({ params }: { params: Promise<{ slug: string }> }) { const { slug } = await params; const post = posts.find((item) => item.slug === slug); if (!post) notFound(); return <main><a href=\"/\">Back to posts</a><article><p>{post.date}</p><h1>{post.title}</h1><p>{post.summary}</p></article></main>; }\n",
      ),
    ],
  },
  {
    id: 'nextjs-portfolio',
    name: 'Next.js Portfolio',
    description: 'A restrained portfolio with projects, skills, and contact placeholders.',
    category: 'portfolio',
    difficulty: 'beginner',
    features: ['Introduction', 'Projects', 'Skills', 'Contact placeholder'],
    page: () =>
      `const projects = ['Design system', 'Developer platform', 'Open-source toolkit'];\nexport default function Portfolio() { return <main><nav><strong>Portfolio</strong><a href="#contact">Contact</a></nav><header><p>Hello, I am a software developer.</p><h1>I build useful, dependable digital products.</h1></header><section><h2>Selected projects</h2><div className="grid">{projects.map((project) => <article key={project}><span>Case study</span><h3>{project}</h3><p>A short placeholder describing the problem, process, and outcome.</p></article>)}</div></section><section><h2>Skills</h2><p>TypeScript · Product engineering · Accessible interfaces · Developer experience</p></section><section id="contact"><h2>Contact</h2><p>Replace this text with your preferred contact information.</p></section></main>; }\n`,
    css: baseCss(
      'main { width: min(1040px, calc(100% - 2rem)); margin: auto; padding: 2rem 0 5rem; }\nnav { display: flex; justify-content: space-between; }\na { color: #c4b5fd; }\nheader { padding: 8rem 0; }\nheader h1 { max-width: 14ch; font-size: clamp(3rem, 8vw, 6rem); line-height: .98; }\nsection { padding: 3rem 0; border-top: 1px solid #2a3449; }\n.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; }\narticle { padding: 1.3rem; border-radius: .8rem; background: #141b2d; }\np { color: #aeb8d0; line-height: 1.7; }\n@media (max-width: 720px) { .grid { grid-template-columns: 1fr; } header { padding: 5rem 0; } }',
    ),
  },
  {
    id: 'nextjs-landing',
    name: 'Next.js Landing Page',
    description: 'A focused marketing page with local styling and clear calls to action.',
    category: 'marketing',
    difficulty: 'beginner',
    features: ['Hero', 'Feature grid', 'Call to action', 'Footer'],
    page: () =>
      `const features = [['Fast foundation', 'Start with a focused TypeScript codebase.'], ['Offline ready', 'No remote assets or runtime services.'], ['Built to adapt', 'Clear sections are easy to extend.']];\nexport default function Landing() { return <main><nav><strong>Northstar</strong><a href="#start">Get started</a></nav><section className="hero"><p>Ship with confidence</p><h1>A clearer way to build your next product.</h1><p>Northstar gives your team a focused, dependable foundation.</p><a className="button" href="#start">Start building</a></section><section className="features">{features.map(([title, text]) => <article key={title}><h2>{title}</h2><p>{text}</p></article>)}</section><section className="cta" id="start"><h2>Ready to begin?</h2><p>Replace this copy with your product message.</p><a className="button" href="mailto:hello@example.invalid">Contact us</a></section><footer>Northstar · Built locally with ForgeKi</footer></main>; }\n`,
    css: baseCss(
      'main { width: min(1120px, calc(100% - 2rem)); margin: auto; }\nnav { display: flex; justify-content: space-between; padding: 1.5rem 0; }\na { color: inherit; }\n.hero { padding: 8rem 0; text-align: center; }\n.hero h1 { max-width: 13ch; margin: 1rem auto; font-size: clamp(3rem, 8vw, 6rem); line-height: .98; }\n.hero p { max-width: 42rem; margin: 1rem auto 2rem; }\n.button { display: inline-block; padding: .8rem 1.1rem; border-radius: .6rem; color: white; background: #6d5dfc; text-decoration: none; }\n.features { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; }\n.features article, .cta { padding: 2rem; border: 1px solid #2a3449; border-radius: 1rem; background: #111827; }\n.cta { margin: 5rem 0; text-align: center; }\nfooter { padding: 2rem 0; color: #94a3b8; }\np { color: #aeb8d0; line-height: 1.7; }\n@media (max-width: 720px) { .features { grid-template-columns: 1fr; } .hero { padding: 5rem 0; } }',
    ),
  },
] as const;

export const BUILTIN_TEMPLATES: readonly ForgeKiTemplate[] = definitions.map((definition) => {
  const filePaths = [
    ...renderNextjsTemplate('project', 'pnpm').map(({ path }) => path),
    ...(definition.additionalFiles?.map(({ path }) => path) ?? []),
  ];
  return {
    id: definition.id,
    name: definition.name,
    description: definition.description,
    framework: 'nextjs',
    category: definition.category,
    difficulty: definition.difficulty,
    features: definition.features,
    estimatedFileCount: filePaths.length,
    filePaths,
    validateOptions: ({ projectName }) => validateProjectName(projectName),
    async render(options) {
      const validation = validateProjectName(options.projectName);
      if (!validation.valid) throw new Error(validation.message ?? 'Invalid project name.');
      const base = renderNextjsTemplate(options.projectName, options.packageManager).map((entry) =>
        entry.path === 'src/app/page.tsx'
          ? file(entry.path, definition.page(options.projectName))
          : entry.path === 'src/app/globals.css'
            ? file(entry.path, definition.css)
            : entry,
      );
      return {
        templateId: definition.id,
        files: [...base, ...(definition.additionalFiles ?? [])],
      };
    },
  };
});

export function getBuiltinTemplate(id: TemplateId): ForgeKiTemplate {
  const template = BUILTIN_TEMPLATES.find((candidate) => candidate.id === id);
  if (!template) throw new Error(`Unknown built-in template: ${id}`);
  return template;
}

export function isTemplateId(value: unknown): value is TemplateId {
  return typeof value === 'string' && BUILTIN_TEMPLATES.some(({ id }) => id === value);
}

export async function renderBuiltinTemplate(
  id: TemplateId,
  options: TemplateOptions,
): Promise<RenderedTemplate> {
  return getBuiltinTemplate(id).render(options);
}

function baseCss(content: string): string {
  return `* { box-sizing: border-box; }\nhtml, body { margin: 0; min-height: 100%; }\nbody { background: #0b1020; color: #f7f8fc; font-family: Arial, sans-serif; }\n${content}\n`;
}

function file(path: string, content: string): RenderedTemplateFile {
  return { path, content };
}

function escapeJsx(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
