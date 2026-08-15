import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  createDeploymentPlan,
  deploymentProjectFromWorkspace,
  type DeploymentScanResult,
} from '@forgecli7/deployments';
import { getWorkspacePreset } from '@forgecli7/workspaces';
import { defaultPreferences } from './persistence';
import { DeploymentPage, EnvironmentsPage } from './DeploymentPages';
import type { DesktopBridge } from './types';

function scan(): DeploymentScanResult {
  return {
    directory: 'C:\\projects\\platform',
    project: deploymentProjectFromWorkspace(getWorkspacePreset('saas-foundation')!.definition),
    evidence: [],
    drift: [{ path: 'k8s/web-deployment.yaml', state: 'modified' }],
    warnings: [],
  };
}

describe('deployment Desktop pages', () => {
  it('shows Local, Staging, Production schemas, ownership, boundaries, comparison, and drift', async () => {
    const bridge = { scanDeployment: vi.fn(async () => scan()) } as unknown as DesktopBridge;
    const user = userEvent.setup();
    render(
      <EnvironmentsPage
        bridge={bridge}
        initialPath="C:\\projects\\platform"
        preferences={defaultPreferences}
        onPath={() => undefined}
        onActivity={() => undefined}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Review environment profiles' }));
    expect(await screen.findByRole('tab', { name: 'Production' })).toBeInTheDocument();
    expect(screen.getByText('Environment matrix')).toBeInTheDocument();
    expect(screen.getAllByText('Secret').length).toBeGreaterThan(0);
    expect(screen.getByText('Compare environments')).toBeInTheDocument();
    expect(screen.getByText(/Modified since generation/u)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('forgeki-dev-only');
  });

  it('filters targets, previews the trusted plan, and requires export confirmation', async () => {
    const current = scan();
    const plan = createDeploymentPlan(current.project, 'production', 'kubernetes');
    const bridge = {
      scanDeployment: vi.fn(async () => current),
      planDeployment: vi.fn(async () => plan),
      selectDestination: vi.fn(async () => 'C:\\deployment-bundle'),
      exportDeployment: vi.fn(async () => ({
        destination: 'C:\\deployment-bundle',
        createdFiles: plan.files.map(({ path }) => path),
        fingerprint: plan.architectureFingerprint,
      })),
    } as unknown as DesktopBridge;
    const user = userEvent.setup();
    render(
      <DeploymentPage
        bridge={bridge}
        initialPath="C:\\projects\\platform"
        preferences={{
          ...defaultPreferences,
          defaultEnvironmentView: 'production',
          preferredDeploymentTarget: 'kubernetes',
        }}
        onPath={() => undefined}
        onActivity={() => undefined}
      />,
    );
    expect(screen.getByText(/does not deploy applications/u)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Deploy now/u })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Scan project' }));
    await user.click(screen.getByRole('button', { name: 'Generate deployment files' }));
    expect(await screen.findByText('Readiness: Ready')).toBeInTheDocument();
    expect(screen.getByLabelText('Deployment file preview')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Choose folder' }));
    expect(screen.getByRole('button', { name: 'Export configuration' })).toBeDisabled();
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Export configuration' }));
    expect(bridge.exportDeployment).toHaveBeenCalledOnce();
  });

  it('displays blocking browser-secret errors without an export action', async () => {
    const current = scan();
    current.project.variables.push({
      name: 'VITE_DATABASE_PASSWORD',
      owner: 'service:web',
      description: 'unsafe',
      required: true,
      secret: true,
      browserVisible: true,
      profiles: ['production'],
    });
    const bridge = {
      scanDeployment: vi.fn(async () => current),
      planDeployment: vi.fn(async () => {
        throw new Error('VITE_DATABASE_PASSWORD is secret but browser-visible.');
      }),
    } as unknown as DesktopBridge;
    const user = userEvent.setup();
    render(
      <DeploymentPage
        bridge={bridge}
        initialPath="C:\\projects\\platform"
        preferences={{ ...defaultPreferences, defaultEnvironmentView: 'production' }}
        onPath={() => undefined}
        onActivity={() => undefined}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Scan project' }));
    await user.click(screen.getByRole('button', { name: 'Generate deployment files' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('secret but browser-visible');
    expect(screen.queryByRole('button', { name: 'Export configuration' })).not.toBeInTheDocument();
  });
});
