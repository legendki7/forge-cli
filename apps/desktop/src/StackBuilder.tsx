import { useMemo, useState } from 'react';
import {
  BUILTIN_STACK_COMPONENTS,
  BUILTIN_STACK_PRESETS,
  getStackComponent,
  validateStack,
  type StackComponentCategory,
  type StackComponentId,
  type StackDefinition,
  type StackFramework,
} from '@forgecli7/core/stacks';
import type { ProjectGenerationPlan } from '@forgecli7/templates';
import type {
  ActivityEntry,
  CustomStackPreset,
  DesktopBridge,
  DesktopCreateResult,
  DesktopPreferences,
} from './types';

const categories: readonly StackComponentCategory[] = [
  'framework',
  'language',
  'styling',
  'database',
  'orm',
  'testing',
  'tooling',
  'runtime',
];

export interface StackBuilderProps {
  bridge: DesktopBridge;
  preferences: DesktopPreferences;
  customPresets: CustomStackPreset[];
  initialStack?: StackDefinition;
  onPresetsChange(presets: CustomStackPreset[]): void;
  onStackChange(stack: StackDefinition): void;
  onCreated(result: DesktopCreateResult): void;
  onActivity(entry: Omit<ActivityEntry, 'id' | 'timestamp'>): void;
}

export function StackBuilderPage({
  bridge,
  preferences,
  customPresets,
  initialStack,
  onPresetsChange,
  onStackChange,
  onCreated,
  onActivity,
}: StackBuilderProps) {
  const [stack, setStack] = useState<StackDefinition>(initialStack ?? defaultStack(preferences));
  const [selectedNode, setSelectedNode] = useState<StackComponentId>(stack.framework);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<StackComponentCategory | 'all'>('all');
  const [feedback, setFeedback] = useState('Select components to compose your application.');
  const [projectName, setProjectName] = useState('my-forgeki-app');
  const [destination, setDestination] = useState(preferences.defaultDestination);
  const [plan, setPlan] = useState<ProjectGenerationPlan>();
  const [previewPath, setPreviewPath] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const validation = useMemo(() => validateStack(stack), [stack]);
  const selected = new Set(validation.resolvedComponents);
  const selectedComponent = getStackComponent(selectedNode);

  const visible = BUILTIN_STACK_COMPONENTS.filter((component) => {
    const query = search.trim().toLowerCase();
    return (
      (category === 'all' || component.category === category) &&
      (!query || `${component.name} ${component.description}`.toLowerCase().includes(query))
    );
  });

  function commit(next: StackDefinition) {
    setStack(next);
    setPlan(undefined);
    setShowReview(false);
    onStackChange(next);
  }

  function toggle(id: StackComponentId) {
    const component = getStackComponent(id);
    setSelectedNode(id);
    if (component.category === 'framework') {
      commit({ ...stack, framework: id as StackFramework });
      setFeedback(
        `Framework changed to ${component.name}. Existing choices were preserved for review.`,
      );
      return;
    }
    const unsupported = !component.supportedFrameworks.includes(stack.framework);
    if (unsupported) {
      setFeedback(
        `${component.name} is not compatible with ${getStackComponent(stack.framework).name}. ${component.category === 'database' ? 'Choose Next.js or Express, or create the backend separately.' : 'Choose a supported framework.'}`,
      );
      return;
    }
    const components = new Set(stack.components);
    if (components.has(id)) {
      if (validation.requiredComponents.includes(id)) {
        setFeedback(`${component.name} is required by another selected component.`);
        return;
      }
      components.delete(id);
    } else components.add(id);
    const next = {
      ...stack,
      components: [...components],
      initializeGit: id === 'git' ? components.has('git') : stack.initializeGit,
      addDocker: id === 'docker' ? components.has('docker') : stack.addDocker,
      addGitHubActions:
        id === 'github-actions' ? components.has('github-actions') : stack.addGitHubActions,
    };
    commit(next);
    const result = validateStack(next);
    setFeedback(
      result.errors[0]
        ? `${result.errors[0].message} ${result.errors[0].resolution}`
        : `${component.name} ${components.has(id) ? 'added' : 'removed'}.`,
    );
  }

  function loadPreset(definition: StackDefinition, name: string) {
    commit({ ...definition, components: [...definition.components] });
    setSelectedNode(definition.framework);
    setFeedback(`${name} loaded. Review every component before generation.`);
    onActivity({ type: 'preset-loaded', result: 'success', message: `${name} preset loaded.` });
  }

  function savePreset() {
    const name = window.prompt('Preset name');
    if (!name?.trim()) return;
    const description = window.prompt('Preset description')?.trim() ?? '';
    const now = new Date().toISOString();
    const preset: CustomStackPreset = {
      schemaVersion: 1,
      id: `custom-${Date.now()}`,
      name: name.trim().slice(0, 120),
      description: description.slice(0, 300),
      definition: { ...stack, components: [...stack.components] },
      createdAt: now,
      updatedAt: now,
    };
    onPresetsChange([preset, ...customPresets].slice(0, 50));
    onActivity({ type: 'preset-saved', result: 'success', message: 'Custom stack preset saved.' });
  }

  function renamePreset(preset: CustomStackPreset) {
    const name = window.prompt('Preset name', preset.name)?.trim();
    if (!name) return;
    const updated = {
      ...preset,
      name: name.slice(0, 120),
      updatedAt: new Date().toISOString(),
    };
    onPresetsChange(
      customPresets.map((candidate) => (candidate.id === preset.id ? updated : candidate)),
    );
    onActivity({
      type: 'preset-saved',
      result: 'success',
      message: 'Custom stack preset renamed.',
    });
  }

  function duplicatePreset(preset: CustomStackPreset) {
    const now = new Date().toISOString();
    onPresetsChange(
      [
        {
          ...preset,
          id: `custom-${Date.now()}`,
          name: `${preset.name} copy`.slice(0, 120),
          definition: { ...preset.definition, components: [...preset.definition.components] },
          createdAt: now,
          updatedAt: now,
        },
        ...customPresets,
      ].slice(0, 50),
    );
    onActivity({
      type: 'preset-saved',
      result: 'success',
      message: 'Custom stack preset duplicated.',
    });
  }

  async function chooseDestination() {
    const value = await bridge.selectDestination();
    if (value) setDestination(value);
  }

  async function review() {
    if (!validation.valid) {
      setFeedback(`${validation.errors[0]!.message} ${validation.errors[0]!.resolution}`);
      onActivity({
        type: 'stack-validation-failed',
        result: 'failed',
        message: 'Stack validation failed.',
      });
      return;
    }
    if (
      preferences.confirmRequiredComponents &&
      validation.requiredComponents.length > 0 &&
      !window.confirm(
        `Add required components: ${validation.requiredComponents
          .map((id) => getStackComponent(id).name)
          .join(', ')}?`,
      )
    ) {
      setFeedback('Generation review cancelled. Required components were not confirmed.');
      return;
    }
    if (!destination) {
      setFeedback('Choose a parent destination before reviewing the plan.');
      return;
    }
    setBusy(true);
    try {
      const nextPlan = await bridge.planStack({
        projectName,
        destinationDirectory: destination,
        stack,
        ...(stack.templateId ? { templateId: stack.templateId } : {}),
      });
      setPlan(nextPlan);
      setPreviewPath(nextPlan.files[0]?.path);
      setShowReview(true);
      onActivity({ type: 'stack-configured', result: 'success', message: 'Stack plan reviewed.' });
    } catch {
      setFeedback('ForgeKi could not create a trusted generation plan. Review the stack and path.');
    } finally {
      setBusy(false);
    }
  }

  async function generate() {
    if (!plan || busy) return;
    setBusy(true);
    try {
      const result = await bridge.createStack(
        {
          projectName,
          destinationDirectory: destination,
          framework: stack.framework,
          templateId:
            stack.framework === 'nextjs'
              ? ((stack.templateId ?? 'nextjs-blank') as 'nextjs-blank')
              : stack.framework,
          packageManager: stack.packageManager,
          initializeGit: stack.initializeGit,
          addDocker: stack.addDocker,
          addGitHubActions: stack.addGitHubActions,
          stack,
          generationPlan: plan,
        },
        () => undefined,
      );
      onCreated(result);
      onActivity({
        type: 'stack-generated',
        projectName: result.projectName,
        projectPath: result.projectDirectory,
        result: result.warnings.length ? 'warning' : 'success',
        message: 'Project generated from a validated stack.',
      });
      setFeedback('Project generated successfully. Open Home or Scan Project to continue.');
    } catch {
      setFeedback('Project generation failed safely. No existing files were overwritten.');
    } finally {
      setBusy(false);
    }
  }

  const preview = plan?.files.find(({ path }) => path === previewPath);
  return (
    <section className="page stack-builder-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Visual architecture</p>
          <h1>Stack Builder</h1>
          <p>Compose a trusted application stack, validate compatibility, and review every file.</p>
        </div>
        <button onClick={savePreset}>Save preset</button>
      </header>

      <section className="preset-strip" aria-label="Built-in stack presets">
        {[...BUILTIN_STACK_PRESETS, ...customPresets].map((preset) => (
          <div className="preset-item" key={preset.id}>
            <button onClick={() => loadPreset(preset.definition, preset.name)}>
              {preset.name}
            </button>
            {!('builtIn' in preset) && (
              <>
                <button aria-label={`Rename ${preset.name}`} onClick={() => renamePreset(preset)}>
                  Rename
                </button>
                <button
                  aria-label={`Duplicate ${preset.name}`}
                  onClick={() => duplicatePreset(preset)}
                >
                  Duplicate
                </button>
                <button
                  aria-label={`Delete ${preset.name}`}
                  onClick={() => {
                    if (window.confirm(`Delete ${preset.name}?`))
                      onPresetsChange(customPresets.filter(({ id }) => id !== preset.id));
                  }}
                >
                  Delete
                </button>
              </>
            )}
          </div>
        ))}
      </section>

      <div className="stack-workspace">
        <section className="stack-catalog" aria-label="Component catalog">
          <h2>Components</h2>
          <input
            aria-label="Search stack components"
            placeholder="Search components"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select
            aria-label="Stack component category"
            value={category}
            onChange={(event) => setCategory(event.target.value as typeof category)}
          >
            <option value="all">All categories</option>
            {categories.map((value) => (
              <option key={value} value={value}>
                {title(value)}
              </option>
            ))}
          </select>
          <div className="component-list">
            {visible.map((component) => {
              const unsupported = !component.supportedFrameworks.includes(stack.framework);
              const active = selected.has(component.id);
              const automatic = validation.requiredComponents.includes(component.id);
              return (
                <button
                  key={component.id}
                  className={`component-card ${active ? 'selected' : ''} ${unsupported ? 'disabled' : ''}`}
                  aria-pressed={active}
                  aria-disabled={unsupported}
                  onClick={() => toggle(component.id)}
                >
                  <span>
                    <strong>{component.name}</strong>
                    {automatic && <small>Required</small>}
                  </span>
                  <small>{component.description}</small>
                  {unsupported && <em>Not supported by this framework</em>}
                </button>
              );
            })}
          </div>
        </section>

        <section className="stack-canvas" aria-label="Visual stack canvas">
          <div className="section-title">
            <h2>Architecture</h2>
            <button onClick={() => setSelectedNode(stack.framework)}>Reset view</button>
          </div>
          <div className="architecture-tree">
            <button className="architecture-root" onClick={() => setSelectedNode(stack.framework)}>
              {getStackComponent(stack.framework).name}
            </button>
            <div className="architecture-branches">
              {validation.resolvedComponents
                .filter((id) => id !== stack.framework)
                .map((id) => (
                  <button
                    key={id}
                    className={validation.requiredComponents.includes(id) ? 'required' : ''}
                    onClick={() => setSelectedNode(id)}
                  >
                    <span aria-hidden="true">├─</span> {getStackComponent(id).name}
                  </button>
                ))}
            </div>
          </div>
          <div className={`compatibility-banner ${validation.valid ? 'valid' : 'conflict'}`}>
            <strong>{validation.valid ? 'Compatible stack' : 'Compatibility issue'}</strong>
            <p>{validation.errors[0]?.message ?? feedback}</p>
            {validation.errors[0] && <p>{validation.errors[0].resolution}</p>}
            {validation.errors[0]?.code === 'missing-requirement' && (
              <div className="compatibility-actions">
                <button onClick={() => toggle('postgres')}>Add PostgreSQL</button>
                <button onClick={() => toggle('sqlite')}>Add SQLite</button>
              </div>
            )}
          </div>
        </section>

        <aside className="stack-inspector" aria-label="Configuration inspector">
          <h2>{selectedComponent.name}</h2>
          <span className="badge">{title(selectedComponent.category)}</span>
          <p>{selectedComponent.description}</p>
          <h3>Supported frameworks</h3>
          <p>
            {selectedComponent.supportedFrameworks
              .map((id) => getStackComponent(id).name)
              .join(', ')}
          </p>
          {preferences.mode === 'advanced' && (
            <>
              <h3>Dependencies</h3>
              <CodeList
                values={[
                  ...selectedComponent.dependencies.map(
                    ({ name, version }) => `${name}@${version}`,
                  ),
                  ...selectedComponent.devDependencies.map(
                    ({ name, version }) => `${name}@${version} (dev)`,
                  ),
                ]}
              />
              <h3>Generated files</h3>
              <CodeList values={selectedComponent.generatedFiles.map(({ path }) => path)} />
              <h3>Compatibility rules</h3>
              <CodeList
                values={[
                  ...selectedComponent.requires.map(({ message }) => message),
                  ...selectedComponent.conflictsWith.map(
                    (id) => `Conflicts with ${getStackComponent(id).name}`,
                  ),
                ]}
              />
            </>
          )}
        </aside>
      </div>

      <section className="stack-project-config">
        <label>
          Project name
          <input value={projectName} onChange={(event) => setProjectName(event.target.value)} />
        </label>
        <label>
          Package manager
          <select
            value={stack.packageManager}
            onChange={(event) =>
              commit({
                ...stack,
                packageManager: event.target.value as StackDefinition['packageManager'],
              })
            }
          >
            {['pnpm', 'npm', 'yarn', 'bun'].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <div>
          <span>Parent destination</span>
          <button onClick={chooseDestination}>{destination || 'Choose folder'}</button>
        </div>
        <button className="primary" disabled={busy || !validation.valid} onClick={review}>
          {busy ? 'Planning…' : 'Review generation plan'}
        </button>
      </section>

      {showReview && plan && (
        <section className="stack-review" aria-label="Stack generation review">
          <div className="section-title">
            <div>
              <p className="eyebrow">No files have been created</p>
              <h2>Generation review</h2>
            </div>
            <button className="primary" disabled={busy} onClick={generate}>
              {busy ? 'Generating…' : 'Confirm and generate'}
            </button>
          </div>
          <dl className="summary-grid">
            <Item label="Project" value={projectName} />
            <Item label="Destination" value={destination} />
            <Item label="Framework" value={getStackComponent(stack.framework).name} />
            <Item label="Template" value={plan.templateId} />
            <Item label="Package manager" value={stack.packageManager} />
            <Item
              label="Components"
              value={validation.resolvedComponents
                .map((id) => getStackComponent(id).name)
                .join(', ')}
            />
            <Item
              label="Automatically required"
              value={
                validation.requiredComponents.length
                  ? validation.requiredComponents.map((id) => getStackComponent(id).name).join(', ')
                  : 'None'
              }
            />
            <Item label="Files" value={String(plan.files.length)} />
            <Item label="Git" value={stack.initializeGit ? 'Enabled' : 'Disabled'} />
            <Item label="Docker" value={stack.addDocker ? 'Enabled' : 'Disabled'} />
            <Item label="GitHub Actions" value={stack.addGitHubActions ? 'Enabled' : 'Disabled'} />
          </dl>
          <div className="plan-preview">
            <div className="plan-tree" aria-label="Generated file tree">
              {plan.files.map((file) => (
                <button
                  key={file.path}
                  className={previewPath === file.path ? 'selected' : ''}
                  onClick={() => setPreviewPath(file.path)}
                >
                  {file.path} <small>{preferences.mode === 'advanced' ? file.owner : ''}</small>
                </button>
              ))}
            </div>
            <pre aria-label="Generated file preview">
              {preview
                ? preview.content.slice(0, 32_000)
                : 'Select a planned text file to preview it.'}
            </pre>
          </div>
          {preferences.mode === 'advanced' && (
            <div className="technical-plan">
              <section>
                <h3>Dependencies</h3>
                <CodeList
                  values={plan.dependencies.map(({ name, version }) => `${name}@${version}`)}
                />
              </section>
              <section>
                <h3>Scripts</h3>
                <CodeList
                  values={Object.entries(plan.scripts).map(([name, value]) => `${name}: ${value}`)}
                />
              </section>
              <section>
                <h3>Environment variables</h3>
                <CodeList
                  values={plan.environmentVariables.map(
                    ({ name, secret }) => `${name}${secret ? ' (secret placeholder)' : ''}`,
                  )}
                />
              </section>
            </div>
          )}
        </section>
      )}
    </section>
  );
}

function defaultStack(preferences: DesktopPreferences): StackDefinition {
  const components: StackComponentId[] = ['typescript', preferences.defaultStyling];
  if (preferences.defaultTesting !== 'none') components.push(preferences.defaultTesting);
  if (preferences.initializeGit) components.push('git');
  if (preferences.addDocker) components.push('docker');
  if (preferences.addGitHubActions) components.push('github-actions');
  return {
    framework: preferences.defaultFramework,
    components,
    packageManager: preferences.defaultPackageManager,
    initializeGit: preferences.initializeGit,
    addDocker: preferences.addDocker,
    addGitHubActions: preferences.addGitHubActions,
  };
}
function title(value: string) {
  return value
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
function CodeList({ values }: { values: string[] }) {
  return values.length ? (
    <ul className="file-list">
      {values.map((value) => (
        <li key={value}>
          <code>{value}</code>
        </li>
      ))}
    </ul>
  ) : (
    <p>None.</p>
  );
}
function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
