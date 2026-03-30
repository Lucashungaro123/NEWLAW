#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::env;
use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::sync::Mutex;
use std::time::Duration;
use serde::Serialize;
use tauri::{Manager, State};

struct BackendProcess(Mutex<Option<Child>>);

#[derive(Serialize)]
struct HttpJsonResponse {
  status: u16,
  body: serde_json::Value,
}

fn find_project_root() -> Option<PathBuf> {
  let mut search_roots: Vec<PathBuf> = Vec::new();
  if let Ok(current_dir) = env::current_dir() {
    search_roots.push(current_dir);
  }
  if let Ok(current_exe) = env::current_exe() {
    if let Some(parent) = current_exe.parent() {
      search_roots.push(parent.to_path_buf());
    }
  }
  for root in search_roots {
    for ancestor in root.ancestors() {
      if ancestor.join("backend").join("main.py").exists() {
        return Some(ancestor.to_path_buf());
      }
    }
  }
  None
}

fn python_candidates(project_root: &Path) -> Vec<PathBuf> {
  let mut candidates: Vec<PathBuf> = Vec::new();
  if let Ok(explicit_path) = env::var("NEWLAW_PYTHON") {
    candidates.push(PathBuf::from(explicit_path));
  }
  candidates.push(project_root.join("backend").join(".venv312").join("bin").join("python"));
  candidates.push(project_root.join("backend").join(".venv312").join("Scripts").join("python.exe"));
  candidates.push(project_root.join("backend").join(".venv").join("bin").join("python"));
  candidates.push(project_root.join("backend").join(".venv").join("Scripts").join("python.exe"));
  candidates.push(PathBuf::from("/opt/homebrew/bin/python3.12"));
  candidates.push(PathBuf::from("python3"));
  candidates.push(PathBuf::from("python"));
  candidates
}

fn spawn_backend_process() -> Result<Child, String> {
  let project_root = find_project_root().ok_or_else(|| "Pasta do projeto não encontrada para iniciar o backend".to_string())?;
  let mut errors: Vec<String> = Vec::new();
  for python in python_candidates(&project_root) {
    let mut cmd = Command::new(&python);
    cmd.current_dir(&project_root);
    cmd
      .arg("-m")
      .arg("uvicorn")
      .arg("backend.main:app")
      .arg("--host")
      .arg("127.0.0.1")
      .arg("--port")
      .arg("8000");
    match cmd.spawn() {
      Ok(child) => return Ok(child),
      Err(error) => errors.push(format!("{}: {}", python.display(), error)),
    }
  }
  Err(format!("Erro ao iniciar backend: {}", errors.join(" | ")))
}

fn ensure_backend_running(state: &BackendProcess) -> Result<(), String> {
  let mut lock = state.0.lock().map_err(|e| e.to_string())?;
  if let Some(child) = lock.as_mut() {
    match child.try_wait() {
      Ok(None) => return Ok(()),
      Ok(Some(_)) => {
        *lock = None;
      }
      Err(error) => return Err(format!("Erro ao verificar backend: {error}")),
    }
  }
  let child = spawn_backend_process()?;
  *lock = Some(child);
  Ok(())
}

#[tauri::command]
async fn start_backend(state: State<'_, BackendProcess>) -> Result<(), String> {
  ensure_backend_running(state.inner())
}

#[tauri::command]
async fn remote_delete_with_auth(url: String, bearer_token: String) -> Result<HttpJsonResponse, String> {
  let client = reqwest::Client::builder()
    .timeout(Duration::from_secs(10))
    .build()
    .map_err(|error| format!("Erro ao preparar cliente HTTP: {error}"))?;
  let response = client
    .delete(url)
    .bearer_auth(bearer_token)
    .send()
    .await
    .map_err(|error| format!("Erro na requisição HTTP: {error}"))?;
  let status = response.status().as_u16();
  let body = response.json::<serde_json::Value>().await.unwrap_or_else(|_| serde_json::json!({}));
  Ok(HttpJsonResponse { status, body })
}

#[tauri::command]
async fn stop_backend(state: State<'_, BackendProcess>) -> Result<(), String> {
  if let Ok(mut lock) = state.0.lock() {
    if let Some(child) = lock.as_mut() {
      let _ = child.kill();
    }
    *lock = None;
  }
  Ok(())
}

fn main() {
  tauri::Builder::default()
    .plugin(tauri_plugin_updater::Builder::new().build())
    .manage(BackendProcess(Mutex::new(None)))
    .invoke_handler(tauri::generate_handler![start_backend, stop_backend, remote_delete_with_auth])
    .setup(|app| {
      if let Err(error) = ensure_backend_running(app.state::<BackendProcess>().inner()) {
        eprintln!("{error}");
      }
      if let Some(window) = app.get_webview_window("main") {
        let _ = window.maximize();
        let _ = window.set_focus();
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("failed to run app");
}
