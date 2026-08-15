import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { defaultPreferences } from './persistence';
import { SecurityPage } from './SecurityPage';
import type { DesktopBridge } from './types';

function bridge(): DesktopBridge {
  return {
    listMarketplacePlugins: vi.fn().mockResolvedValue([]),
    marketplaceStatus: vi.fn().mockResolvedValue({
      configured: false,
      connectivity: 'unconfigured',
      freshness: 'unavailable',
      rootTrust: 'unavailable',
      revocations: 'unavailable',
      message: 'Production Marketplace is not configured.',
    }),
    checkApplicationUpdate: vi.fn().mockResolvedValue({
      configured: false,
      channel: 'beta',
      currentVersion: '0.1.0',
      state: 'unconfigured',
      signatureStatus: 'unavailable',
      message: 'Update service not configured.',
    }),
  } as unknown as DesktopBridge;
}

describe('Security Center', () => {
  it('shows Marketplace root, revocation, plugin, update, signing, and privacy status', async () => {
    render(
      <SecurityPage bridge={bridge()} preferences={defaultPreferences} onActivity={vi.fn()} />,
    );
    expect(screen.getByRole('heading', { name: 'Security' })).toBeVisible();
    expect(screen.getByText(/cannot execute arbitrary code/u)).toBeVisible();
    await waitFor(() => expect(screen.getByText('unconfigured')).toBeVisible());
    expect(screen.getByText(/Windows installers are unsigned/u)).toBeVisible();
    expect(screen.getByText(/no project names, paths, source code/u)).toBeVisible();
  });
  it('checks the selected channel without installing silently', async () => {
    const api = bridge();
    const onActivity = vi.fn();
    render(<SecurityPage bridge={api} preferences={defaultPreferences} onActivity={onActivity} />);
    await userEvent.click(screen.getByRole('button', { name: 'Check for updates' }));
    await waitFor(() => expect(api.checkApplicationUpdate).toHaveBeenCalledWith('beta'));
    expect(screen.getByText('Update service not configured.')).toBeVisible();
    expect(onActivity).toHaveBeenCalledWith(expect.objectContaining({ type: 'update-checked' }));
  });
});
