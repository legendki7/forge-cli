import { useMemo, useState } from 'react';
import {
  BUILTIN_WORKSPACE_PRESETS,
  WORKSPACE_SERVICE_CATALOG,
  asciiWorkspaceArchitecture,
  createWorkspaceConnection,
  createWorkspaceService,
  parseWorkspaceDefinition,
  serializeWorkspace,
  suggestWorkspaceConnection,
  validateWorkspace,
  type CustomWorkspacePreset,
  type ForgeWorkspace,
  type WorkspaceServiceImplementation,
} from '@forgecli7/workspaces/model';
import type { WorkspaceGenerationPlan } from '@forgecli7/workspaces/generation';
import type { DesktopBridge } from './types';

interface Props {
  bridge: DesktopBridge;
  initialWorkspace?: ForgeWorkspace;
  customPresets: CustomWorkspacePreset[];
  onWorkspaceChange(workspace: ForgeWorkspace): void;
  onPresetsChange(presets: CustomWorkspacePreset[]): void;
  onCreated(path: string, workspace: ForgeWorkspace): void;
  onScanned(path: string, workspace: ForgeWorkspace): void;
}

export function WorkspaceBuilderPage(props: Props) {
  const [workspace, setWorkspace] = useState<ForgeWorkspace>(() =>
    parseWorkspaceDefinition(props.initialWorkspace ?? BUILTIN_WORKSPACE_PRESETS[0]!.definition),
  );
  const [selected, setSelected] = useState(workspace.services[0]?.id);
  const [source, setSource] = useState(workspace.services[0]?.id ?? '');
  const [target, setTarget] = useState(workspace.services[1]?.id ?? '');
  const [destination, setDestination] = useState('');
  const [plan, setPlan] = useState<WorkspaceGenerationPlan>();
  const [status, setStatus] = useState('');
  const validation = useMemo(() => validateWorkspace(workspace), [workspace]);
  const active = workspace.services.find(({ id }) => id === selected);

  function update(next: ForgeWorkspace) {
    setWorkspace(next);
    setPlan(undefined);
    props.onWorkspaceChange(next);
  }

  function addService(implementation: WorkspaceServiceImplementation) {
    const base = WORKSPACE_SERVICE_CATALOG.find((item) => item.implementation === implementation)!;
    let index = 1;
    let name: string = base.implementation;
    while (workspace.services.some((service) => service.name === name))
      name = `${base.implementation}-${++index}`;
    const service = createWorkspaceService(implementation, name);
    update({ ...workspace, services: [...workspace.services, service] });
    setSelected(service.id);
  }

  function removeService(id: string) {
    const links = workspace.connections.filter(
      (connection) => connection.sourceServiceId === id || connection.targetServiceId === id,
    );
    if (!globalThis.confirm(`Remove this service and ${links.length} connection(s)?`)) return;
    update({
      ...workspace,
      services: workspace.services.filter((service) => service.id !== id),
      connections: workspace.connections.filter(
        (connection) => connection.sourceServiceId !== id && connection.targetServiceId !== id,
      ),
    });
    setSelected(undefined);
  }

  async function chooseDestination() {
    const selectedDirectory = await props.bridge.selectDestination();
    if (selectedDirectory) setDestination(selectedDirectory);
  }

  async function review() {
    if (!props.bridge.planWorkspace)
      return setStatus('This desktop bridge does not support workspaces.');
    if (!validation.valid || !destination)
      return setStatus('Resolve validation errors and select a destination first.');
    try {
      setPlan(await props.bridge.planWorkspace(workspace, destination));
      setStatus('Plan ready for review.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Planning failed.');
    }
  }

  async function create() {
    if (!plan || !props.bridge.createWorkspace) return;
    try {
      const result = await props.bridge.createWorkspace(plan);
      setPlan(undefined);
      setStatus(`Created ${result.serviceCount} services at ${result.workspaceDirectory}`);
      props.onCreated(result.workspaceDirectory, workspace);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Creation failed.');
    }
  }

  async function importWorkspace() {
    if (!props.bridge.scanWorkspace)
      return setStatus('This desktop bridge does not support workspace scanning.');
    const directory = await props.bridge.selectDestination();
    if (!directory) return;
    try {
      const result = await props.bridge.scanWorkspace(directory);
      update(result.definition);
      props.onScanned(directory, result.definition);
      setStatus(`Imported ${result.definition.services.length} services (${result.source}).`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Import failed.');
    }
  }

  function savePreset() {
    const name = globalThis.prompt('Preset name', workspace.name);
    if (!name?.trim()) return;
    const now = new Date().toISOString();
    const preset: CustomWorkspacePreset = {
      schemaVersion: 1,
      id: `custom-${Date.now()}`,
      name: name.trim(),
      description: 'Custom workspace preset',
      definition: workspace,
      createdAt: now,
      updatedAt: now,
    };
    props.onPresetsChange([preset, ...props.customPresets].slice(0, 50));
    setStatus('Custom preset saved locally.');
  }

  function renamePreset(id: string) {
    const preset = props.customPresets.find((item) => item.id === id);
    const name = preset && globalThis.prompt('Rename preset', preset.name);
    if (!preset || !name?.trim()) return;
    props.onPresetsChange(
      props.customPresets.map((item) =>
        item.id === id ? { ...item, name: name.trim(), updatedAt: new Date().toISOString() } : item,
      ),
    );
  }

  function duplicatePreset(id: string) {
    const preset = props.customPresets.find((item) => item.id === id);
    if (!preset) return;
    const now = new Date().toISOString();
    props.onPresetsChange(
      [
        {
          ...preset,
          id: `custom-${Date.now()}`,
          name: `${preset.name} copy`,
          createdAt: now,
          updatedAt: now,
        },
        ...props.customPresets,
      ].slice(0, 50),
    );
  }

  return (
    <section className="workspace-builder-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Multi-service foundation</p>
          <h1>Workspace Builder</h1>
          <p>
            Model, validate, review, and generate a local monorepo. ForgeKi never installs
            dependencies or starts services.
          </p>
        </div>
      </header>
      <div className="workspace-toolbar">
        <label>
          Name{' '}
          <input
            value={workspace.name}
            onChange={(event) =>
              update({ ...workspace, id: event.target.value, name: event.target.value })
            }
          />
        </label>
        <label>
          Package manager{' '}
          <select
            value={workspace.packageManager}
            onChange={(event) =>
              update({
                ...workspace,
                packageManager: event.target.value as ForgeWorkspace['packageManager'],
              })
            }
          >
            {['pnpm', 'npm', 'yarn', 'bun'].map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label>
          Preset{' '}
          <select
            onChange={(event) => {
              const preset = [...BUILTIN_WORKSPACE_PRESETS, ...props.customPresets].find(
                ({ id }) => id === event.target.value,
              );
              if (preset) update(parseWorkspaceDefinition(preset.definition));
            }}
            defaultValue=""
          >
            <option value="" disabled>
              Choose…
            </option>
            {[...BUILTIN_WORKSPACE_PRESETS, ...props.customPresets].map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <button onClick={savePreset}>Save preset</button>
        <button onClick={() => void importWorkspace()}>Import existing</button>
      </div>
      {!!props.customPresets.length && (
        <div className="workspace-toolbar">
          <strong>Custom presets</strong>
          {props.customPresets.map((preset) => (
            <span key={preset.id}>
              {preset.name} <button onClick={() => renamePreset(preset.id)}>Rename</button>
              <button onClick={() => duplicatePreset(preset.id)}>Duplicate</button>
              <button
                onClick={() => {
                  if (globalThis.confirm(`Delete ${preset.name}?`))
                    props.onPresetsChange(props.customPresets.filter(({ id }) => id !== preset.id));
                }}
              >
                Delete
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="builder-layout">
        <aside className="service-catalog">
          <h2>Services</h2>
          {WORKSPACE_SERVICE_CATALOG.map((item) => (
            <button key={item.implementation} onClick={() => addService(item.implementation)}>
              <strong>{item.name}</strong>
              <small>{item.type}</small>
            </button>
          ))}
        </aside>
        <div className="architecture-canvas" aria-label="Workspace architecture canvas">
          {workspace.services.map((service) => (
            <article
              key={service.id}
              className={`service-node service-${service.type}`}
              data-selected={selected === service.id}
              onClick={() => setSelected(service.id)}
            >
              <small>{service.type}</small>
              <strong>{service.name}</strong>
              <span>
                {service.implementation}
                {service.port ? ` :${service.port}` : ''}
              </span>
              <button
                aria-label={`Remove ${service.name}`}
                onClick={(event) => {
                  event.stopPropagation();
                  removeService(service.id);
                }}
              >
                ×
              </button>
            </article>
          ))}
          {!workspace.services.length && <p>Add a service from the catalog.</p>}
          <section className="connection-panel">
            <h3>Connections</h3>
            {workspace.connections.map((connection) => (
              <div key={connection.id}>
                <code>
                  {connection.sourceServiceId} → {connection.targetServiceId} [{connection.type}]
                </code>
                <button
                  onClick={() =>
                    update({
                      ...workspace,
                      connections: workspace.connections.filter(({ id }) => id !== connection.id),
                    })
                  }
                >
                  Disconnect
                </button>
              </div>
            ))}
            <div>
              <select value={source} onChange={(event) => setSource(event.target.value)}>
                {workspace.services.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.name}
                  </option>
                ))}
              </select>
              <span>→</span>
              <select value={target} onChange={(event) => setTarget(event.target.value)}>
                {workspace.services.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.name}
                  </option>
                ))}
              </select>
              <button
                onClick={() => {
                  const sourceService = workspace.services.find(({ id }) => id === source);
                  const targetService = workspace.services.find(({ id }) => id === target);
                  const type =
                    sourceService && targetService
                      ? suggestWorkspaceConnection(sourceService, targetService)
                      : undefined;
                  if (type)
                    update({
                      ...workspace,
                      connections: [
                        ...workspace.connections,
                        createWorkspaceConnection(source, target, type),
                      ],
                    });
                  else setStatus('Those service types do not support a connection.');
                }}
              >
                Connect
              </button>
            </div>
          </section>
        </div>
        <aside className="service-inspector">
          <h2>Inspector</h2>
          {active ? (
            <>
              <label>
                Service name
                <input
                  value={active.name}
                  onChange={(event) => {
                    const renamed = createWorkspaceService(
                      active.implementation,
                      event.target.value,
                      {
                        port: active.port,
                        components: active.components,
                        environmentVariables: active.environmentVariables,
                        docker: active.docker,
                      },
                    );
                    update({
                      ...workspace,
                      services: workspace.services.map((item) =>
                        item.id === active.id ? renamed : item,
                      ),
                      connections: workspace.connections.map((connection) => ({
                        ...connection,
                        sourceServiceId:
                          connection.sourceServiceId === active.id
                            ? renamed.id
                            : connection.sourceServiceId,
                        targetServiceId:
                          connection.targetServiceId === active.id
                            ? renamed.id
                            : connection.targetServiceId,
                      })),
                    });
                    setSelected(event.target.value);
                  }}
                />
              </label>
              <label>
                Port
                <input
                  type="number"
                  value={active.port ?? ''}
                  onChange={(event) =>
                    update({
                      ...workspace,
                      services: workspace.services.map((item) =>
                        item.id === active.id
                          ? {
                              ...item,
                              port: event.target.value ? Number(event.target.value) : undefined,
                            }
                          : item,
                      ),
                    })
                  }
                />
              </label>
              <fieldset>
                <legend>Components</legend>
                {(
                  ['plain-css', 'tailwind', 'vitest', 'playwright', 'prisma', 'drizzle'] as const
                ).map((component) => (
                  <label key={component}>
                    <input
                      type="checkbox"
                      checked={active.components?.includes(component) ?? false}
                      onChange={(event) =>
                        update({
                          ...workspace,
                          services: workspace.services.map((item) =>
                            item.id === active.id
                              ? {
                                  ...item,
                                  components: event.target.checked
                                    ? [...(item.components ?? []), component]
                                    : (item.components ?? []).filter(
                                        (value) => value !== component,
                                      ),
                                }
                              : item,
                          ),
                        })
                      }
                    />{' '}
                    {component}
                  </label>
                ))}
              </fieldset>
              <div>
                <strong>Planned environment</strong>
                {validation.environment
                  .filter(
                    (variable) =>
                      variable.owner === `service:${active.id}` ||
                      workspace.connections.some(
                        (connection) =>
                          connection.sourceServiceId === active.id &&
                          variable.owner === `connection:${connection.id}`,
                      ),
                  )
                  .map((variable) => (
                    <code key={`${variable.owner}-${variable.name}`}>
                      {variable.name}={variable.localExample}
                    </code>
                  ))}
              </div>
              <button
                onClick={() => {
                  const duplicate = createWorkspaceService(
                    active.implementation,
                    `${active.name}-copy`,
                    { ...active },
                  );
                  update({ ...workspace, services: [...workspace.services, duplicate] });
                }}
              >
                Duplicate
              </button>
            </>
          ) : (
            <p>Select a service.</p>
          )}
        </aside>
      </div>
      <div className="workspace-review-bar">
        <label>
          <input
            type="checkbox"
            checked={workspace.tooling.initializeGit}
            onChange={(event) =>
              update({
                ...workspace,
                tooling: { ...workspace.tooling, initializeGit: event.target.checked },
              })
            }
          />{' '}
          Git
        </label>
        <label>
          <input
            type="checkbox"
            checked={workspace.tooling.docker}
            onChange={(event) =>
              update({
                ...workspace,
                tooling: { ...workspace.tooling, docker: event.target.checked },
              })
            }
          />{' '}
          Docker Compose
        </label>
        <label>
          <input
            type="checkbox"
            checked={workspace.tooling.githubActions}
            onChange={(event) =>
              update({
                ...workspace,
                tooling: { ...workspace.tooling, githubActions: event.target.checked },
              })
            }
          />{' '}
          GitHub Actions
        </label>
        <button onClick={() => void chooseDestination()}>
          {destination || 'Choose destination'}
        </button>
        <button className="primary-action" onClick={() => void review()}>
          Review workspace
        </button>
      </div>
      <pre className="architecture-summary">{asciiWorkspaceArchitecture(workspace)}</pre>
      {!!validation.errors.length && (
        <div className="validation-summary" role="alert">
          {validation.errors.map((issue) => (
            <p key={`${issue.path}-${issue.code}`}>
              {issue.path}: {issue.message}
            </p>
          ))}
        </div>
      )}
      {status && <p role="status">{status}</p>}
      {plan && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Review workspace generation plan"
        >
          <div className="review-modal">
            <h2>Review generation plan</h2>
            <p>
              {plan.servicePlans.length} services · {plan.files.length} files ·{' '}
              {plan.connections.length} connections
            </p>
            <details open>
              <summary>Files</summary>
              <ul>
                {plan.files.map((file) => (
                  <li key={file.path}>
                    <code>{file.path}</code> <small>{file.owner}</small>
                  </li>
                ))}
              </ul>
            </details>
            <details>
              <summary>Configuration JSON</summary>
              <pre>{serializeWorkspace(workspace)}</pre>
            </details>
            <button
              onClick={() => void props.bridge.copyText?.(asciiWorkspaceArchitecture(workspace))}
            >
              Copy architecture
            </button>
            <button onClick={() => void props.bridge.copyText?.(serializeWorkspace(workspace))}>
              Copy config
            </button>
            <button onClick={() => setPlan(undefined)}>Cancel</button>
            <button className="primary-action" onClick={() => void create()}>
              Confirm and create
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
