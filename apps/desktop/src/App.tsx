import { useMemo, useState } from 'react';
import {
  createRequest,
  devCommand,
  initialFormState,
  initialProgress,
  installCommand,
  mergeProgress,
  progressLabels,
  sanitizeTechnicalDetails,
  validateForm,
  type FormState,
} from './state';
import type { DesktopBridge, DesktopCreateResult, ProgressEvent } from './types';

type View = 'form' | 'confirm' | 'creating' | 'success' | 'error';

export function App({ bridge }: { bridge: DesktopBridge }) {
  const [form, setForm] = useState<FormState>(initialFormState);
  const [view, setView] = useState<View>('form');
  const [progress, setProgress] = useState<ProgressEvent[]>(initialProgress(initialFormState));
  const [result, setResult] = useState<DesktopCreateResult>();
  const [error, setError] = useState<string>();
  const [technicalDetails, setTechnicalDetails] = useState<string>();
  const [locationError, setLocationError] = useState<string>();

  const errors = useMemo(() => validateForm(form), [form]);
  const valid = Object.keys(errors).length === 0;
  const running = view === 'creating';

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function selectDestination() {
    setLocationError(undefined);
    try {
      const selected = await bridge.selectDestination();
      if (selected) update('destinationDirectory', selected);
    } catch (cause) {
      setLocationError('The folder selector could not be opened.');
      setTechnicalDetails(sanitizeTechnicalDetails(cause));
    }
  }

  async function create() {
    if (!valid || running) return;
    setView('creating');
    setProgress(initialProgress(form));
    setError(undefined);
    setTechnicalDetails(undefined);
    try {
      const created = await bridge.createProject(createRequest(form), (event) => {
        setProgress((current) => mergeProgress(current, event));
      });
      setResult(created);
      setView('success');
    } catch (cause) {
      setError(userMessage(cause));
      setTechnicalDetails(sanitizeTechnicalDetails(cause));
      setView('error');
    }
  }

  function reset() {
    setForm(initialFormState);
    setProgress(initialProgress(initialFormState));
    setResult(undefined);
    setError(undefined);
    setTechnicalDetails(undefined);
    setView('form');
  }

  if (view === 'success' && result) {
    return (
      <Shell>
        <section className="panel result" aria-labelledby="success-title">
          <div className="success-mark" aria-hidden="true">
            ✓
          </div>
          <p className="eyebrow">Project ready</p>
          <h2 id="success-title">{result.projectName} was created</h2>
          <dl className="result-grid">
            <ResultItem label="Location" value={result.projectDirectory} />
            <ResultItem label="Framework" value="Next.js" />
            <ResultItem label="Package manager" value={result.packageManager} />
            <ResultItem
              label="Features"
              value={
                result.initializedFeatures.length ? result.initializedFeatures.join(', ') : 'None'
              }
            />
          </dl>
          {result.warnings.length > 0 && (
            <div className="notice warning" role="status">
              <strong>Created with warnings</strong>
              <ul>
                {result.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="next-steps">
            <h3>Next steps</h3>
            <code>{installCommand(result.packageManager)}</code>
            <code>{devCommand(result.packageManager)}</code>
          </div>
          <div className="actions wrap">
            <button
              className="primary"
              onClick={() => bridge.openProjectFolder(result.projectDirectory)}
            >
              Open project folder
            </button>
            <button onClick={() => bridge.copyProjectPath(result.projectDirectory)}>
              Copy project path
            </button>
            <button onClick={reset}>Create another project</button>
          </div>
        </section>
      </Shell>
    );
  }

  if (view === 'creating') {
    return (
      <Shell>
        <section className="panel" aria-labelledby="progress-title" aria-live="polite">
          <p className="eyebrow">Creating project</p>
          <h2 id="progress-title">Building {form.projectName.trim()}</h2>
          <p className="muted">Keep ForgeKi open while the project files are prepared.</p>
          <ol className="progress-list">
            {progress.map((item) => (
              <li key={item.step} data-state={item.state}>
                <span className="status-symbol" aria-hidden="true">
                  {statusSymbol(item.state)}
                </span>
                <span>
                  <strong>{progressLabels[item.step]}</strong>
                  <small>{item.message}</small>
                </span>
                <span className="status-text">{item.state}</span>
              </li>
            ))}
          </ol>
        </section>
      </Shell>
    );
  }

  if (view === 'error') {
    return (
      <Shell>
        <section className="panel result" aria-labelledby="error-title">
          <div className="error-mark" aria-hidden="true">
            !
          </div>
          <p className="eyebrow">Creation stopped</p>
          <h2 id="error-title">Project could not be created</h2>
          <p role="alert">{error}</p>
          {technicalDetails && (
            <details>
              <summary>Technical details</summary>
              <pre>{technicalDetails}</pre>
            </details>
          )}
          <div className="actions">
            <button className="primary" onClick={() => setView('form')}>
              Review settings
            </button>
          </div>
        </section>
      </Shell>
    );
  }

  return (
    <Shell>
      <section className="panel" aria-labelledby="form-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">New project</p>
            <h2 id="form-title">Configure your Next.js app</h2>
          </div>
          <span className="framework-badge">Next.js · TypeScript · App Router</span>
        </div>

        <div className="form-grid">
          <label className="field">
            <span>Project name</span>
            <input
              aria-label="Project name"
              value={form.projectName}
              placeholder="my-app"
              autoFocus
              aria-invalid={Boolean(form.projectName && errors.projectName)}
              aria-describedby="project-name-error"
              disabled={view === 'confirm'}
              onChange={(event) => update('projectName', event.target.value)}
            />
            <small id="project-name-error" className="field-message">
              {form.projectName ? errors.projectName : 'Use a lowercase npm-compatible name.'}
            </small>
          </label>

          <div className="field">
            <span>Project location</span>
            <div className="location-picker">
              <output aria-label="Selected project location">
                {form.destinationDirectory || 'No folder selected'}
              </output>
              <button type="button" onClick={selectDestination} disabled={view === 'confirm'}>
                Choose folder
              </button>
            </div>
            <small className="field-message error">{locationError ?? errors.destination}</small>
          </div>

          <div className="field static-field">
            <span>Framework</span>
            <strong>Next.js</strong>
            <small>TypeScript with the App Router</small>
          </div>

          <fieldset className="field manager-field" disabled={view === 'confirm'}>
            <legend>Package manager</legend>
            <div className="segmented">
              {(['pnpm', 'npm', 'yarn', 'bun'] as const).map((manager) => (
                <label key={manager}>
                  <input
                    type="radio"
                    name="package-manager"
                    value={manager}
                    checked={form.packageManager === manager}
                    onChange={() => update('packageManager', manager)}
                  />
                  <span>{manager === 'yarn' ? 'Yarn' : manager === 'bun' ? 'Bun' : manager}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <fieldset className="options" disabled={view === 'confirm'}>
          <legend>Options</legend>
          <Option
            label="Initialize Git repository"
            description="Run a local git init when Git is available."
            checked={form.initializeGit}
            onChange={(checked) => update('initializeGit', checked)}
          />
          <Option
            label="Add Docker configuration"
            description="Create a Dockerfile and .dockerignore safely."
            checked={form.addDocker}
            onChange={(checked) => update('addDocker', checked)}
          />
          <Option
            label="Add GitHub Actions CI"
            description="Create a project-aware validation workflow."
            checked={form.addGitHubActions}
            onChange={(checked) => update('addGitHubActions', checked)}
          />
        </fieldset>

        {view === 'confirm' ? (
          <Confirmation form={form} onCancel={() => setView('form')} onConfirm={create} />
        ) : (
          <div className="actions end">
            <button className="primary" disabled={!valid} onClick={() => setView('confirm')}>
              Create project
            </button>
          </div>
        )}
      </section>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="app-shell">
      <header className="product-header">
        <div className="brand-mark" aria-hidden="true">
          FK
        </div>
        <div>
          <h1>ForgeKi</h1>
          <p>Create development projects visually.</p>
        </div>
      </header>
      {children}
      <footer>No telemetry · No network access · Your files stay local</footer>
    </main>
  );
}

function Option({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="option">
      <span>
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
      <input
        aria-label={label}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

function Confirmation({
  form,
  onCancel,
  onConfirm,
}: {
  form: FormState;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <section className="confirmation" aria-labelledby="confirmation-title">
      <div>
        <p className="eyebrow">Confirm creation</p>
        <h3 id="confirmation-title">Review project configuration</h3>
      </div>
      <dl>
        <ResultItem label="Project" value={form.projectName.trim()} />
        <ResultItem label="Framework" value="Next.js" />
        <ResultItem label="Package manager" value={form.packageManager} />
        <ResultItem label="Location" value={form.destinationDirectory} />
        <ResultItem label="Git" value={enabled(form.initializeGit)} />
        <ResultItem label="Docker" value={enabled(form.addDocker)} />
        <ResultItem label="GitHub Actions" value={enabled(form.addGitHubActions)} />
      </dl>
      <p className="muted">No files are created until you confirm.</p>
      <div className="actions end">
        <button onClick={onCancel}>Back</button>
        <button className="primary" onClick={onConfirm}>
          Confirm and create
        </button>
      </div>
    </section>
  );
}

function ResultItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
function enabled(value: boolean) {
  return value ? 'Enabled' : 'Disabled';
}
function statusSymbol(state: ProgressEvent['state']) {
  return state === 'succeeded'
    ? '✓'
    : state === 'failed'
      ? '×'
      : state === 'warning'
        ? '!'
        : state === 'skipped'
          ? '–'
          : state === 'running'
            ? '•'
            : '○';
}

function userMessage(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : String(cause);
  if (/destination.*not empty/iu.test(message))
    return 'The destination folder already contains files.';
  if (/permission|access.*denied/iu.test(message))
    return 'ForgeKi does not have permission to create files in that location.';
  if (/unsafe|symbolic|traversal/iu.test(message))
    return 'The selected project path is not safe to use.';
  if (/bridge|sidecar|worker/iu.test(message))
    return 'ForgeKi could not communicate with the project creation service.';
  return 'An unexpected filesystem or project creation error occurred.';
}
