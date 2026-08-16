import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { AboutPage } from './AboutPage';
import { createDefaultDesktopState } from './persistence';

describe('About ForgeKi', () => {
  it('shows Beta trust boundaries and previews diagnostics before saving', async () => {
    const bridge = {
      checkDeveloperTools: async () => ({ tools: [], summary: [], checkedAt: 'now' }),
    } as never;
    render(<AboutPage bridge={bridge} state={createDefaultDesktopState()} plugins={[]} />);
    expect(screen.getByText(/currently in Beta/u)).toBeInTheDocument();
    expect(screen.getAllByText(/provider unconfigured/u)).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Save JSON' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Preview diagnostics' }));
    const preview = await screen.findByLabelText('Diagnostics preview');
    expect(preview.textContent).toContain('"schemaVersion": 1');
    expect(screen.getByRole('button', { name: 'Save JSON' })).toBeEnabled();
  });
});
