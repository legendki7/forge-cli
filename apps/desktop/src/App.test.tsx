import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { createDefaultDesktopState } from './persistence';
import type { DesktopBridge, DesktopCreateResult, DesktopProjectScan } from './types';

const result: DesktopCreateResult = {
  projectName: 'my-app',
  projectDirectory: 'C:\\projects\\my-app',
  framework: 'nextjs',
  templateId: 'nextjs-dashboard',
  packageManager: 'pnpm',
  initializedFeatures: ['Docker', 'GitHub Actions'],
  warnings: [],
};

const scan: DesktopProjectScan = {
  directory: 'C:\\projects\\my-app',
  projectName: 'my-app',
  framework: 'nextjs',
  packageManager: 'pnpm',
  language: 'typescript',
  scripts: { test: 'vitest' },
  dependencies: {},
  devDependencies: {},
  detectedFiles: ['package.json', 'tsconfig.json'],
  warnings: [],
  plugins: [],
  recommendations: [],
};

function bridge(overrides: Partial<DesktopBridge> = {}): DesktopBridge {
  return {
    selectDestination: vi.fn().mockResolvedValue('C:\\projects'),
    createProject: vi.fn().mockResolvedValue(result),
    planStack: vi.fn(),
    createStack: vi.fn().mockResolvedValue(result),
    planWorkspace: vi.fn(),
    scanWorkspace: vi.fn(),
    scanProject: vi.fn().mockResolvedValue(scan),
    inspectBuiltinPlugins: vi.fn().mockResolvedValue([]),
    applyBuiltinPlugin: vi.fn(),
    listMarketplacePlugins: vi.fn().mockResolvedValue([]),
    validateCommunityPlugin: vi.fn(),
    installCommunityPlugin: vi.fn(),
    installBundledPlugin: vi.fn(),
    removeCommunityPlugin: vi.fn(),
    createPluginProject: vi.fn(),
    checkDeveloperTools: vi.fn().mockResolvedValue({ tools: [], summary: [], checkedAt: '' }),
    loadDesktopState: vi.fn().mockResolvedValue(null),
    saveDesktopState: vi.fn().mockResolvedValue(undefined),
    openProjectFolder: vi.fn().mockResolvedValue(undefined),
    copyProjectPath: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('desktop application shell', () => {
  it('opens Home by default with real empty states and quick actions', () => {
    const { container } = render(<App bridge={bridge()} />);
    expect(screen.getByRole('heading', { name: 'ForgeKi' })).toBeVisible();
    expect(container.querySelector('.sidebar-brand img')).toHaveAttribute(
      'src',
      expect.stringContaining('forgeki-mark.png'),
    );
    expect(container.querySelector('.home-identity img')).toBeVisible();
    expect(screen.getByText('No recent projects')).toBeVisible();
    expect(screen.getByText('No activity yet')).toBeVisible();
    expect(screen.getByRole('button', { name: /^Create a project/u })).toBeVisible();
  });

  it.each([
    ['Create Project', 'Create a project'],
    ['Templates', 'Templates'],
    ['Scan Project', 'Scan Project'],
    ['Marketplace', 'Marketplace'],
    ['Security', 'Security'],
    ['Developer Tools', 'Developer Tools'],
    ['Activity', 'Activity'],
    ['Settings', 'Settings'],
  ])('opens %s from the sidebar', async (destination, heading) => {
    render(<App bridge={bridge()} />);
    await userEvent.click(screen.getByRole('button', { name: destination }));
    expect(screen.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
  });

  it('collapses persistently and preserves accessible navigation labels', async () => {
    const api = bridge();
    const { container } = render(<App bridge={api} />);
    await userEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    expect(container.querySelector('.sidebar')).toHaveAttribute('data-collapsed', 'true');
    expect(screen.getByRole('button', { name: 'Settings' })).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeVisible();
  });

  it('supports keyboard navigation to a selected page', async () => {
    render(<App bridge={bridge()} />);
    const templates = screen.getByRole('button', { name: 'Templates' });
    templates.focus();
    await userEvent.keyboard('{Enter}');
    expect(templates).toHaveAttribute('aria-current', 'page');
  });

  it('lazy-loads Stack Builder from persistent navigation', async () => {
    render(<App bridge={bridge()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Stack Builder' }));
    expect(
      await screen.findByRole('heading', { name: 'Stack Builder' }, { timeout: 10_000 }),
    ).toBeVisible();
  });

  it('opens Workspace Builder repeatedly without startup bridge work', async () => {
    const api = bridge();
    render(<App bridge={api} />);

    await userEvent.click(screen.getByRole('button', { name: 'Workspace Builder' }));
    expect(
      await screen.findByRole('heading', { name: 'Workspace Builder' }, { timeout: 10_000 }),
    ).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Home' }));
    await userEvent.click(screen.getByRole('button', { name: 'Workspace Builder' }));
    expect(await screen.findByRole('heading', { name: 'Workspace Builder' })).toBeVisible();
    expect(api.selectDestination).not.toHaveBeenCalled();
    expect(api.planWorkspace).not.toHaveBeenCalled();
    expect(api.scanWorkspace).not.toHaveBeenCalled();
  });
});

describe('creation wizard', () => {
  it('validates steps, applies defaults, reviews accurately, and creates only after confirmation', async () => {
    const api = bridge();
    render(<App bridge={api} />);
    await userEvent.click(screen.getByRole('button', { name: 'Create Project' }));
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Project name'), 'my-app');
    await userEvent.click(screen.getByRole('button', { name: 'Choose folder' }));
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await userEvent.click(screen.getByRole('button', { name: /Next\.js Dashboard/u }));
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByLabelText('pnpm')).toBeChecked();
    expect(screen.getByLabelText('Initialize Git repository')).toBeChecked();
    await userEvent.click(screen.getByLabelText('Initialize Git repository'));
    await userEvent.click(screen.getByLabelText('Add Docker configuration'));
    await userEvent.click(screen.getByLabelText('Add GitHub Actions CI'));
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('heading', { name: 'Review project configuration' })).toBeVisible();
    expect(screen.getByText('Next.js Dashboard')).toBeVisible();
    expect(
      screen.getByText('Selected parent · exclusive file creation · no dependency install'),
    ).toBeVisible();
    expect(api.createProject).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Confirm and create' }));
    expect(await screen.findByRole('heading', { name: 'my-app was created' })).toBeVisible();
    expect(api.createProject).toHaveBeenCalledWith(
      expect.objectContaining({
        templateId: 'nextjs-dashboard',
        initializeGit: false,
        addDocker: true,
        addGitHubActions: true,
      }),
      expect.any(Function),
    );
  });

  it('opens the wizard with a template selected from the catalog', async () => {
    render(<App bridge={bridge()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Templates' }));
    await userEvent.click(screen.getByRole('button', { name: /Next\.js Blog/u }));
    const details = screen.getByText('Included features').closest<HTMLElement>('.details-panel')!;
    await userEvent.click(within(details).getByRole('button', { name: 'Create Project' }));
    await userEvent.type(screen.getByLabelText('Project name'), 'blog-app');
    await userEvent.click(screen.getByRole('button', { name: 'Choose folder' }));
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('button', { name: /Next\.js Blog/u })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('shows sanitized failures and supports create-another reset', async () => {
    const api = bridge({
      createProject: vi
        .fn()
        .mockRejectedValue(new Error(`permission denied npm_${'a'.repeat(30)}`)),
    });
    render(<App bridge={api} />);
    await userEvent.click(screen.getByRole('button', { name: 'Create Project' }));
    await userEvent.type(screen.getByLabelText('Project name'), 'my-app');
    await userEvent.click(screen.getByRole('button', { name: 'Choose folder' }));
    for (let index = 0; index < 3; index += 1)
      await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirm and create' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('permission');
    expect(screen.queryByText(/npm_aaaa/u)).not.toBeInTheDocument();
  });

  it('distinguishes an invalid native request from a worker communication failure', async () => {
    const api = bridge({
      createProject: vi
        .fn()
        .mockRejectedValue(new Error('INVALID_PAYLOAD: The desktop bridge request was invalid.')),
    });
    render(<App bridge={api} />);
    await userEvent.click(screen.getByRole('button', { name: 'Create Project' }));
    await userEvent.type(screen.getByLabelText('Project name'), 'my-app');
    await userEvent.click(screen.getByRole('button', { name: 'Choose folder' }));
    for (let index = 0; index < 3; index += 1)
      await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirm and create' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'ForgeKi could not process the project request.',
    );
    expect(screen.getByText('Sanitized technical details')).toBeVisible();
  });
});

describe('stored desktop state', () => {
  it('loads preferences and applies the selected theme', async () => {
    const stored = createDefaultDesktopState();
    stored.preferences.theme = 'dark';
    stored.preferences.mode = 'advanced';
    render(<App bridge={bridge({ loadDesktopState: vi.fn().mockResolvedValue(stored) })} />);
    await waitFor(() => expect(document.documentElement).toHaveAttribute('data-theme', 'dark'));
  });

  it('switches between the branded light and dark theme preferences', async () => {
    const stored = createDefaultDesktopState();
    const api = bridge({ loadDesktopState: vi.fn().mockResolvedValue(stored) });
    render(<App bridge={api} />);
    await userEvent.click(screen.getByRole('button', { name: 'Settings' }));
    await userEvent.selectOptions(screen.getByLabelText('Theme'), 'dark');
    await waitFor(() => expect(document.documentElement).toHaveAttribute('data-theme', 'dark'));
    await userEvent.selectOptions(screen.getByLabelText('Theme'), 'light');
    await waitFor(() => expect(document.documentElement).toHaveAttribute('data-theme', 'light'));
  });

  it('switches language immediately, applies direction, persists it, and can switch back', async () => {
    const api = bridge();
    render(<App bridge={api} />);
    await userEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const selector = screen.getByLabelText('Display language');
    expect(selector).toHaveValue('en');
    expect(within(selector).getByRole('option', { name: 'English' })).toBeVisible();
    expect(within(selector).getByRole('option', { name: 'العربية' })).toBeVisible();

    await userEvent.selectOptions(selector, 'ar');
    await waitFor(() => {
      expect(document.documentElement).toHaveAttribute('lang', 'ar');
      expect(document.documentElement).toHaveAttribute('dir', 'rtl');
      expect(screen.getByRole('button', { name: 'الرئيسية' })).toBeVisible();
    });
    expect(screen.getByRole('heading', { name: 'الإعدادات' })).toBeVisible();
    await waitFor(() =>
      expect(api.saveDesktopState).toHaveBeenCalledWith(
        expect.objectContaining({ preferences: expect.objectContaining({ language: 'ar' }) }),
      ),
    );

    await userEvent.selectOptions(screen.getByLabelText('لغة العرض'), 'en');
    await waitFor(() => {
      expect(document.documentElement).toHaveAttribute('lang', 'en');
      expect(document.documentElement).toHaveAttribute('dir', 'ltr');
      expect(screen.getByRole('button', { name: 'Home' })).toBeVisible();
    });
  });

  it('reopens Workspace Builder repeatedly in Arabic without bridge startup work or state loss', async () => {
    const stored = createDefaultDesktopState();
    stored.preferences.language = 'ar';
    stored.preferences.theme = 'dark';
    const api = bridge({ loadDesktopState: vi.fn().mockResolvedValue(stored) });
    render(<App bridge={api} />);
    const builder = await screen.findByRole('button', { name: 'منشئ مساحة العمل' });
    await userEvent.click(builder);
    expect(await screen.findByRole('heading', { name: 'منشئ مساحة العمل' })).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'الرئيسية' }));
    await userEvent.click(screen.getByRole('button', { name: 'منشئ مساحة العمل' }));
    expect(await screen.findByLabelText('لوحة معمارية مساحة العمل')).toBeVisible();
    expect(api.selectDestination).not.toHaveBeenCalled();
    expect(api.planWorkspace).not.toHaveBeenCalled();
    expect(api.scanWorkspace).not.toHaveBeenCalled();
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
  });
});
