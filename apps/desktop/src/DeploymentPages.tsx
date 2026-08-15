import { useMemo, useState } from 'react';
import {
  DEPLOYMENT_TARGETS,
  compatibleDeploymentTargets,
  createEnvironmentProfiles,
  type DeploymentProfile,
  type DeploymentScanResult,
  type DeploymentTargetId,
  type EnvironmentProfileId,
} from '@forgecli7/deployments/browser';
import type { ActivityEntry, DesktopBridge, DesktopPreferences } from './types';

interface SharedProps {
  bridge: DesktopBridge;
  initialPath?: string;
  preferences: DesktopPreferences;
  onPath(path: string): void;
  onActivity(entry: Omit<ActivityEntry, 'id' | 'timestamp'>): void;
}

export function EnvironmentsPage(props: SharedProps) {
  const [projectPath, setProjectPath] = useState(props.initialPath ?? '');
  const [selected, setSelected] = useState<EnvironmentProfileId>(
    props.preferences.defaultEnvironmentView,
  );
  const [scan, setScan] = useState<DeploymentScanResult>();
  const [error, setError] = useState('');
  const profiles = useMemo(() => createEnvironmentProfiles(scan?.project.variables ?? []), [scan]);

  async function review() {
    if (!props.bridge.scanDeployment) return setError('The deployment bridge is unavailable.');
    setError('');
    try {
      const result = await props.bridge.scanDeployment(projectPath);
      setScan(result);
      props.onPath(projectPath);
      props.onActivity({
        type: 'environment-profile-reviewed',
        projectName: result.project.name,
        projectPath,
        result: 'success',
        message: `${selected} environment profile reviewed.`,
      });
      if (result.drift.some(({ state }) => state === 'modified' || state === 'missing'))
        props.onActivity({
          type: 'deployment-drift-detected',
          projectName: result.project.name,
          projectPath,
          result: 'warning',
          message: 'Deployment drift was detected during environment review.',
        });
    } catch (reason) {
      setError(message(reason));
    }
  }

  const variables =
    scan?.project.variables.filter(({ profiles: ids }) => ids.includes(selected)) ?? [];
  return (
    <section className="page-section deployment-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Configuration schemas</p>
          <h1>Environments</h1>
          <p>
            Understand Local, Staging, and Production configuration without storing secret values.
          </p>
        </div>
      </header>
      <div className="surface stack-project-config">
        <label>
          Project or workspace
          <input
            aria-label="Environment project path"
            value={projectPath}
            onChange={(event) => setProjectPath(event.target.value)}
            placeholder="C:\\projects\\my-platform"
          />
        </label>
        <button onClick={() => void review()}>Review environment profiles</button>
      </div>
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      {scan && (
        <>
          <div className="profile-tabs" role="tablist" aria-label="Environment profiles">
            {profiles.map((profile) => (
              <button
                key={profile.id}
                role="tab"
                aria-selected={selected === profile.id}
                className={selected === profile.id ? 'selected' : ''}
                onClick={() => setSelected(profile.id)}
              >
                {profile.name}
              </button>
            ))}
          </div>
          {props.preferences.mode === 'beginner' && (
            <div className="compatibility-banner">
              <strong>{profiles.find(({ id }) => id === selected)?.name}</strong>
              <p>{profiles.find(({ id }) => id === selected)?.description}</p>
              <p>
                <strong>Secret:</strong> A private value such as a database password or API key.
                ForgeKi never stores the real value.
              </p>
            </div>
          )}
          <div className="technical-plan">
            <article className="surface">
              <strong>Services</strong>
              <span>{scan.project.services.length}</span>
            </article>
            <article className="surface">
              <strong>Required variables</strong>
              <span>{variables.filter(({ required }) => required).length}</span>
            </article>
            <article className="surface">
              <strong>Validation</strong>
              <span>
                {variables.some(({ secret, browserVisible }) => secret && browserVisible)
                  ? 'Blocked'
                  : 'Schema ready'}
              </span>
            </article>
            <article className="surface">
              <strong>Missing schema definitions</strong>
              <span>{variables.filter(({ name }) => !name).length}</span>
            </article>
            <article className="surface">
              <strong>Deployment target</strong>
              <span>{props.preferences.preferredDeploymentTarget}</span>
            </article>
          </div>
          <section className="surface">
            <h2>Environment matrix</h2>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Variable</th>
                    <th>Owner</th>
                    <th>Local</th>
                    <th>Staging</th>
                    <th>Production</th>
                    <th>Boundary</th>
                  </tr>
                </thead>
                <tbody>
                  {scan.project.variables.map((item) => (
                    <tr key={`${item.owner}:${item.name}`}>
                      <td>
                        <code>{item.name}</code>
                      </td>
                      <td>{item.owner}</td>
                      {(['local', 'staging', 'production'] as const).map((id) => (
                        <td key={id}>{item.profiles.includes(id) ? '✓' : '—'}</td>
                      ))}
                      <td>
                        <span className="status-badge">
                          {item.secret
                            ? 'Secret'
                            : item.browserVisible
                              ? 'Public'
                              : 'Configuration'}
                        </span>{' '}
                        <span className="status-badge">
                          {item.required ? 'Required' : 'Optional'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="surface">
            <h2>{selected[0]!.toUpperCase() + selected.slice(1)} topology</h2>
            {scan.project.connections.length ? (
              scan.project.connections.map((connection, index) => {
                const variable = scan.project.variables.find(
                  ({ owner }) => owner === `service:${connection.sourceServiceId}`,
                );
                return (
                  <p key={`${connection.sourceServiceId}-${index}`}>
                    <strong>{connection.sourceServiceId}</strong> →{' '}
                    <code>{variable?.name ?? connection.type}</code> (
                    {variable?.secret ? 'secret' : 'public/config'}) →{' '}
                    <strong>{connection.targetServiceId}</strong>
                  </p>
                );
              })
            ) : (
              <p>Single service configuration; no workspace connections detected.</p>
            )}
          </section>
          <section className="surface">
            <h2>Compare environments</h2>
            <div className="environment-comparison">
              {profiles.map((profile) => (
                <article key={profile.id}>
                  <strong>{profile.name}</strong>
                  <span>{profile.variables.length} schema variables</span>
                  <span>
                    {profile.id === 'production'
                      ? 'Conservative production defaults'
                      : profile.id === 'staging'
                        ? 'Production-like validation'
                        : 'Local development examples'}
                  </span>
                </article>
              ))}
            </div>
          </section>
          {scan.drift.length > 0 && (
            <section className="surface">
              <h2>Deployment drift</h2>
              {scan.drift.map((item) => (
                <p key={item.path}>
                  <code>{item.path}</code> — {driftLabel(item.state)}
                </p>
              ))}
            </section>
          )}
        </>
      )}
    </section>
  );
}

export function DeploymentPage(props: SharedProps) {
  const [projectPath, setProjectPath] = useState(props.initialPath ?? '');
  const [environment, setEnvironment] = useState<EnvironmentProfileId>(
    props.preferences.defaultEnvironmentView,
  );
  const [target, setTarget] = useState<DeploymentTargetId>(
    props.preferences.preferredDeploymentTarget,
  );
  const [scan, setScan] = useState<DeploymentScanResult>();
  const [plan, setPlan] = useState<DeploymentProfile>();
  const [selectedFile, setSelectedFile] = useState('');
  const [output, setOutput] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const targets = scan
    ? compatibleDeploymentTargets(scan.project)
    : DEPLOYMENT_TARGETS.map(({ id }) => id);

  async function inspect() {
    if (!props.bridge.scanDeployment) return setError('The deployment bridge is unavailable.');
    setError('');
    setPlan(undefined);
    setStatus('Scanning deployment evidence…');
    try {
      const result = await props.bridge.scanDeployment(projectPath);
      setScan(result);
      props.onPath(projectPath);
      setStatus('Project architecture scanned read-only.');
      if (!compatibleDeploymentTargets(result.project).includes(target))
        setTarget(compatibleDeploymentTargets(result.project)[0] ?? 'generic-docker');
    } catch (reason) {
      setError(message(reason));
      setStatus('');
    }
  }

  async function generate() {
    if (!props.bridge.planDeployment) return setError('The deployment bridge is unavailable.');
    setError('');
    setStatus('Generating an exact review plan…');
    try {
      const result = await props.bridge.planDeployment(projectPath, environment, target, {
        replicas: props.preferences.defaultKubernetesReplicas,
        includeMetadata: props.preferences.includeDeploymentMetadata,
      });
      setPlan(result);
      setSelectedFile(result.files[0]?.path ?? '');
      setStatus('Deployment files are ready for review. Nothing was deployed.');
      props.onActivity({
        type: 'deployment-plan-generated',
        projectName: result.project.name,
        projectPath,
        result: result.readiness.status === 'ready' ? 'success' : 'warning',
        message: `${environment} ${target} deployment plan generated.`,
      });
    } catch (reason) {
      setError(message(reason));
      setStatus('');
      props.onActivity({
        type: 'deployment-readiness-checked',
        projectPath,
        result: 'failed',
        message: 'Deployment plan blocked by readiness validation.',
      });
    }
  }

  async function chooseOutput() {
    const directory = await props.bridge.selectDestination();
    if (directory) setOutput(directory);
  }

  async function exportFiles() {
    if (!plan || !confirmed || !output || !props.bridge.exportDeployment) return;
    setError('');
    setStatus('Checking collisions before export…');
    try {
      const result = await props.bridge.exportDeployment(projectPath, output, plan, {
        replicas: props.preferences.defaultKubernetesReplicas,
        includeMetadata: props.preferences.includeDeploymentMetadata,
      });
      setStatus(
        `Exported ${result.createdFiles.length} deployment files. ForgeKi did not deploy anything.`,
      );
      props.onActivity({
        type: 'deployment-files-exported',
        projectName: plan.project.name,
        projectPath,
        result: 'success',
        message: `${environment} ${target} deployment files exported.`,
      });
      setConfirmed(false);
    } catch (reason) {
      setError(message(reason));
      setStatus('');
      props.onActivity({
        type: 'deployment-export-blocked',
        projectName: plan.project.name,
        projectPath,
        result: 'failed',
        message: 'Deployment export blocked without overwriting files.',
      });
    }
  }

  const preview = plan?.files.find(({ path: filePath }) => filePath === selectedFile);
  return (
    <section className="page-section deployment-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Reviewable artifacts only</p>
          <h1>Deployment</h1>
          <p>
            Select an environment and target, review readiness, preview the exact plan, then export
            configuration.
          </p>
        </div>
      </header>
      <div className="compatibility-banner">
        <strong>ForgeKi generates deployment configuration.</strong>
        <p>ForgeKi does not deploy applications in Phase 5. There is no “Deploy now” action.</p>
      </div>
      <div className="surface deployment-controls">
        <label>
          Project or workspace
          <input
            aria-label="Deployment project path"
            value={projectPath}
            onChange={(event) => setProjectPath(event.target.value)}
          />
        </label>
        <label>
          Environment
          <select
            aria-label="Deployment environment"
            value={environment}
            onChange={(event) => {
              setEnvironment(event.target.value as EnvironmentProfileId);
              setPlan(undefined);
            }}
          >
            {(['local', 'staging', 'production'] as const).map((id) => (
              <option key={id} value={id}>
                {id[0]!.toUpperCase() + id.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Target
          <select
            aria-label="Deployment target"
            value={target}
            onChange={(event) => {
              setTarget(event.target.value as DeploymentTargetId);
              setPlan(undefined);
            }}
          >
            {DEPLOYMENT_TARGETS.filter(({ id }) => targets.includes(id)).map(({ id, name }) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <button onClick={() => void inspect()}>Scan project</button>
        <button onClick={() => void generate()} disabled={!scan}>
          Generate deployment files
        </button>
      </div>
      {status && (
        <p className="success-banner" role="status">
          {status}
        </p>
      )}
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      {plan && (
        <>
          <section
            className={`compatibility-banner ${plan.readiness.status === 'blocked' ? 'conflict' : ''}`}
          >
            <h2>Readiness: {readinessLabel(plan.readiness.status)}</h2>
            {plan.warnings.map(({ code, message: detail }) => (
              <p key={`${code}:${detail}`}>
                {code}: {detail}
              </p>
            ))}
            <p>No infrastructure reachability or network checks were performed.</p>
          </section>
          <div className="plan-preview">
            <div className="plan-tree">
              <strong>Exact generated file tree</strong>
              {plan.files.map((file) => (
                <button
                  key={file.path}
                  className={selectedFile === file.path ? 'selected' : ''}
                  onClick={() => setSelectedFile(file.path)}
                >
                  {file.path}
                </button>
              ))}
            </div>
            <pre aria-label="Deployment file preview">{preview?.content}</pre>
          </div>
          {props.preferences.mode === 'advanced' ||
          props.preferences.showAdvancedDeploymentOptions ? (
            <section className="surface">
              <h2>Advanced deployment details</h2>
              <p>
                Architecture fingerprint: <code>{plan.architectureFingerprint}</code>
              </p>
              <p>
                Application replicas:{' '}
                {plan.services.find(({ replicas }) => replicas)?.replicas ?? 'Not applicable'}
              </p>
              <p>
                Target: {plan.target}; environment ownership and hashes are available in{' '}
                <code>forgeki.deployment.json</code>.
              </p>
            </section>
          ) : (
            <section className="surface">
              <h2>Before exporting</h2>
              <p>
                Secrets remain schema placeholders. Configure real values in your deployment
                platform after reviewing this bundle.
              </p>
            </section>
          )}
          <section className="surface deployment-export">
            <h2>Export configuration</h2>
            <div className="inline-actions">
              <input
                aria-label="Deployment output folder"
                value={output}
                onChange={(event) => setOutput(event.target.value)}
                placeholder="Choose a separate bundle or project folder"
              />
              <button className="secondary" onClick={() => void chooseOutput()}>
                Choose folder
              </button>
            </div>
            <label className="confirmation">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
              />{' '}
              I reviewed the exact files and understand ForgeKi will not overwrite conflicts.
            </label>
            <button onClick={() => void exportFiles()} disabled={!confirmed || !output}>
              Export configuration
            </button>
          </section>
        </>
      )}
    </section>
  );
}

function readinessLabel(value: DeploymentProfile['readiness']['status']): string {
  return value === 'ready'
    ? 'Ready'
    : value === 'ready-with-warnings'
      ? 'Ready with warnings'
      : 'Blocked';
}

function driftLabel(value: string): string {
  return (
    (
      {
        matches: 'Matches ForgeKi plan',
        modified: 'Modified since generation',
        missing: 'Missing',
        unknown: 'Unknown',
      } as Record<string, string>
    )[value] ?? 'Unknown'
  );
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'Deployment operation failed.';
}
