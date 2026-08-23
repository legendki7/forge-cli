import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PageErrorBoundary } from './PageErrorBoundary';

function BrokenPage(): never {
  throw new Error('technical details must stay contained');
}

describe('page error boundary', () => {
  it('contains a page render failure and offers a safe route home', async () => {
    const onLeave = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      render(
        <PageErrorBoundary pageName="Workspace Builder" onLeave={onLeave}>
          <BrokenPage />
        </PageErrorBoundary>,
      );
      expect(screen.getByRole('alert')).toHaveTextContent('Workspace Builder could not open');
      expect(screen.queryByText('technical details')).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Return home' }));
      expect(onLeave).toHaveBeenCalledOnce();
    } finally {
      consoleError.mockRestore();
    }
  });
});
