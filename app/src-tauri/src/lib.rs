//! AI Studio desktop shell: one window, one command, and the backend's lifecycle.

mod backend;

use std::sync::Arc;
use backend::{Backend, Started};
use tauri::{Manager, RunEvent};

/// Start (or reuse) the local server and return its `/health` body. Also used by Retry.
#[tauri::command]
async fn backend_start(state: tauri::State<'_, Arc<Backend>>) -> Result<Started, String> {
    let backend = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || backend.ensure_running())
        .await
        .map_err(|e| e.to_string())?
}

pub fn run() {
    let backend = Arc::new(Backend::from_env());
    backend.supervise();
    tauri::Builder::default()
        .manage(backend)
        .invoke_handler(tauri::generate_handler![backend_start])
        .build(tauri::generate_context!())
        .expect("error while building AI Studio")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                app.state::<Arc<Backend>>().stop();
            }
        });
}
