//! Backend launcher — owns the local Node server's lifecycle.
//!
//! `ensure_running` reuses a server that already answers `/health` on the port, otherwise
//! spawns `npm --prefix <server> start` (no file watcher — a long-running app must not restart
//! when files change) in its own process group and polls `/health`
//! until it is ready (or times out / the child dies). `stop` terminates the whole group.
//! A tiny shell watchdog in the same group kills the server if the app itself dies hard.

use std::fs::{self, File};
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::os::unix::process::CommandExt;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::sleep;
use std::time::{Duration, Instant};

const DEFAULT_PORT: u16 = 4319;
const START_TIMEOUT: Duration = Duration::from_secs(30);
const POLL_EVERY: Duration = Duration::from_millis(250);
const STOP_GRACE: Duration = Duration::from_secs(3);

#[derive(serde::Serialize)]
pub struct Started {
    /// True when an already-running server was reused (not spawned by this app).
    pub reused: bool,
    /// Raw `/health` JSON body; the front-end validates it.
    pub health: String,
}

pub struct Backend {
    port: u16,
    server_dir: PathBuf,
    log_path: PathBuf,
    child: Mutex<Option<Child>>,
    /// Set on app exit so the supervisor doesn't bring the server back.
    stopping: AtomicBool,
    /// When the supervisor restarted a crashed server (for the restart budget).
    restarts: Mutex<Vec<Instant>>,
}

/// The supervisor gives up after this many crash-restarts within RESTART_WINDOW (then the UI's
/// Restart is the way back — `ensure_running` always respawns a dead child).
const RESTART_BUDGET: usize = 5;
const RESTART_WINDOW: Duration = Duration::from_secs(600);
const SUPERVISE_EVERY: Duration = Duration::from_secs(2);

/// Pure: may the supervisor restart now, given earlier restart times? Drops old entries.
fn may_restart(history: &mut Vec<Instant>, now: Instant) -> bool {
    history.retain(|t| now.duration_since(*t) < RESTART_WINDOW);
    if history.len() >= RESTART_BUDGET {
        return false;
    }
    history.push(now);
    true
}

impl Backend {
    pub fn from_env() -> Self {
        let port = std::env::var("PORT").ok().and_then(|p| p.parse().ok()).unwrap_or(DEFAULT_PORT);
        // Dev: the repo's server/ next to app/. Packaging will point this at a bundled binary.
        let server_dir = std::env::var("AI_STUDIO_SERVER_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../server"));
        let home = std::env::var("HOME").unwrap_or_default();
        let studio_home = std::env::var("AI_STUDIO_HOME")
            .map(|h| h.replacen('~', &home, 1))
            .unwrap_or_else(|_| format!("{home}/.ai-studio"));
        Backend {
            port,
            server_dir,
            log_path: PathBuf::from(studio_home).join("logs/app-server.log"),
            child: Mutex::new(None),
            stopping: AtomicBool::new(false),
            restarts: Mutex::new(Vec::new()),
        }
    }

    /// Background thread: a server this app spawned that dies (crash, OOM, killed) is started
    /// again — the webview's own watch can be suspended (App Nap) while the window is hidden.
    pub fn supervise(self: &Arc<Self>) {
        let me = Arc::clone(self);
        std::thread::spawn(move || loop {
            sleep(SUPERVISE_EVERY);
            if me.stopping.load(Ordering::SeqCst) {
                return;
            }
            let Ok(mut child) = me.child.lock() else { return };
            let died = match child.as_mut() {
                Some(c) => matches!(c.try_wait(), Ok(Some(_))),
                None => false,
            };
            if !died {
                continue;
            }
            *child = None;
            let allowed = me.restarts.lock().map(|mut h| may_restart(&mut h, Instant::now())).unwrap_or(false);
            if allowed && get_health(me.port).is_err() {
                if let Ok(c) = me.spawn() {
                    *child = Some(c);
                }
            }
        });
    }

    /// Idempotent: returns the health body once the server answers. Serialized by the lock.
    pub fn ensure_running(&self) -> Result<Started, String> {
        let mut child = self.child.lock().map_err(|_| "backend lock poisoned".to_string())?;

        // Forget a child that has already exited (crash, killed) so Retry can respawn.
        if let Some(c) = child.as_mut() {
            if let Ok(Some(_)) = c.try_wait() {
                *child = None;
            }
        }
        if let Ok(body) = get_health(self.port) {
            return Ok(Started { reused: child.is_none(), health: body });
        }
        if child.is_none() {
            *child = Some(self.spawn()?);
        }

        let deadline = Instant::now() + START_TIMEOUT;
        loop {
            if let Ok(body) = get_health(self.port) {
                return Ok(Started { reused: false, health: body });
            }
            if let Some(c) = child.as_mut() {
                if let Ok(Some(status)) = c.try_wait() {
                    *child = None;
                    return Err(format!("The server stopped ({status}).\n{}", self.log_tail()));
                }
            }
            if Instant::now() >= deadline {
                if let Some(c) = child.take() {
                    kill_group(c);
                }
                return Err(format!(
                    "The server didn't answer on port {} within {}s.\n{}",
                    self.port,
                    START_TIMEOUT.as_secs(),
                    self.log_tail()
                ));
            }
            sleep(POLL_EVERY);
        }
    }

    /// Stop the server if this app spawned it. A reused server is left alone.
    pub fn stop(&self) {
        self.stopping.store(true, Ordering::SeqCst);
        if let Ok(mut child) = self.child.lock() {
            if let Some(c) = child.take() {
                kill_group(c);
            }
        }
    }

    fn spawn(&self) -> Result<Child, String> {
        if !self.server_dir.join("node_modules").is_dir() {
            return Err(format!(
                "Server dependencies are missing. Run `npm install` in {}.",
                self.server_dir.display()
            ));
        }
        if let Some(dir) = self.log_path.parent() {
            fs::create_dir_all(dir).map_err(|e| format!("Can't create log dir: {e}"))?;
        }
        // Keep the previous run's log next to the new one (a crash is read after the restart).
        if self.log_path.exists() {
            let _ = fs::rename(&self.log_path, self.log_path.with_extension("prev.log"));
        }
        let log = File::create(&self.log_path).map_err(|e| format!("Can't open server log: {e}"))?;
        let log_err = log.try_clone().map_err(|e| e.to_string())?;

        // $0 = app pid, $1 = server dir. The watchdog ends the group if the app disappears.
        let script = r#"(while kill -0 "$0" 2>/dev/null; do sleep 1; done; kill -TERM 0) &
exec npm --prefix "$1" start"#;
        Command::new("/bin/sh")
            .arg("-c")
            .arg(script)
            .arg(std::process::id().to_string())
            .arg(&self.server_dir)
            .current_dir(&self.server_dir)
            .env("PORT", self.port.to_string())
            .env("PATH", with_common_paths(std::env::var("PATH").unwrap_or_default(), &home_dir()))
            .stdin(Stdio::null())
            .stdout(log)
            .stderr(log_err)
            .process_group(0)
            .spawn()
            .map_err(|e| format!("Couldn't start the server: {e}"))
    }

    fn log_tail(&self) -> String {
        let text = fs::read_to_string(&self.log_path).unwrap_or_default();
        let lines: Vec<&str> = text.lines().collect();
        lines[lines.len().saturating_sub(8)..].join("\n")
    }
}

/// SIGTERM the child's process group, wait briefly, then SIGKILL whatever is left.
fn kill_group(mut child: Child) {
    let pgid = child.id() as libc::pid_t;
    unsafe { libc::killpg(pgid, libc::SIGTERM) };
    let deadline = Instant::now() + STOP_GRACE;
    while Instant::now() < deadline {
        if let Ok(Some(_)) = child.try_wait() {
            break;
        }
        sleep(Duration::from_millis(50));
    }
    // Grandchildren (tsx → node) can outlive npm; always sweep the group.
    unsafe { libc::killpg(pgid, libc::SIGKILL) };
    let _ = child.wait();
}

fn home_dir() -> String {
    std::env::var("HOME").unwrap_or_default()
}

/// A Finder-launched app gets a bare PATH (/usr/bin:/bin:…). The server and the agents it runs
/// need node/npm/npx (Homebrew), git, and the `claude` CLI — put the usual install dirs first
/// (Homebrew before the system), keeping whatever else was there.
fn with_common_paths(path: String, home: &str) -> String {
    let mut parts: Vec<String> = Vec::new();
    let preferred = [
        "/opt/homebrew/bin".to_string(),
        "/opt/homebrew/sbin".to_string(),
        "/usr/local/bin".to_string(),
        format!("{home}/.local/bin"),
    ];
    let rest = path.split(':').filter(|p| !p.is_empty()).map(String::from);
    let tail = ["/usr/bin", "/bin", "/usr/sbin", "/sbin"].map(String::from);
    for p in preferred.into_iter().chain(rest).chain(tail) {
        if !p.is_empty() && !p.starts_with("/.") && !parts.contains(&p) {
            parts.push(p);
        }
    }
    parts.join(":")
}

/// Minimal HTTP/1.1 GET of `/health` on loopback; Ok(body) only for a 200.
pub fn get_health(port: u16) -> Result<String, String> {
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let mut stream = TcpStream::connect_timeout(&addr, Duration::from_millis(500)).map_err(|e| e.to_string())?;
    stream.set_read_timeout(Some(Duration::from_secs(2))).map_err(|e| e.to_string())?;
    write!(stream, "GET /health HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n")
        .map_err(|e| e.to_string())?;
    let mut raw = String::new();
    stream.read_to_string(&mut raw).map_err(|e| e.to_string())?;
    parse_response(&raw)
}

fn parse_response(raw: &str) -> Result<String, String> {
    let (head, body) = raw.split_once("\r\n\r\n").ok_or("malformed response")?;
    let status = head.lines().next().unwrap_or_default();
    if status.split_whitespace().nth(1) != Some("200") {
        return Err(format!("unhealthy: {status}"));
    }
    Ok(body.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_ok_body() {
        let raw = "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\n\r\n{\"ok\":true}";
        assert_eq!(parse_response(raw).unwrap(), "{\"ok\":true}");
    }

    #[test]
    fn rejects_non_200() {
        assert!(parse_response("HTTP/1.1 503 Service Unavailable\r\n\r\n{}").is_err());
        assert!(parse_response("garbage").is_err());
    }

    #[test]
    fn adds_missing_paths_once() {
        let p = with_common_paths("/opt/homebrew/bin:/x".into(), "/Users/u");
        assert_eq!(p.matches("/opt/homebrew/bin:").count(), 1);
        assert!(p.contains("/usr/local/bin"));
        assert!(p.contains("/Users/u/.local/bin"));
        assert!(p.contains(":/x"));
    }

    #[test]
    fn finder_path_puts_homebrew_before_the_system() {
        // What launchd hands a Finder-launched app.
        let p = with_common_paths("/usr/bin:/bin:/usr/sbin:/sbin".into(), "/Users/u");
        let at = |s: &str| p.split(':').position(|x| x == s).unwrap();
        assert!(at("/opt/homebrew/bin") < at("/usr/bin"));
        assert_eq!(p.matches("/usr/bin").count(), 1);
    }

    #[test]
    fn no_home_adds_no_relative_dir() {
        let p = with_common_paths(String::new(), "");
        assert!(!p.split(':').any(|x| x.starts_with("/.")));
    }

    #[test]
    fn restart_budget_per_window() {
        let t0 = Instant::now();
        let mut h = Vec::new();
        for _ in 0..RESTART_BUDGET {
            assert!(may_restart(&mut h, t0));
        }
        assert!(!may_restart(&mut h, t0 + Duration::from_secs(1)), "budget spent");
        assert!(may_restart(&mut h, t0 + RESTART_WINDOW + Duration::from_secs(1)), "window passed");
    }

    #[test]
    fn closed_port_is_not_healthy() {
        // Port 1 on loopback is essentially never listening.
        assert!(get_health(1).is_err());
    }
}
