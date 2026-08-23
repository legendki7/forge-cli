import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWorkspaceGenerationPlan, getWorkspacePreset } from '@forgecli7/workspaces';
import { WorkspaceBuilderPage } from './WorkspaceBuilder';
import type { DesktopBridge } from './types';

describe('Workspace Builder', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('renders an empty service graph without Node globals or startup bridge work', () => {
    vi.stubGlobal('Buffer', undefined);
    const bridge = {
      selectDestination: vi.fn(),
      planWorkspace: vi.fn(),
      scanWorkspace: vi.fn(),
      copyText: vi.fn(),
    } as unknown as DesktopBridge;
    render(
      <WorkspaceBuilderPage
        bridge={bridge}
        initialWorkspace={{
          schemaVersion: 1,
          id: 'empty-workspace',
          name: 'empty-workspace',
          packageManager: 'pnpm',
          services: [],
          connections: [],
          tooling: { initializeGit: false, docker: false, githubActions: false },
        }}
        customPresets={[]}
        onWorkspaceChange={() => undefined}
        onPresetsChange={() => undefined}
        onCreated={() => undefined}
        onScanned={() => undefined}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Workspace Builder' })).toBeVisible();
    expect(screen.getByLabelText('Workspace architecture canvas')).toHaveTextContent(
      'Add a service from the catalog.',
    );
    expect(bridge.selectDestination).not.toHaveBeenCalled();
    expect(bridge.planWorkspace).not.toHaveBeenCalled();
    expect(bridge.scanWorkspace).not.toHaveBeenCalled();
  });

  it('edits a visual architecture and reviews the trusted backend plan before creation', async () => {
    expect(getWorkspacePreset('full-stack-starter')).toBeDefined();
    const planWorkspace = vi.fn(async (workspace, destinationDirectory) =>
      createWorkspaceGenerationPlan(workspace, { destinationDirectory }),
    );
    const bridge = {
      selectDestination: vi.fn(async () => 'C:\\workspace-output'),
      planWorkspace,
      createWorkspace: vi.fn(),
      copyText: vi.fn(),
    } as unknown as DesktopBridge;
    const user = userEvent.setup();
    render(
      <WorkspaceBuilderPage
        bridge={bridge}
        customPresets={[]}
        onWorkspaceChange={() => undefined}
        onPresetsChange={() => undefined}
        onCreated={() => undefined}
        onScanned={() => undefined}
      />,
    );

    expect(screen.getByLabelText('Workspace architecture canvas')).toHaveTextContent('react-vite');
    await user.click(screen.getByRole('button', { name: /PostgreSQL/u }));
    expect(screen.getByLabelText('Workspace architecture canvas')).toHaveTextContent('postgres');
    await user.click(screen.getByRole('button', { name: 'Choose destination' }));
    await user.click(screen.getByRole('button', { name: 'Review workspace' }));
    expect(
      await screen.findByRole('dialog', { name: 'Review workspace generation plan' }),
    ).toHaveTextContent('forgeki.workspace.json');
    expect(planWorkspace).toHaveBeenCalledOnce();
  });
});
