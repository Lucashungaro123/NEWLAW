#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::{Manager, State};

struct BackendProcess(Mutex<Option<Child>>);

#[tauri::command]
async fn start_backend(state: State<'_, BackendProcess>) -> Result<(), String> {
  // Start FastAPI locally. In produção empacote Python + venv.
  let mut cmd = Command::new("python");
  cmd.arg("-m").arg("backend.main");
  let child = cmd
    .spawn()
    .map_err(|e| format!("Erro ao iniciar backend: {e}"))?;
  let mut lock = state.0.lock().map_err(|e| e.to_string())?;
  *lock = Some(child);
  Ok(())
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
    .manage(BackendProcess(Mutex::new(None)))
    .invoke_handler(tauri::generate_handler![start_backend, stop_backend])
    .setup(|app| {
      if let Some(window) = app.get_webview_window("main") {
        let _ = window.maximize();
        let _ = window.set_focus();
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("failed to run app");
}
