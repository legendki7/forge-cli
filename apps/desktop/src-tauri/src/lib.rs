use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    fs,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Mutex,
    },
};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_shell::{process::CommandEvent, ShellExt};

const MAX_WORKER_OUTPUT: usize = 1_048_576;
const MAX_STATE_SIZE: usize = 262_144;

#[derive(Default)]
struct DesktopState {
    operating: AtomicBool,
    next_operation: AtomicU64,
    allowed_projects: Mutex<Vec<PathBuf>>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CreateRequest {
    project_name: String,
    destination_directory: String,
    framework: String,
    #[serde(default = "default_template_id")]
    template_id: String,
    package_manager: String,
    initialize_git: bool,
    add_docker: bool,
    #[serde(rename = "addGitHubActions")]
    add_github_actions: bool,
    #[serde(default)]
    stack: Option<Value>,
    #[serde(default)]
    generation_plan: Option<Value>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct StackPlanRequest {
    project_name: String,
    destination_directory: String,
    stack: Value,
    #[serde(default)]
    template_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PluginRequest {
    project_directory: String,
    plugin_id: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProgressEvent {
    operation_id: String,
    step: String,
    state: String,
    message: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct CreateResult {
    project_name: String,
    project_directory: String,
    framework: String,
    template_id: String,
    package_manager: String,
    initialized_features: Vec<String>,
    warnings: Vec<String>,
    #[serde(default)]
    generation_plan: Option<Value>,
}

#[derive(Debug, Deserialize)]
struct WorkerError {
    code: String,
    message: String,
    details: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", content = "payload", rename_all = "lowercase")]
enum WorkerMessage {
    Progress(ProgressEvent),
    Result(CreateResult),
    #[serde(rename = "operation-result")]
    OperationResult(Value),
    Error(WorkerError),
}

enum WorkerOutput {
    Create(CreateResult),
    Operation(Value),
}

#[tauri::command]
fn select_destination(app: AppHandle, state: State<'_, DesktopState>) -> Option<String> {
    let selection = app.dialog().file().blocking_pick_folder()?;
    let selected = PathBuf::from(selection.to_string());
    if let Ok(canonical) = selected.canonicalize() {
        if canonical.is_dir() {
            let _ = remember_allowed(&state, canonical);
        }
    }
    Some(selection.to_string())
}

#[tauri::command]
async fn create_project(
    app: AppHandle,
    state: State<'_, DesktopState>,
    request: CreateRequest,
) -> Result<CreateResult, String> {
    begin_operation(&state)?;
    let result = create_project_inner(&app, &state, &request).await;
    state.operating.store(false, Ordering::Release);
    result
}

async fn create_project_inner(
    app: &AppHandle,
    state: &DesktopState,
    request: &CreateRequest,
) -> Result<CreateResult, String> {
    validate_create_request(request)?;
    let parent = canonical_directory(&request.destination_directory)?;
    ensure_allowed(state, &parent)?;
    let output = run_worker(
        app,
        state,
        "create",
        serde_json::to_value(request).map_err(|_| "The project request could not be encoded.")?,
        true,
    )
    .await?;
    let WorkerOutput::Create(result) = output else {
        return Err("The ForgeKi worker returned an invalid creation response.".into());
    };
    verify_worker_destination(&parent, request, &result)?;
    let created = canonical_directory(&result.project_directory)?;
    remember_allowed(state, created)?;
    Ok(result)
}

#[tauri::command]
async fn plan_stack(
    app: AppHandle,
    state: State<'_, DesktopState>,
    request: StackPlanRequest,
) -> Result<Value, String> {
    validate_stack_plan_request(&request)?;
    let parent = canonical_directory(&request.destination_directory)?;
    ensure_allowed(&state, &parent)?;
    run_typed_operation(
        &app,
        &state,
        "plan-stack",
        serde_json::to_value(request).map_err(|_| "The stack request could not be encoded.")?,
    )
    .await
}

#[tauri::command]
async fn scan_project(
    app: AppHandle,
    state: State<'_, DesktopState>,
    path: String,
) -> Result<Value, String> {
    let directory = verified_project(&state, &path)?;
    run_typed_operation(
        &app,
        &state,
        "scan",
        serde_json::json!({ "projectDirectory": directory }),
    )
    .await
}

#[tauri::command]
async fn inspect_builtin_plugins(
    app: AppHandle,
    state: State<'_, DesktopState>,
    path: Option<String>,
) -> Result<Value, String> {
    let directory = match path {
        Some(value) => Some(verified_project(&state, &value)?),
        None => None,
    };
    let request = directory
        .map(|value| serde_json::json!({ "projectDirectory": value }))
        .unwrap_or_else(|| serde_json::json!({}));
    run_typed_operation(&app, &state, "inspect-plugins", request).await
}

#[tauri::command]
async fn apply_builtin_plugin(
    app: AppHandle,
    state: State<'_, DesktopState>,
    request: PluginRequest,
) -> Result<Value, String> {
    if !matches!(request.plugin_id.as_str(), "docker" | "github-actions") {
        return Err("Only trusted built-in plugins can be applied.".into());
    }
    let directory = verified_project(&state, &request.project_directory)?;
    run_typed_operation(
        &app,
        &state,
        "apply-plugin",
        serde_json::json!({
            "projectDirectory": directory,
            "pluginId": request.plugin_id,
        }),
    )
    .await
}

#[tauri::command]
async fn list_marketplace_plugins(
    app: AppHandle,
    state: State<'_, DesktopState>,
) -> Result<Value, String> {
    run_typed_operation(&app, &state, "plugins-catalog", serde_json::json!({})).await
}

#[tauri::command]
async fn validate_community_plugin(
    app: AppHandle,
    state: State<'_, DesktopState>,
    path: String,
) -> Result<Value, String> {
    let directory = verified_project(&state, &path)?;
    run_typed_operation(
        &app,
        &state,
        "plugin-validate",
        serde_json::json!({ "sourceDirectory": directory }),
    )
    .await
}

#[tauri::command]
async fn install_community_plugin(
    app: AppHandle,
    state: State<'_, DesktopState>,
    path: String,
) -> Result<Value, String> {
    let directory = verified_project(&state, &path)?;
    run_typed_operation(
        &app,
        &state,
        "plugin-install",
        serde_json::json!({ "sourceDirectory": directory }),
    )
    .await
}

#[tauri::command]
async fn install_bundled_plugin(
    app: AppHandle,
    state: State<'_, DesktopState>,
    id: String,
) -> Result<Value, String> {
    validate_plugin_id(&id)?;
    run_typed_operation(
        &app,
        &state,
        "plugin-install-bundled",
        serde_json::json!({ "pluginId": id }),
    )
    .await
}

#[tauri::command]
async fn remove_community_plugin(
    app: AppHandle,
    state: State<'_, DesktopState>,
    id: String,
) -> Result<Value, String> {
    validate_plugin_id(&id)?;
    run_typed_operation(
        &app,
        &state,
        "plugin-remove",
        serde_json::json!({ "pluginId": id }),
    )
    .await
}

#[tauri::command]
async fn create_plugin_project(
    app: AppHandle,
    state: State<'_, DesktopState>,
    parent: String,
    name: String,
) -> Result<Value, String> {
    let directory = verified_project(&state, &parent)?;
    if name.trim().is_empty()
        || name.len() > 100
        || name.chars().any(|character| character.is_control())
    {
        return Err("The plugin project name is invalid.".into());
    }
    run_typed_operation(
        &app,
        &state,
        "plugin-create",
        serde_json::json!({ "parent": directory, "name": name }),
    )
    .await
}

#[tauri::command]
async fn check_developer_tools(
    app: AppHandle,
    state: State<'_, DesktopState>,
) -> Result<Value, String> {
    run_typed_operation(&app, &state, "check-tools", serde_json::json!({})).await
}

async fn run_typed_operation(
    app: &AppHandle,
    state: &DesktopState,
    operation: &str,
    request: Value,
) -> Result<Value, String> {
    begin_operation(state)?;
    let result = run_worker(app, state, operation, request, false).await;
    state.operating.store(false, Ordering::Release);
    match result? {
        WorkerOutput::Operation(value) => Ok(value),
        WorkerOutput::Create(_) => Err("The ForgeKi worker returned an invalid response.".into()),
    }
}

async fn run_worker(
    app: &AppHandle,
    state: &DesktopState,
    operation: &str,
    request: Value,
    emit_progress: bool,
) -> Result<WorkerOutput, String> {
    let operation_id = format!(
        "desktop-{}",
        state.next_operation.fetch_add(1, Ordering::Relaxed) + 1
    );
    let input = serde_json::to_string(&serde_json::json!({
        "operationId": operation_id,
        "operation": operation,
        "request": request,
    }))
    .map_err(|_| "The desktop request could not be encoded.".to_string())?;
    let sidecar = app
        .shell()
        .sidecar("forgeki-worker")
        .map_err(|_| "The bundled ForgeKi worker is unavailable.".to_string())?;
    let (mut events, mut child) = sidecar
        .spawn()
        .map_err(|_| "The bundled ForgeKi worker could not be started.".to_string())?;
    child
        .write(format!("{input}\n").as_bytes())
        .map_err(|_| "ForgeKi could not send the request to its worker.".to_string())?;

    let mut stdout = String::new();
    let mut stderr = String::new();
    while let Some(event) = events.recv().await {
        match event {
            CommandEvent::Stdout(bytes) => {
                if stdout.len() + bytes.len() > MAX_WORKER_OUTPUT {
                    return Err("The ForgeKi worker returned too much output.".into());
                }
                stdout.push_str(&String::from_utf8_lossy(&bytes));
                while let Some(index) = stdout.find('\n') {
                    let line = stdout[..index].trim().to_string();
                    stdout.drain(..=index);
                    if line.is_empty() {
                        continue;
                    }
                    match serde_json::from_str::<WorkerMessage>(&line) {
                        Ok(WorkerMessage::Progress(progress)) if emit_progress => {
                            app.emit("forgeki://creation-progress", progress)
                                .map_err(|_| {
                                    "ForgeKi could not update creation progress.".to_string()
                                })?;
                        }
                        Ok(WorkerMessage::Progress(_)) => {}
                        Ok(WorkerMessage::Result(result)) => {
                            return Ok(WorkerOutput::Create(result))
                        }
                        Ok(WorkerMessage::OperationResult(result)) => {
                            return Ok(WorkerOutput::Operation(result))
                        }
                        Ok(WorkerMessage::Error(error)) => return Err(worker_error(error)),
                        Err(_) => {
                            return Err("The ForgeKi worker returned an invalid response.".into())
                        }
                    }
                }
            }
            CommandEvent::Stderr(bytes) => {
                stderr.push_str(&String::from_utf8_lossy(&bytes));
                if stderr.len() > 1000 {
                    stderr.truncate(1000);
                }
            }
            CommandEvent::Error(_) => {
                return Err("The ForgeKi worker encountered a communication error.".into())
            }
            CommandEvent::Terminated(_) => break,
            _ => {}
        }
    }
    let details = sanitize(&stderr);
    if details.is_empty() {
        Err("The ForgeKi worker stopped before the operation completed.".into())
    } else {
        Err(format!(
            "The ForgeKi worker stopped unexpectedly: {details}"
        ))
    }
}

#[tauri::command]
fn load_desktop_state(app: AppHandle) -> Result<Value, String> {
    let path = desktop_state_path(&app)?;
    if !path.exists() {
        return Ok(Value::Null);
    }
    let contents = fs::read_to_string(path)
        .map_err(|_| "ForgeKi preferences could not be read.".to_string())?;
    if contents.len() > MAX_STATE_SIZE {
        return Ok(Value::Null);
    }
    Ok(serde_json::from_str(&contents).unwrap_or(Value::Null))
}

#[tauri::command]
fn save_desktop_state(app: AppHandle, state: Value) -> Result<(), String> {
    validate_persisted_state(&state)?;
    let path = desktop_state_path(&app)?;
    let parent = path
        .parent()
        .ok_or_else(|| "The ForgeKi data directory is unavailable.".to_string())?;
    fs::create_dir_all(parent)
        .map_err(|_| "The ForgeKi data directory could not be created.".to_string())?;
    let encoded = serde_json::to_vec_pretty(&state)
        .map_err(|_| "ForgeKi preferences could not be encoded.".to_string())?;
    let temporary = path.with_extension("json.tmp");
    fs::write(&temporary, encoded)
        .map_err(|_| "ForgeKi preferences could not be saved.".to_string())?;
    if path.exists() {
        fs::remove_file(&path)
            .map_err(|_| "Existing ForgeKi preferences could not be replaced.".to_string())?;
    }
    fs::rename(temporary, path)
        .map_err(|_| "ForgeKi preferences could not be finalized.".to_string())
}

#[tauri::command]
fn open_project_folder(state: State<'_, DesktopState>, path: String) -> Result<(), String> {
    let verified = verified_project(&state, &path)?;
    open::that_detached(verified).map_err(|_| "The project folder could not be opened.".to_string())
}

#[tauri::command]
fn copy_project_path(
    app: AppHandle,
    state: State<'_, DesktopState>,
    path: String,
) -> Result<(), String> {
    let verified = verified_project(&state, &path)?;
    app.clipboard()
        .write_text(verified.to_string_lossy().into_owned())
        .map_err(|_| "The project path could not be copied.".to_string())
}

fn begin_operation(state: &DesktopState) -> Result<(), String> {
    state
        .operating
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .map(|_| ())
        .map_err(|_| "Another ForgeKi operation is already running.".into())
}

fn validate_create_request(request: &CreateRequest) -> Result<(), String> {
    if request.project_name.trim().is_empty()
        || request
            .project_name
            .chars()
            .any(|character| matches!(character, '/' | '\\' | '\0'))
    {
        return Err("The project name is invalid.".into());
    }
    if !matches!(
        request.framework.as_str(),
        "nextjs" | "react-vite" | "express"
    ) {
        return Err("The selected built-in framework is invalid.".into());
    }
    if (request.framework == "nextjs"
        && !matches!(
            request.template_id.as_str(),
            "nextjs-blank"
                | "nextjs-dashboard"
                | "nextjs-blog"
                | "nextjs-portfolio"
                | "nextjs-landing"
        ))
        || (request.framework != "nextjs" && request.template_id != request.framework)
    {
        return Err("The selected built-in template is invalid.".into());
    }
    if !matches!(
        request.package_manager.as_str(),
        "pnpm" | "npm" | "yarn" | "bun"
    ) {
        return Err("The package manager is invalid.".into());
    }
    let parent = Path::new(&request.destination_directory);
    if !parent.is_absolute() || request.destination_directory.contains('\0') {
        return Err("A selected absolute destination is required.".into());
    }
    if let Some(stack) = &request.stack {
        validate_stack_value(stack, &request.framework)?;
    } else if request.framework != "nextjs" {
        return Err("React/Vite and Express creation require a validated stack.".into());
    }
    if request.generation_plan.is_some() && request.stack.is_none() {
        return Err("A generation plan requires a validated stack.".into());
    }
    Ok(())
}

fn validate_stack_plan_request(request: &StackPlanRequest) -> Result<(), String> {
    if request.project_name.trim().is_empty()
        || request
            .project_name
            .chars()
            .any(|character| matches!(character, '/' | '\\' | '\0'))
    {
        return Err("The project name is invalid.".into());
    }
    let framework = request
        .stack
        .get("framework")
        .and_then(Value::as_str)
        .ok_or_else(|| "The stack framework is invalid.".to_string())?;
    validate_stack_value(&request.stack, framework)?;
    let parent = Path::new(&request.destination_directory);
    if !parent.is_absolute() || request.destination_directory.contains('\0') {
        return Err("A selected absolute destination is required.".into());
    }
    Ok(())
}

fn validate_stack_value(stack: &Value, framework: &str) -> Result<(), String> {
    const COMPONENTS: &[&str] = &[
        "nextjs",
        "react-vite",
        "express",
        "typescript",
        "plain-css",
        "tailwind",
        "postgres",
        "sqlite",
        "prisma",
        "drizzle",
        "vitest",
        "playwright",
        "git",
        "docker",
        "github-actions",
        "node",
    ];
    let object = stack
        .as_object()
        .ok_or_else(|| "The stack definition is invalid.".to_string())?;
    if object.keys().any(|key| {
        !matches!(
            key.as_str(),
            "framework"
                | "components"
                | "packageManager"
                | "initializeGit"
                | "addDocker"
                | "addGitHubActions"
                | "templateId"
                | "pluginComponents"
        )
    }) || object.get("framework").and_then(Value::as_str) != Some(framework)
        || !matches!(framework, "nextjs" | "react-vite" | "express")
    {
        return Err("The stack definition is invalid.".into());
    }
    let components = object
        .get("components")
        .and_then(Value::as_array)
        .ok_or_else(|| "The stack components are invalid.".to_string())?;
    if components.len() > 30
        || components.iter().any(|component| {
            component
                .as_str()
                .is_none_or(|id| !COMPONENTS.contains(&id))
        })
    {
        return Err("Only trusted built-in stack components are allowed.".into());
    }
    if let Some(plugin_components) = object.get("pluginComponents") {
        let values = plugin_components
            .as_array()
            .ok_or_else(|| "Plugin components are invalid.".to_string())?;
        if values.len() > 30
            || values.iter().any(|component| {
                component.as_str().is_none_or(|id| {
                    id.len() > 128
                        || id.contains("..")
                        || !id.chars().all(|character| {
                            character.is_ascii_lowercase()
                                || character.is_ascii_digit()
                                || matches!(character, '-' | '_' | '.')
                        })
                })
            })
        {
            return Err("Plugin component identifiers are invalid.".into());
        }
    }
    Ok(())
}

fn verify_worker_destination(
    parent: &Path,
    request: &CreateRequest,
    result: &CreateResult,
) -> Result<(), String> {
    let expected = parent
        .join(request.project_name.trim())
        .canonicalize()
        .map_err(|_| "The generated project could not be verified.".to_string())?;
    let reported = PathBuf::from(&result.project_directory)
        .canonicalize()
        .map_err(|_| "The generated project could not be verified.".to_string())?;
    if reported != expected || result.template_id != request.template_id {
        return Err("The project worker returned an unexpected destination or template.".into());
    }
    Ok(())
}

fn canonical_directory(value: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(value);
    if !path.is_absolute() || value.contains('\0') {
        return Err("A selected absolute project directory is required.".into());
    }
    let canonical = path
        .canonicalize()
        .map_err(|_| "The selected directory does not exist or cannot be accessed.".to_string())?;
    if !canonical.is_dir() {
        return Err("The selected path is not a directory.".into());
    }
    Ok(canonical)
}

fn remember_allowed(state: &DesktopState, path: PathBuf) -> Result<(), String> {
    let mut allowed = state
        .allowed_projects
        .lock()
        .map_err(|_| "Desktop state is unavailable.".to_string())?;
    if !allowed.contains(&path) {
        allowed.push(path);
        if allowed.len() > 50 {
            allowed.remove(0);
        }
    }
    Ok(())
}

fn ensure_allowed(state: &DesktopState, canonical: &Path) -> Result<(), String> {
    let allowed = state
        .allowed_projects
        .lock()
        .map_err(|_| "Desktop state is unavailable.".to_string())?;
    if allowed.iter().any(|candidate| candidate == canonical) {
        Ok(())
    } else {
        Err("ForgeKi can only access a directory selected in the native folder picker.".into())
    }
}

fn verified_project(state: &DesktopState, requested: &str) -> Result<PathBuf, String> {
    let canonical = canonical_directory(requested)?;
    ensure_allowed(state, &canonical)?;
    Ok(canonical)
}

fn desktop_state_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|directory| directory.join("desktop-state.json"))
        .map_err(|_| "The ForgeKi application data directory is unavailable.".into())
}

fn validate_persisted_state(state: &Value) -> Result<(), String> {
    let encoded =
        serde_json::to_vec(state).map_err(|_| "ForgeKi preferences are invalid.".to_string())?;
    if encoded.len() > MAX_STATE_SIZE {
        return Err("ForgeKi preferences exceed the local storage limit.".into());
    }
    let object = state
        .as_object()
        .ok_or_else(|| "ForgeKi preferences must be an object.".to_string())?;
    if object.keys().any(|key| {
        !matches!(
            key.as_str(),
            "schemaVersion"
                | "preferences"
                | "recentProjects"
                | "activity"
                | "customStackPresets"
                | "lastStack"
        )
    }) || object.get("schemaVersion").and_then(Value::as_u64) != Some(2)
    {
        return Err("ForgeKi preferences use an unsupported schema.".into());
    }
    reject_sensitive_keys(state)
}

fn reject_sensitive_keys(value: &Value) -> Result<(), String> {
    match value {
        Value::Object(object) => {
            for (key, child) in object {
                let normalized = key.to_ascii_lowercase();
                if [
                    "token",
                    "secret",
                    "credential",
                    "password",
                    "environment",
                    "npmrc",
                ]
                .iter()
                .any(|blocked| normalized.contains(blocked))
                {
                    return Err("Sensitive values cannot be persisted by ForgeKi.".into());
                }
                reject_sensitive_keys(child)?;
            }
        }
        Value::Array(values) => {
            for child in values {
                reject_sensitive_keys(child)?;
            }
        }
        Value::String(text) if text.len() > 2000 => {
            return Err("A persisted ForgeKi value is too large.".into())
        }
        _ => {}
    }
    Ok(())
}

fn worker_error(error: WorkerError) -> String {
    let details = error.details.unwrap_or_default();
    if details.is_empty() {
        format!("{}: {}", error.code, error.message)
    } else {
        format!("{}: {} ({})", error.code, error.message, sanitize(&details))
    }
}

fn sanitize(value: &str) -> String {
    value
        .lines()
        .next()
        .unwrap_or_default()
        .chars()
        .take(500)
        .collect()
}

fn default_template_id() -> String {
    "nextjs-blank".into()
}

fn validate_plugin_id(id: &str) -> Result<(), String> {
    let segments = id.split('.').collect::<Vec<_>>();
    let valid_segment = |segment: &&str| {
        !segment.is_empty()
            && segment.len() <= 64
            && segment.chars().all(|character| {
                character.is_ascii_lowercase() || character.is_ascii_digit() || character == '-'
            })
            && segment.chars().next().is_some_and(|character| {
                character.is_ascii_lowercase() || character.is_ascii_digit()
            })
            && segment.chars().last().is_some_and(|character| {
                character.is_ascii_lowercase() || character.is_ascii_digit()
            })
    };
    let valid = id.len() <= 128 && segments.len() == 2 && segments.iter().all(valid_segment);
    if valid {
        Ok(())
    } else {
        Err("The plugin id is invalid.".into())
    }
}

#[cfg(test)]
mod tests {
    use super::{
        validate_create_request, validate_persisted_state, validate_plugin_id, CreateRequest,
    };

    #[test]
    fn accepts_the_desktop_template_and_github_actions_wire_names() {
        let request: CreateRequest = serde_json::from_value(serde_json::json!({
            "projectName": "native-smoke-test",
            "destinationDirectory": "C:\\tmp",
            "framework": "nextjs",
            "templateId": "nextjs-dashboard",
            "packageManager": "pnpm",
            "initializeGit": false,
            "addDocker": true,
            "addGitHubActions": true
        }))
        .expect("desktop request should deserialize");
        assert!(request.add_github_actions);
        assert_eq!(request.template_id, "nextjs-dashboard");
        validate_create_request(&request).expect("request should be valid");
    }

    #[test]
    fn rejects_arbitrary_templates() {
        let request = CreateRequest {
            project_name: "app".into(),
            destination_directory: "C:\\tmp".into(),
            framework: "nextjs".into(),
            template_id: "remote-package".into(),
            package_manager: "pnpm".into(),
            initialize_git: false,
            add_docker: false,
            add_github_actions: false,
            stack: None,
            generation_plan: None,
        };
        assert!(validate_create_request(&request).is_err());
    }

    #[test]
    fn persistence_rejects_sensitive_keys() {
        let value = serde_json::json!({
            "schemaVersion": 2,
            "preferences": { "token": "not-allowed" },
            "recentProjects": [],
            "activity": []
        });
        assert!(validate_persisted_state(&value).is_err());
    }

    #[test]
    fn accepts_namespaced_plugin_ids_and_rejects_path_like_or_empty_segments() {
        assert!(validate_plugin_id("community.editorconfig").is_ok());
        for id in [
            "docker",
            ".docker",
            "docker.",
            "community/evil",
            "community..evil",
        ] {
            assert!(validate_plugin_id(id).is_err(), "{id} should be rejected");
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(DesktopState::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![
            select_destination,
            create_project,
            plan_stack,
            scan_project,
            inspect_builtin_plugins,
            apply_builtin_plugin,
            list_marketplace_plugins,
            validate_community_plugin,
            install_community_plugin,
            install_bundled_plugin,
            remove_community_plugin,
            create_plugin_project,
            check_developer_tools,
            load_desktop_state,
            save_desktop_state,
            open_project_folder,
            copy_project_path
        ])
        .run(tauri::generate_context!())
        .expect("error while running ForgeKi Desktop");
}
