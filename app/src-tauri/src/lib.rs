//! AI Studio desktop shell: one window, a menu bar icon, one command, and the backend's lifecycle.
//! Closing the window hides it (agents keep working); only Quit stops the studio.

mod backend;
mod quit;
mod tray;

use std::sync::Arc;
use backend::{Backend, Started};
use quit::Quit;
use tauri::{AppHandle, Emitter, Manager, RunEvent, WindowEvent};

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

/// The single quit. The first call stops the server off the UI thread, showing the calm line in
/// the window if that takes longer than a moment; later calls do nothing new.
fn begin_quit(app: &AppHandle) {
    if !app.state::<Quit>().begin() {
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        let backend = Arc::clone(&app.state::<Arc<Backend>>());
        quit::run(
            move || backend.stop(),
            quit::SHOW_LINE_AFTER,
            || {
                tray::show_main(&app);
                let _ = app.emit(quit::STOPPING_EVENT, ());
            },
            || app.exit(0),
        );
    });
}

fn on_run_event(app: &AppHandle, event: RunEvent) {
    match event {
        // `code` is Some only for our own `app.exit` once stopping is done: let that one through.
        RunEvent::ExitRequested { code: None, api, .. } => {
            api.prevent_exit();
            begin_quit(app);
        }
        RunEvent::Reopen { .. } if !app.state::<Quit>().in_progress() => tray::show_main(app),
        // Backstop for an exit that skipped the quit (e.g. a panic path): never leave the server.
        RunEvent::Exit => app.state::<Arc<Backend>>().stop(),
        _ => {}
    }
}

pub fn run() {
    let backend = Arc::new(Backend::from_env());
    backend.supervise();
    tauri::Builder::default()
        .manage(backend)
        .manage(Quit::default())
        .invoke_handler(tauri::generate_handler![backend_start, open_url])
        .setup(|app| Ok(tray::install(app.handle(), begin_quit)?))
        .on_window_event(|window, event| {
            // The red cross, ⌘W and the app menu's Close Window hide; only Quit stops the studio.
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building AI Studio")
        .run(on_run_event);
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
