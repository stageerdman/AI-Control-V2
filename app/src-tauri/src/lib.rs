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

/// Open an http(s) link in the default browser (the webview has no new-window handling).
#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    if !is_web_url(&url) {
        return Err("Only http(s) links open outside the app.".into());
    }
    std::process::Command::new("/usr/bin/open").arg(&url).spawn().map(|_| ()).map_err(|e| e.to_string())
}

fn is_web_url(u: &str) -> bool {
    (u.starts_with("http://") || u.starts_with("https://")) && !u.chars().any(|c| c.is_whitespace() || c.is_control())
}

pub fn run() {
    let backend = Arc::new(Backend::from_env());
    backend.supervise();
    tauri::Builder::default()
        .manage(backend)
        .invoke_handler(tauri::generate_handler![backend_start, open_url])
        .build(tauri::generate_context!())
        .expect("error while building AI Studio")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                app.state::<Arc<Backend>>().stop();
            }
        });
}

#[cfg(test)]
mod tests {
    #[test]
    fn only_web_links_open_outside() {
        assert!(super::is_web_url("http://localhost:3000"));
        assert!(super::is_web_url("https://stripe.com/docs"));
        assert!(!super::is_web_url("file:///etc/passwd"));
        assert!(!super::is_web_url("-a Calculator"));
        assert!(!super::is_web_url("https://x.com\n-a"));
    }
}
