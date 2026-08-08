import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BUNDLED_COMMUNITY_PLUGINS, type PluginCatalogEntry } from '@forgecli7/plugins';
import { MarketplacePage } from './Marketplace';
import { defaultPreferences } from './persistence';
import type { DesktopBridge } from './types';

const manifest = BUNDLED_COMMUNITY_PLUGINS[0]!;
const bundled: PluginCatalogEntry = {
  id: manifest.id,
  name: manifest.name,
  description: manifest.description,
  publisher: 'ForgeKi bundled examples',
  version: manifest.version,
  category: manifest.category!,
  supportedFrameworks: manifest.supportedFrameworks,
  permissions: manifest.permissions,
  sourceType: 'bundled-curated',
  builtIn: false,
  trusted: false,
  declarative: true,
  installed: false,
  integrity: 'not-installed',
  manifest,
};

function bridge(overrides: Partial<DesktopBridge> = {}): DesktopBridge {
  return {
    selectDestination: vi.fn().mockResolvedValue('C:/plugins/example'),
    createProject: vi.fn(),
    planStack: vi.fn(),
    createStack: vi.fn(),
    scanProject: vi.fn(),
    inspectBuiltinPlugins: vi.fn().mockResolvedValue([]),
    applyBuiltinPlugin: vi.fn(),
    listMarketplacePlugins: vi.fn().mockResolvedValue([bundled]),
    validateCommunityPlugin: vi.fn().mockResolvedValue({
      manifest,
      report: {
        result: 'safe',
        manifestValid: true,
        forgekiCompatible: true,
        permissions: manifest.permissions,
        generatedFiles: 1,
        dependencies: 0,
        scripts: 0,
        environmentVariables: 0,
        scannerRules: 1,
        unsupportedCapabilities: [],
        suspiciousPaths: [],
        errors: [],
        warnings: [],
      },
      files: [],
      bytes: 100,
    }),
    installCommunityPlugin: vi
      .fn()
      .mockResolvedValue({ ...bundled, installed: true, integrity: 'valid' }),
    installBundledPlugin: vi
      .fn()
      .mockResolvedValue({ ...bundled, installed: true, integrity: 'valid' }),
    removeCommunityPlugin: vi.fn().mockResolvedValue(undefined),
    createPluginProject: vi.fn().mockResolvedValue({ directory: 'C:/plugins/my-plugin' }),
    checkDeveloperTools: vi.fn(),
    loadDesktopState: vi.fn(),
    saveDesktopState: vi.fn(),
    openProjectFolder: vi.fn(),
    copyProjectPath: vi.fn(),
    ...overrides,
  };
}

function setup(api = bridge()) {
  const onActivity = vi.fn();
  render(
    <MarketplacePage
      bridge={api}
      preferences={defaultPreferences}
      onProjectPath={vi.fn()}
      onScan={vi.fn()}
      onActivity={onActivity}
      onCatalogChange={vi.fn()}
    />,
  );
  return { api, onActivity };
}

describe('restricted plugin Marketplace', () => {
  it('shows tabs, offline banner, search, details, permissions, and safety restrictions', async () => {
    setup();
    expect(screen.getByText(/Remote marketplace downloads are not enabled yet/u)).toBeVisible();
    await userEvent.click(screen.getByRole('tab', { name: 'Community' }));
    await screen.findByRole('heading', { name: 'EditorConfig' });
    await userEvent.type(screen.getByLabelText('Search plugins'), 'editor');
    await userEvent.click(screen.getByRole('button', { name: 'View details' }));
    expect(screen.getByLabelText('Plugin details')).toHaveTextContent('project:generate-files');
    expect(screen.getByLabelText('Plugin details')).toHaveTextContent('Run shell commands');
    expect(screen.getByLabelText('Plugin details')).toHaveTextContent('Safe to install');
  });

  it('installs and removes bundled declarative metadata only after confirmation', async () => {
    const installed = { ...bundled, installed: true, integrity: 'valid' as const };
    const api = bridge({
      listMarketplacePlugins: vi
        .fn()
        .mockResolvedValueOnce([bundled])
        .mockResolvedValue([installed]),
      installBundledPlugin: vi.fn().mockResolvedValue(installed),
    });
    const { onActivity } = setup(api);
    await userEvent.click(screen.getByRole('tab', { name: 'Community' }));
    await screen.findByRole('button', { name: 'Install locally' });
    await userEvent.click(screen.getByRole('button', { name: 'Install locally' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('No plugin code');
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(api.installBundledPlugin).toHaveBeenCalledWith(manifest.id));
    expect(onActivity).toHaveBeenCalledWith(expect.objectContaining({ type: 'plugin-installed' }));
  });

  it('creates a local developer starter without publishing', async () => {
    const api = bridge();
    setup(api);
    await userEvent.click(screen.getByRole('tab', { name: 'Developer' }));
    await userEvent.clear(screen.getByLabelText('Plugin name'));
    await userEvent.type(screen.getByLabelText('Plugin name'), 'safe-plugin');
    await userEvent.click(screen.getByRole('button', { name: 'Create plugin project' }));
    await waitFor(() =>
      expect(api.createPluginProject).toHaveBeenCalledWith('C:/plugins/example', 'safe-plugin'),
    );
    expect(await screen.findByText(/Created C:\/plugins\/my-plugin/u)).toBeVisible();
  });

  it('surfaces corrupted installed plugins as disabled', async () => {
    setup(
      bridge({
        listMarketplacePlugins: vi.fn().mockResolvedValue([
          {
            ...bundled,
            installed: true,
            integrity: 'corrupted',
            warning: 'Plugin disabled because its installed files changed unexpectedly.',
          },
        ]),
      }),
    );
    expect(await screen.findByText('disabled')).toBeVisible();
    expect(screen.getByText(/changed unexpectedly/u)).toBeVisible();
  });
});
