import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { defaultPreferences } from './persistence';
import { StackBuilderPage } from './StackBuilder';
import type { DesktopBridge, DesktopCreateResult } from './types';
import type { ProjectGenerationPlan } from '@forgecli7/templates';
import { BUNDLED_COMMUNITY_PLUGINS, type PluginCatalogEntry } from '@forgecli7/plugins';

const stack = {
  framework: 'nextjs' as const,
  components: ['typescript', 'plain-css', 'vitest'] as const,
  packageManager: 'pnpm' as const,
  initializeGit: false,
  addDocker: false,
  addGitHubActions: false,
};
const plan: ProjectGenerationPlan = {
  schemaVersion: 1,
  projectName: 'my-forgeki-app',
  destinationDirectory: 'C:/projects',
  framework: 'nextjs',
  templateId: 'nextjs-blank',
  stack,
  resolvedComponents: ['nextjs', 'typescript', 'plain-css', 'vitest', 'node'],
  automaticallyAdded: ['node'],
  files: [
    { path: 'package.json', content: '{"name":"my-forgeki-app"}\n', owner: 'base' },
    { path: 'vitest.config.ts', content: 'export default {};\n', owner: 'vitest' },
  ],
  dependencies: [],
  devDependencies: [{ name: 'vitest', version: '^3.2.4', sourceComponent: 'vitest' }],
  scripts: { test: 'vitest run' },
  environmentVariables: [],
  plugins: [],
  warnings: [],
};
const result: DesktopCreateResult = {
  projectName: 'my-forgeki-app',
  projectDirectory: 'C:/projects/my-forgeki-app',
  framework: 'nextjs',
  templateId: 'nextjs-blank',
  packageManager: 'pnpm',
  initializedFeatures: [],
  warnings: [],
  generationPlan: plan,
};

function bridge(): DesktopBridge {
  return {
    selectDestination: vi.fn().mockResolvedValue('C:/projects'),
    createProject: vi.fn().mockResolvedValue(result),
    planStack: vi.fn().mockResolvedValue(plan),
    createStack: vi.fn().mockResolvedValue(result),
    scanProject: vi.fn(),
    inspectBuiltinPlugins: vi.fn().mockResolvedValue([]),
    applyBuiltinPlugin: vi.fn(),
    listMarketplacePlugins: vi.fn().mockResolvedValue([]),
    validateCommunityPlugin: vi.fn(),
    installCommunityPlugin: vi.fn(),
    installBundledPlugin: vi.fn(),
    removeCommunityPlugin: vi.fn(),
    createPluginProject: vi.fn(),
    checkDeveloperTools: vi.fn(),
    loadDesktopState: vi.fn(),
    saveDesktopState: vi.fn(),
    openProjectFolder: vi.fn(),
    copyProjectPath: vi.fn(),
  };
}

function setup(overrides: Partial<Parameters<typeof StackBuilderPage>[0]> = {}) {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  const api = bridge();
  const props = {
    bridge: api,
    preferences: { ...defaultPreferences, defaultDestination: 'C:/projects' },
    customPresets: [],
    initialStack: stack,
    onPresetsChange: vi.fn(),
    onStackChange: vi.fn(),
    onCreated: vi.fn(),
    onActivity: vi.fn(),
    communityPlugins: [],
    ...overrides,
  };
  render(<StackBuilderPage {...props} />);
  return { api, props };
}

function editorConfigPlugin(): PluginCatalogEntry {
  const manifest = BUNDLED_COMMUNITY_PLUGINS[0]!;
  return {
    id: manifest.id,
    name: manifest.name,
    description: manifest.description,
    publisher: 'ForgeKi bundled examples',
    version: manifest.version,
    category: manifest.category ?? 'Community',
    supportedFrameworks: manifest.supportedFrameworks,
    permissions: manifest.permissions,
    sourceType: 'bundled-curated',
    builtIn: false,
    trusted: false,
    declarative: true,
    installed: true,
    integrity: 'valid',
    manifest,
  };
}

describe('visual Stack Builder', () => {
  it('shows the catalog, graph, inspector, and built-in presets', () => {
    setup();
    expect(screen.getByRole('heading', { name: 'Stack Builder' })).toBeVisible();
    expect(screen.getByLabelText('Component catalog')).toBeVisible();
    expect(screen.getByLabelText('Visual stack canvas')).toHaveTextContent('Next.js');
    expect(screen.getByLabelText('Configuration inspector')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Next.js Full Stack' })).toBeVisible();
  });

  it('selects components and reports incompatibility instead of ignoring it', async () => {
    setup({ initialStack: { ...stack, framework: 'react-vite' } });
    await userEvent.click(screen.getByRole('button', { name: /^PostgreSQL/u }));
    expect(screen.getByText(/not compatible with React \+ Vite/u)).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: /Tailwind CSS/u }));
    expect(screen.getByLabelText('Visual stack canvas')).toHaveTextContent('Tailwind CSS');
  });

  it('surfaces missing ORM requirements with a readable resolution', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: /^Prisma/u }));
    expect(screen.getByText('Prisma requires a database.')).toBeVisible();
    expect(screen.getByText('Select PostgreSQL or SQLite.')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Add SQLite' }));
    expect(screen.getByLabelText('Visual stack canvas')).toHaveTextContent('SQLite');
  });

  it('loads a preset and records the local event', async () => {
    const { props } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Express API' }));
    expect(screen.getByLabelText('Visual stack canvas')).toHaveTextContent('Express');
    expect(props.onActivity).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'preset-loaded' }),
    );
  });

  it('reviews the backend plan and previews the exact selected file', async () => {
    const { api } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Review generation plan' }));
    expect(await screen.findByRole('heading', { name: 'Generation review' })).toBeVisible();
    expect(api.planStack).toHaveBeenCalledWith(expect.objectContaining({ stack }));
    await userEvent.click(screen.getByRole('button', { name: /vitest\.config\.ts/u }));
    expect(screen.getByLabelText('Generated file preview')).toHaveTextContent('export default');
  });

  it('generates once from the reviewed plan and prevents duplicate submission', async () => {
    const { api, props } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Review generation plan' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Confirm and generate' }));
    await waitFor(() => expect(api.createStack).toHaveBeenCalledTimes(1));
    expect(props.onCreated).toHaveBeenCalledWith(result);
  });

  it('saves local custom presets without environment values', async () => {
    vi.spyOn(window, 'prompt').mockReturnValueOnce('My stack').mockReturnValueOnce('Offline');
    const onPresetsChange = vi.fn();
    setup({ onPresetsChange });
    await userEvent.click(screen.getByRole('button', { name: 'Save preset' }));
    expect(onPresetsChange).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'My stack', schemaVersion: 1 }),
    ]);
  });

  it('renames, duplicates, and deletes local custom presets', async () => {
    const preset = {
      schemaVersion: 1 as const,
      id: 'custom-one',
      name: 'My API',
      description: 'Local only',
      definition: stack,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const onPresetsChange = vi.fn();
    setup({ customPresets: [preset], onPresetsChange });
    vi.spyOn(window, 'prompt').mockReturnValueOnce('Renamed API');
    await userEvent.click(screen.getByRole('button', { name: 'Rename My API' }));
    expect(onPresetsChange).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'custom-one', name: 'Renamed API' }),
    ]);
    await userEvent.click(screen.getByRole('button', { name: 'Duplicate My API' }));
    expect(onPresetsChange).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ name: 'My API copy' }), preset]),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Delete My API' }));
    expect(onPresetsChange).toHaveBeenCalledWith([]);
  });

  it('selects installed plugin components and sends them to the trusted planner', async () => {
    const { api, props } = setup({ communityPlugins: [editorConfigPlugin()] });
    await userEvent.click(screen.getByRole('button', { name: /EditorConfig Plugin/u }));
    expect(props.onStackChange).toHaveBeenCalledWith(
      expect.objectContaining({ pluginComponents: ['editorconfig'] }),
    );
    expect(screen.getByLabelText('Visual stack canvas')).toHaveTextContent('EditorConfig');
    await userEvent.click(screen.getByRole('button', { name: 'Review generation plan' }));
    expect(api.planStack).toHaveBeenCalledWith(
      expect.objectContaining({
        stack: expect.objectContaining({ pluginComponents: ['editorconfig'] }),
      }),
    );
  });

  it('blocks generation when a saved plugin component is no longer installed', () => {
    setup({ initialStack: { ...stack, pluginComponents: ['removed-component'] } });
    expect(screen.getByText(/removed-component is unavailable or disabled/u)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Review generation plan' })).toBeDisabled();
  });
});
