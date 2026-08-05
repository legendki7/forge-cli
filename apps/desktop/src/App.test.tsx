import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App';
import type { DesktopBridge, DesktopCreateResult } from './types';

const result: DesktopCreateResult = {
  projectName: 'my-app',
  projectDirectory: 'C:\\projects\\my-app',
  framework: 'nextjs',
  packageManager: 'pnpm',
  initializedFeatures: ['Git'],
  warnings: [],
};

function bridge(overrides: Partial<DesktopBridge> = {}): DesktopBridge {
  return {
    selectDestination: vi.fn().mockResolvedValue('C:\\projects'),
    createProject: vi.fn().mockResolvedValue(result),
    openProjectFolder: vi.fn().mockResolvedValue(undefined),
    copyProjectPath: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

async function completeRequiredFields() {
  await userEvent.type(screen.getByLabelText('Project name'), 'my-app');
  await userEvent.click(screen.getByRole('button', { name: 'Choose folder' }));
  await screen.findByText('C:\\projects');
}

describe('ForgeKi Desktop form', () => {
  it('requires a project name and destination', () => {
    render(<App bridge={bridge()} />);
    expect(screen.getByRole('button', { name: 'Create project' })).toBeDisabled();
    expect(screen.getByText('Select a project location.')).toBeVisible();
  });

  it('uses the shared validator for invalid names', async () => {
    render(<App bridge={bridge()} />);
    await userEvent.type(screen.getByLabelText('Project name'), 'Invalid Name');
    expect(screen.getByLabelText('Project name')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('button', { name: 'Create project' })).toBeDisabled();
  });

  it('enables creation for a valid name and selected destination', async () => {
    render(<App bridge={bridge()} />);
    await completeRequiredFields();
    expect(screen.getByRole('button', { name: 'Create project' })).toBeEnabled();
  });

  it('uses safe defaults', () => {
    render(<App bridge={bridge()} />);
    expect(screen.getByLabelText('pnpm')).toBeChecked();
    expect(screen.getByLabelText('Initialize Git repository')).toBeChecked();
    expect(screen.getByLabelText('Add Docker configuration')).not.toBeChecked();
    expect(screen.getByLabelText('Add GitHub Actions CI')).not.toBeChecked();
  });

  it.each(['pnpm', 'npm', 'Yarn', 'Bun'])('selects the %s package manager', async (manager) => {
    render(<App bridge={bridge()} />);
    await userEvent.click(screen.getByLabelText(manager));
    expect(screen.getByLabelText(manager)).toBeChecked();
  });

  it('supports disabling Git and enabling both plugins', async () => {
    render(<App bridge={bridge()} />);
    await userEvent.click(screen.getByLabelText('Initialize Git repository'));
    await userEvent.click(screen.getByLabelText('Add Docker configuration'));
    await userEvent.click(screen.getByLabelText('Add GitHub Actions CI'));
    expect(screen.getByLabelText('Initialize Git repository')).not.toBeChecked();
    expect(screen.getByLabelText('Add Docker configuration')).toBeChecked();
    expect(screen.getByLabelText('Add GitHub Actions CI')).toBeChecked();
  });
});

describe('ForgeKi Desktop confirmation and creation', () => {
  it('shows the complete summary and creates nothing before confirmation', async () => {
    const api = bridge();
    render(<App bridge={api} />);
    await completeRequiredFields();
    await userEvent.click(screen.getByLabelText('Add GitHub Actions CI'));
    await userEvent.click(screen.getByRole('button', { name: 'Create project' }));
    expect(screen.getByRole('heading', { name: 'Review project configuration' })).toBeVisible();
    expect(screen.getByText('my-app')).toBeVisible();
    expect(screen.getAllByText('Next.js')).toHaveLength(2);
    expect(screen.getAllByText('C:\\projects')).toHaveLength(2);
    expect(screen.getAllByText('Enabled')).toHaveLength(2);
    expect(api.createProject).not.toHaveBeenCalled();
  });

  it('cancels confirmation without creating files', async () => {
    const api = bridge();
    render(<App bridge={api} />);
    await completeRequiredFields();
    await userEvent.click(screen.getByRole('button', { name: 'Create project' }));
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(api.createProject).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Create project' })).toBeVisible();
  });

  it('submits once, disables controls, and represents skipped steps', async () => {
    let resolve!: (value: DesktopCreateResult) => void;
    const pending = new Promise<DesktopCreateResult>((done) => (resolve = done));
    const api = bridge({ createProject: vi.fn().mockReturnValue(pending) });
    render(<App bridge={api} />);
    await completeRequiredFields();
    await userEvent.click(screen.getByRole('button', { name: 'Create project' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirm and create' }));
    expect(screen.getByRole('heading', { name: 'Building my-app' })).toBeVisible();
    expect(screen.getAllByText('skipped')).toHaveLength(2);
    expect(api.createProject).toHaveBeenCalledTimes(1);
    resolve(result);
    await screen.findByRole('heading', { name: 'my-app was created' });
  });

  it('renders progress warnings without false success', async () => {
    const api = bridge({
      createProject: vi.fn(async (_request, progress) => {
        progress({ operationId: '1', step: 'git', state: 'warning', message: 'Git unavailable' });
        return { ...result, initializedFeatures: [], warnings: ['Git was not initialized.'] };
      }),
    });
    render(<App bridge={api} />);
    await completeRequiredFields();
    await userEvent.click(screen.getByRole('button', { name: 'Create project' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirm and create' }));
    expect(await screen.findByText('Created with warnings')).toBeVisible();
    expect(screen.getByText('Git was not initialized.')).toBeVisible();
  });

  it('shows sanitized expected errors without a raw stack trace', async () => {
    const fakeToken = ['npm', '_abcdefghijklmnopqrstuvwxyz'].join('');
    const api = bridge({
      createProject: vi
        .fn()
        .mockRejectedValue(new Error(`permission denied C:\\Users\\private\\token ${fakeToken}`)),
    });
    render(<App bridge={api} />);
    await completeRequiredFields();
    await userEvent.click(screen.getByRole('button', { name: 'Create project' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirm and create' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('does not have permission');
    fireEvent.click(screen.getByText('Technical details'));
    expect(screen.getByText(/%USERPROFILE%/u)).toBeVisible();
    expect(screen.queryByText(new RegExp(fakeToken, 'u'))).not.toBeInTheDocument();
    expect(screen.queryByText(/at App/u)).not.toBeInTheDocument();
  });

  it('supports open, copy, and reset actions after success', async () => {
    const api = bridge();
    render(<App bridge={api} />);
    await completeRequiredFields();
    await userEvent.click(screen.getByRole('button', { name: 'Create project' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirm and create' }));
    await screen.findByRole('heading', { name: 'my-app was created' });
    await userEvent.click(screen.getByRole('button', { name: 'Open project folder' }));
    await userEvent.click(screen.getByRole('button', { name: 'Copy project path' }));
    expect(api.openProjectFolder).toHaveBeenCalledWith(result.projectDirectory);
    expect(api.copyProjectPath).toHaveBeenCalledWith(result.projectDirectory);
    await userEvent.click(screen.getByRole('button', { name: 'Create another project' }));
    expect(screen.getByLabelText('Project name')).toHaveValue('');
    expect(screen.getByLabelText('Initialize Git repository')).toBeChecked();
  });
});
