import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BUILTIN_TEMPLATES } from '@forgecli7/templates/catalog';
import {
  ActivityPage,
  DeveloperToolsPage,
  ScanProjectPage,
  SettingsPage,
  TemplatesPage,
} from './pages';
import { defaultPreferences } from './persistence';
import type { DesktopBridge, DesktopProjectScan } from './types';

const plugins = [
  {
    id: 'docker',
    name: 'Docker',
    description: 'Docker files',
    version: '0.1.0',
    builtIn: true,
    supportedFrameworks: ['nextjs'],
    files: ['Dockerfile', '.dockerignore'],
    status: 'available',
    message: 'Missing',
    detectedFiles: [],
  },
  {
    id: 'github-actions',
    name: 'GitHub Actions',
    description: 'CI',
    version: '0.1.0',
    builtIn: true,
    supportedFrameworks: ['nextjs'],
    files: ['.github/workflows/ci.yml'],
    status: 'installed',
    message: 'Installed',
    detectedFiles: ['.github/workflows/ci.yml'],
  },
] as const;

const scan: DesktopProjectScan = {
  directory: 'C:\\projects\\app',
  projectName: 'app',
  framework: 'nextjs',
  packageManager: 'pnpm',
  language: 'typescript',
  scripts: { test: 'vitest' },
  dependencies: { next: '15' },
  devDependencies: { typescript: '5' },
  detectedFiles: ['package.json', 'tsconfig.json'],
  warnings: [],
  plugins: [...plugins],
  recommendations: [
    {
      id: 'docker-missing',
      severity: 'info',
      message: 'Docker configuration is missing.',
      pluginId: 'docker',
    },
  ],
};

function bridge(): DesktopBridge {
  return {
    selectDestination: vi.fn().mockResolvedValue(scan.directory),
    createProject: vi.fn(),
    planStack: vi.fn(),
    createStack: vi.fn(),
    scanProject: vi.fn().mockResolvedValue(scan),
    inspectBuiltinPlugins: vi.fn().mockResolvedValue(plugins),
    applyBuiltinPlugin: vi.fn().mockResolvedValue({
      status: 'applied',
      message: 'Docker added',
      createdFiles: ['Dockerfile'],
      skippedFiles: [],
      scan: { ...scan, recommendations: [] },
    }),
    checkDeveloperTools: vi.fn().mockResolvedValue({
      checkedAt: '2026-01-01',
      summary: ['Ready to create Next.js projects.'],
      tools: [
        {
          id: 'node',
          name: 'Node.js',
          status: 'installed',
          version: 'v24',
          required: true,
          purpose: 'Runs tooling.',
        },
      ],
    }),
    loadDesktopState: vi.fn(),
    saveDesktopState: vi.fn(),
    openProjectFolder: vi.fn(),
    copyProjectPath: vi.fn(),
  };
}

describe('template browsing', () => {
  it('searches, filters, selects, and starts creation locally', async () => {
    const onCreate = vi.fn();
    render(<TemplatesPage templates={BUILTIN_TEMPLATES} onCreate={onCreate} />);
    expect(screen.getAllByText(/Next\.js/u).length).toBeGreaterThanOrEqual(5);
    await userEvent.type(screen.getByLabelText('Search templates'), 'dashboard');
    expect(screen.getByRole('button', { name: /Next\.js Dashboard/u })).toBeVisible();
    expect(screen.queryByRole('button', { name: /Next\.js Blog/u })).not.toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText('Search templates'));
    await userEvent.selectOptions(screen.getByLabelText('Template category'), 'marketing');
    await userEvent.click(screen.getByRole('button', { name: /Next\.js Landing Page/u }));
    await userEvent.click(screen.getByRole('button', { name: 'Create Project' }));
    expect(onCreate).toHaveBeenCalledWith('nextjs-landing');
  });
});

describe('project scanning and safe plugin application', () => {
  it('scans through a selected folder and confirms declared files before applying', async () => {
    const api = bridge();
    render(<ScanProjectPage bridge={api} onScanned={vi.fn()} onActivity={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Select project' }));
    await userEvent.click(screen.getByRole('button', { name: 'Scan project' }));
    expect(await screen.findByRole('heading', { name: 'app' })).toBeVisible();
    expect(screen.getByText('Docker configuration is missing.')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Add Docker' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Dockerfile, .dockerignore');
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(api.applyBuiltinPlugin).toHaveBeenCalledWith({
      projectDirectory: scan.directory,
      pluginId: 'docker',
    });
  });
});

describe('developer tools, activity, and settings', () => {
  it('does not check tools until requested and renders accurate status', async () => {
    const api = bridge();
    render(<DeveloperToolsPage bridge={api} />);
    expect(api.checkDeveloperTools).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Check tools' }));
    expect(await screen.findByText('v24')).toBeVisible();
    expect(screen.getByText('installed')).toBeVisible();
  });

  it('filters activity and clears only after confirmation', async () => {
    const onClear = vi.fn();
    render(
      <ActivityPage
        entries={[
          {
            id: '1',
            type: 'project-created',
            timestamp: '2026-01-01',
            result: 'success',
            message: 'Created',
          },
          {
            id: '2',
            type: 'creation-failed',
            timestamp: '2026-01-02',
            result: 'failed',
            message: 'Failed safely',
          },
        ]}
        onClear={onClear}
        onOpen={vi.fn()}
      />,
    );
    await userEvent.selectOptions(screen.getByLabelText('Activity result'), 'failed');
    expect(screen.getByText('Failed safely')).toBeVisible();
    expect(screen.queryByText('Created')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clear history' }));
    expect(onClear).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(onClear).toHaveBeenCalled();
  });

  it('exposes themes, defaults, modes, version, and privacy promises', async () => {
    const onChange = vi.fn();
    render(
      <SettingsPage
        preferences={defaultPreferences}
        onChange={onChange}
        onReset={vi.fn()}
        onClearRecent={vi.fn()}
        onClearActivity={vi.fn()}
        chooseDirectory={vi.fn().mockResolvedValue('C:\\projects')}
      />,
    );
    await userEvent.selectOptions(screen.getByLabelText('Theme'), 'dark');
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ theme: 'dark' }));
    expect(screen.getByText('com.legendki7.forgeki')).toBeVisible();
    expect(screen.getByText('ForgeKi does not use analytics or telemetry.')).toBeVisible();
    expect(screen.getByLabelText('User mode')).toHaveValue('beginner');
  });
});
