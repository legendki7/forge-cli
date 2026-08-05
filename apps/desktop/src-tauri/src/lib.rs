use serde::{Deserialize, Serialize};
use std::{
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

#[derive(Default)]
struct DesktopState {
    creating: AtomicBool,
    next_operation: AtomicU64,
    last_project: Mutex<Option<PathBuf>>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CreateRequest {
    project_name: String,
    destination_directory: String,
    framework: String,
    package_manager: String,
    initialize_git: bool,
    add_docker: bool,
    add_github_actions: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkerEnvelope<'a> {
    operation_id: String,
    request: &'a CreateRequest,
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
    package_manager: String,
    initialized_features: Vec<String>,
    warnings: Vec<String>,
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
    Error(WorkerError),
}

#[tauri::command]
fn select_destination(app: AppHandle) -> Option<String> {
    app.dialog()
        .file()
        .blocking_pick_folder()
        .map(|selection| selection.to_string())
}

#[tauri::command]
async fn create_project(
    app: AppHandle,
    state: State<'_, DesktopState>,
    request: CreateRequest,
) -> Result<CreateResult, String> {
    if state
        .creating
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .is_err()
    {
        return Err("A project creation operation is already running.".into());
    }

    let result = create_project_inner(&app, &state, &request).await;
    state.creating.store(false, Ordering::Release);
    result
}

async fn create_project_inner(
    app: &AppHandle,
    state: &DesktopState,
    request: &CreateRequest,
) -> Result<CreateResult, String> {
    validate_boundary(request)?;
    let parent = PathBuf::from(&request.destination_directory)
        .canonicalize()
        .map_err(|_| "The selected destination does not exist or cannot be accessed.".to_string())?;
    if !parent.is_dir() {
        return Err("The selected destination is not a directory.".into());
    }

    let operation_id = format!(
        "desktop-{}",
        state.next_operation.fetch_add(1, Ordering::Relaxed) + 1
    );
    let envelope = WorkerEnvelope {
        operation_id,
        request,
    };
    let input = serde_json::to_string(&envelope)
        .map_err(|_| "The project creation request could not be encoded.".to_string())?;
    let sidecar = app
        .shell()
        .sidecar("forgeki-worker")
        .map_err(|_| "The bundled ForgeKi project worker is unavailable.".to_string())?;
    let (mut events, mut child) = sidecar
        .spawn()
        .map_err(|_| "The bundled ForgeKi project worker could not be started.".to_string())?;
    child
        .write(format!("{input}\n").as_bytes())
        .map_err(|_| "ForgeKi could not send the project request to its worker.".to_string())?;

    let mut stdout = String::new();
    let mut stderr = String::new();
    while let Some(event) = events.recv().await {
        match event {
            CommandEvent::Stdout(bytes) => {
                stdout.push_str(&String::from_utf8_lossy(&bytes));
                while let Some(index) = stdout.find('\n') {
                    let line = stdout[..index].trim().to_string();
                    stdout.drain(..=index);
                    if line.is_empty() {
                        continue;
                    }
                    match serde_json::from_str::<WorkerMessage>(&line) {
                        Ok(WorkerMessage::Progress(progress)) => {
                            app.emit("forgeki://creation-progress", progress)
                                .map_err(|_| "ForgeKi could not update creation progress.".to_string())?;
                        }
                        Ok(WorkerMessage::Result(result)) => {
                            verify_worker_destination(&parent, request, &result)?;
                            let canonical = PathBuf::from(&result.project_directory)
                                .canonicalize()
                                .map_err(|_| "The generated project could not be verified.".to_string())?;
                            *state.last_project.lock().map_err(|_| "Desktop state is unavailable.")? =
                                Some(canonical);
                            return Ok(result);
                        }
                        Ok(WorkerMessage::Error(error)) => {
                            let details = error.details.unwrap_or_default();
                            return Err(if details.is_empty() {
                                format!("{}: {}", error.code, error.message)
                            } else {
                                format!("{}: {} ({})", error.code, error.message, sanitize(&details))
                            });
                        }
                        Err(_) => return Err("The ForgeKi worker returned an invalid response.".into()),
                    }
                }
            }
            CommandEvent::Stderr(bytes) => {
                stderr.push_str(&String::from_utf8_lossy(&bytes));
                if stderr.len() > 1000 {
                    stderr.truncate(1000);
                }
            }
            CommandEvent::Error(_) => return Err("The ForgeKi worker encountered a communication error.".into()),
            CommandEvent::Terminated(_) => break,
            _ => {}
        }
    }
    let details = sanitize(&stderr);
    if details.is_empty() {
        Err("The ForgeKi worker stopped before project creation completed.".into())
    } else {
        Err(format!("The ForgeKi worker stopped unexpectedly: {details}"))
    }
}

#[tauri::command]
fn open_project_folder(state: State<'_, DesktopState>, path: String) -> Result<(), String> {
    let verified = verify_last_project(&state, &path)?;
    open::that_detached(verified).map_err(|_| "The project folder could not be opened.".to_string())
}

#[tauri::command]
fn copy_project_path(
    app: AppHandle,
    state: State<'_, DesktopState>,
    path: String,
) -> Result<(), String> {
    let verified = verify_last_project(&state, &path)?;
    app.clipboard()
        .write_text(verified.to_string_lossy().into_owned())
        .map_err(|_| "The project path could not be copied.".to_string())
}

fn validate_boundary(request: &CreateRequest) -> Result<(), String> {
    if request.project_name.trim().is_empty()
        || request
            .project_name
            .chars()
            .any(|character| matches!(character, '/' | '\\' | '\0'))
    {
        return Err("The project name is invalid.".into());
    }
    if request.framework != "nextjs" {
        return Err("Only Next.js is supported.".into());
    }
    if !matches!(request.package_manager.as_str(), "pnpm" | "npm" | "yarn" | "bun") {
        return Err("The package manager is invalid.".into());
    }
    let parent = Path::new(&request.destination_directory);
    if !parent.is_absolute() || request.destination_directory.contains('\0') {
        return Err("A selected absolute destination is required.".into());
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
    if reported != expected {
        return Err("The project worker returned an unexpected destination.".into());
    }
    Ok(())
}

fn verify_last_project(state: &DesktopState, requested: &str) -> Result<PathBuf, String> {
    let canonical = PathBuf::from(requested)
        .canonicalize()
        .map_err(|_| "The project folder no longer exists.".to_string())?;
    let last = state
        .last_project
        .lock()
        .map_err(|_| "Desktop state is unavailable.".to_string())?;
    if last.as_ref() != Some(&canonical) {
        return Err("Only the project created by the current operation can be opened or copied.".into());
    }
    Ok(canonical)
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
            open_project_folder,
            copy_project_path
        ])
        .run(tauri::generate_context!())
        .expect("error while running ForgeKi Desktop");
}
