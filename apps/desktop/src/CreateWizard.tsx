import { useMemo, useState } from 'react';
import {
  BUILTIN_TEMPLATES,
  getBuiltinTemplate,
  type TemplateId,
} from '@forgecli7/templates/catalog';
import {
  createRequest,
  devCommand,
  initialProgress,
  installCommand,
  mergeProgress,
  progressLabels,
  sanitizeTechnicalDetails,
  validateForm,
  type FormState,
} from './state';
import type {
  DesktopBridge,
  DesktopCreateResult,
  DesktopPreferences,
  ProgressEvent,
} from './types';

const steps = ['Project', 'Template', 'Tooling', 'Review', 'Create'] as const;

export function CreateWizard({
  bridge,
  preferences,
  initialTemplateId,
  onCreated,
  onHome,
}: {
  bridge: DesktopBridge;
  preferences: DesktopPreferences;
  initialTemplateId: TemplateId;
  onCreated: (result: DesktopCreateResult) => void;
  onHome: () => void;
}) {
  const [form, setForm] = useState<FormState>(() => ({
    projectName: '',
    destinationDirectory: preferences.defaultDestination,
    templateId: initialTemplateId,
    packageManager: preferences.defaultPackageManager,
    initializeGit: preferences.initializeGit,
    addDocker: preferences.addDocker,
    addGitHubActions: preferences.addGitHubActions,
  }));
  const [step, setStep] = useState(0);
  const [progress, setProgress] = useState<ProgressEvent[]>(initialProgress(form));
  const [result, setResult] = useState<DesktopCreateResult>();
  const [error, setError] = useState<string>();
  const [details, setDetails] = useState<string>();
  const [selectError, setSelectError] = useState<string>();
  const errors = useMemo(() => validateForm(form), [form]);
  const template = getBuiltinTemplate(form.templateId);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function chooseDirectory() {
    setSelectError(undefined);
    try {
      const selected = await bridge.selectDestination();
      if (selected) update('destinationDirectory', selected);
    } catch (cause) {
      setSelectError('The native folder picker could not be opened.');
      setDetails(sanitizeTechnicalDetails(cause));
    }
  }

  async function create() {
    if (Object.keys(errors).length > 0) return;
    setStep(4);
    setError(undefined);
    setDetails(undefined);
    setProgress(initialProgress(form));
    try {
      const created = await bridge.createProject(createRequest(form), (event) =>
        setProgress((current) => mergeProgress(current, event)),
      );
      setResult(created);
      onCreated(created);
    } catch (cause) {
      setError(userMessage(cause));
      setDetails(sanitizeTechnicalDetails(cause));
    }
  }

  function reset() {
    setForm((current) => ({ ...current, projectName: '' }));
    setProgress(initialProgress(form));
    setResult(undefined);
    setError(undefined);
    setDetails(undefined);
    setStep(0);
  }

  const canContinue =
    step === 0
      ? !errors.projectName && !errors.destination
      : step === 1
        ? Boolean(form.templateId)
        : true;

  return (
    <section className="page" aria-labelledby="create-title">
      <PageHeading
        eyebrow="Project creation"
        title="Create a project"
        description="Configure a deterministic local project. No files are written before confirmation."
      />
      <ol className="stepper" aria-label="Creation steps">
        {steps.map((label, index) => (
          <li key={label} data-active={index === step} data-complete={index < step}>
            <span>{index + 1}</span>
            {label}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="panel form-stack">
          <label className="field">
            <span>Project name</span>
            <input
              aria-label="Project name"
              autoFocus
              value={form.projectName}
              aria-invalid={Boolean(form.projectName && errors.projectName)}
              onChange={(event) => update('projectName', event.target.value)}
            />
            <small>
              {form.projectName ? errors.projectName : 'Use a lowercase npm-compatible name.'}
            </small>
          </label>
          <div className="field">
            <span>Parent destination directory</span>
            <div className="picker-row">
              <output aria-label="Selected project location">
                {form.destinationDirectory || 'No folder selected'}
              </output>
              <button onClick={chooseDirectory}>Choose folder</button>
            </div>
            <small className="error">{selectError ?? errors.destination}</small>
          </div>
          <p className="notice info">
            The final project path will be{' '}
            {form.destinationDirectory
              ? `${form.destinationDirectory} › ${form.projectName || 'project-name'}`
              : 'inside the selected folder'}
            .
          </p>
        </div>
      )}

      {step === 1 && (
        <div className="template-grid" aria-label="Choose a template">
          {BUILTIN_TEMPLATES.map((candidate) => (
            <button
              key={candidate.id}
              className="template-card"
              data-selected={candidate.id === form.templateId}
              aria-pressed={candidate.id === form.templateId}
              onClick={() => update('templateId', candidate.id)}
            >
              <span className="badge">{candidate.category}</span>
              <h3>{candidate.name}</h3>
              <p>{candidate.description}</p>
              <ul>
                {candidate.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
              <small>
                {candidate.difficulty} · {candidate.estimatedFileCount} files
              </small>
            </button>
          ))}
        </div>
      )}

      {step === 2 && (
        <div className="panel form-stack">
          <fieldset>
            <legend>Package manager</legend>
            <div className="segmented">
              {(['pnpm', 'npm', 'yarn', 'bun'] as const).map((manager) => (
                <label key={manager}>
                  <input
                    type="radio"
                    name="manager"
                    aria-label={manager === 'yarn' ? 'Yarn' : manager === 'bun' ? 'Bun' : manager}
                    checked={form.packageManager === manager}
                    onChange={() => update('packageManager', manager)}
                  />
                  <span>{manager}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="option-grid">
            <Option
              label="Initialize Git repository"
              description="Runs local git init only when Git is available."
              checked={form.initializeGit}
              onChange={(value) => update('initializeGit', value)}
            />
            <Option
              label="Add Docker configuration"
              description="Creates Dockerfile and .dockerignore without overwriting files."
              checked={form.addDocker}
              onChange={(value) => update('addDocker', value)}
            />
            <Option
              label="Add GitHub Actions CI"
              description="Creates a project-aware local workflow."
              checked={form.addGitHubActions}
              onChange={(value) => update('addGitHubActions', value)}
            />
          </div>
          {preferences.mode === 'advanced' && (
            <div className="advanced-box">
              <strong>Advanced preview</strong>
              <p>Scripts: dev, build, start, lint, typecheck</p>
              <p>
                Commands: {installCommand(form.packageManager)} · {devCommand(form.packageManager)}
              </p>
              <p>
                Generated plugins:{' '}
                {[form.addDocker && 'Docker', form.addGitHubActions && 'GitHub Actions']
                  .filter(Boolean)
                  .join(', ') || 'None'}
              </p>
            </div>
          )}
        </div>
      )}

      {step === 3 && (
        <div className="panel review-panel">
          <h2>Review project configuration</h2>
          <dl className="detail-grid">
            <Item label="Project" value={form.projectName.trim()} />
            <Item
              label="Final path"
              value={`${form.destinationDirectory} › ${form.projectName.trim()}`}
            />
            <Item label="Template" value={template.name} />
            <Item label="Package manager" value={form.packageManager} />
            <Item label="Git" value={enabled(form.initializeGit)} />
            <Item label="Docker" value={enabled(form.addDocker)} />
            <Item label="GitHub Actions" value={enabled(form.addGitHubActions)} />
            <Item
              label="Safety"
              value="Selected parent · exclusive file creation · no dependency install"
            />
          </dl>
          <div>
            <h3>Expected files and features</h3>
            <p>{template.features.join(' · ')}</p>
            <details>
              <summary>Preview {template.estimatedFileCount} generated files</summary>
              <ul className="file-list">
                {template.filePaths.map((file) => (
                  <li key={file}>
                    <code>{file}</code>
                  </li>
                ))}
              </ul>
            </details>
          </div>
          <p className="notice success">
            Ready for confirmation. No filesystem mutation has occurred.
          </p>
        </div>
      )}

      {step === 4 && (
        <div className="panel">
          {result ? (
            <Success result={result} onHome={onHome} onReset={reset} bridge={bridge} />
          ) : error ? (
            <ErrorState message={error} details={details} onBack={() => setStep(3)} />
          ) : (
            <>
              <h2>Creating {form.projectName}</h2>
              <p className="muted">
                Real operation states are reported by the local ForgeKi worker.
              </p>
              <ol className="progress-list">
                {progress.map((item) => (
                  <li key={item.step} data-state={item.state}>
                    <span className="status-dot" aria-hidden="true" />
                    <span>
                      <strong>{progressLabels[item.step]}</strong>
                      <small>{item.message}</small>
                    </span>
                    <span>{item.state}</span>
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      )}

      {step < 4 && (
        <div className="wizard-actions">
          <button
            disabled={step === 0}
            onClick={() => setStep((current) => Math.max(0, current - 1))}
          >
            Back
          </button>
          {step < 3 ? (
            <button
              className="primary"
              disabled={!canContinue}
              onClick={() => setStep((current) => current + 1)}
            >
              Continue
            </button>
          ) : (
            <button className="primary" onClick={() => void create()}>
              Confirm and create
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function PageHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <header className="page-heading">
      <p className="eyebrow">{eyebrow}</p>
      <h1 id="create-title">{title}</h1>
      <p>{description}</p>
    </header>
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
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="option">
      <span>
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
      <input
        type="checkbox"
        aria-label={label}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
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
function enabled(value: boolean) {
  return value ? 'Enabled' : 'Disabled';
}

function Success({
  result,
  onHome,
  onReset,
  bridge,
}: {
  result: DesktopCreateResult;
  onHome: () => void;
  onReset: () => void;
  bridge: DesktopBridge;
}) {
  return (
    <div className="result-state">
      <span className="result-icon success">✓</span>
      <p className="eyebrow">Project ready</p>
      <h2>{result.projectName} was created</h2>
      <p>{result.projectDirectory}</p>
      <p>
        {getBuiltinTemplate(result.templateId).name} · {result.packageManager}
      </p>
      {result.warnings.length > 0 && (
        <div className="notice warning">
          <strong>Created with warnings</strong>
          <ul>
            {result.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="next-steps">
        <code>{installCommand(result.packageManager)}</code>
        <code>{devCommand(result.packageManager)}</code>
      </div>
      <div className="button-row">
        <button
          className="primary"
          onClick={() => void bridge.openProjectFolder(result.projectDirectory)}
        >
          Open project folder
        </button>
        <button onClick={() => void bridge.copyProjectPath(result.projectDirectory)}>
          Copy project path
        </button>
        <button onClick={onHome}>Return Home</button>
        <button onClick={onReset}>Create another project</button>
      </div>
    </div>
  );
}
function ErrorState({
  message,
  details,
  onBack,
}: {
  message: string;
  details?: string;
  onBack: () => void;
}) {
  return (
    <div className="result-state">
      <span className="result-icon error">!</span>
      <p className="eyebrow">Creation stopped</p>
      <h2>Project could not be created</h2>
      <p role="alert">{message}</p>
      <p className="muted">Review the project location and settings, then try again.</p>
      {details && (
        <details>
          <summary>Sanitized technical details</summary>
          <pre>{details}</pre>
        </details>
      )}
      <button className="primary" onClick={onBack}>
        Review settings
      </button>
    </div>
  );
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
    return 'ForgeKi could not communicate with its local project service.';
  return 'An unexpected project creation error occurred.';
}
