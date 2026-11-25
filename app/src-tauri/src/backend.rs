//! Backend launcher — owns the local Node server's lifecycle.
//!
//! `ensure_running` reuses a server that already answers `/health` on the port, otherwise
//! spawns `npm --prefix <server> start` (no file watcher — a long-running app must not restart
//! when files change) in its own process group and polls `/health`
//! until it is ready (or times out / the child dies). `stop` terminates the whole group.
//! A tiny shell watchdog in the same group kills the server if the app itself dies hard.
//!
//! One backend per data dir: the server takes `<data dir>/server.lock {pid, port}` and a second one
//! refuses to start. So before spawning, the app reads that lock — a live holder that answers
//! `/health` is reused (the UI is pointed at its port) and never killed on quit.

use std::fs::{self, File};
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::os::unix::process::CommandExt;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU16, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::sleep;
use std::time::{Duration, Instant};

const DEFAULT_PORT: u16 = 4319;
const START_TIMEOUT: Duration = Duration::from_secs(30);
const POLL_EVERY: Duration = Duration::from_millis(250);
const STOP_GRACE: Duration = Duration::from_secs(3);
/// On Quit the server pauses its agents and ends what they started (≈4 s at worst); past this
/// the app force-stops the group and exits anyway (design: "after 5 s, the app quits anyway").
const QUIT_DEADLINE: Duration = Duration::from_secs(5);

#[derive(serde::Serialize)]
pub struct Started {
    /// True when an already-running server was reused (not spawned by this app).
    pub reused: bool,
    /// Raw `/health` JSON body; the front-end validates it.
    pub health: String,
    /// The port the UI must talk to (another backend's, when reused through the data-dir lock).
    pub port: u16,
}

pub struct Backend {
    /// The port in use: ours, or the lock holder's when we reuse another backend.
    port: AtomicU16,
    /// The port we spawn on.
    own_port: u16,
    studio_home: PathBuf,
    server_dir: PathBuf,
    log_path: PathBuf,
    child: Mutex<Option<Child>>,
    /// Set on app exit so the supervisor doesn't bring the server back.
    stopping: AtomicBool,
    /// When the supervisor restarted a crashed server (for the restart budget).
    restarts: Mutex<Vec<Instant>>,
    /// How long a start (or a reused backend that is still starting) may take.
    start_timeout: Duration,
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
            port: AtomicU16::new(port),
            own_port: port,
            studio_home: PathBuf::from(&studio_home),
            server_dir,
            log_path: PathBuf::from(studio_home).join("logs/app-server.log"),
            child: Mutex::new(None),
            stopping: AtomicBool::new(false),
            restarts: Mutex::new(Vec::new()),
            start_timeout: START_TIMEOUT,
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
            if live_holder(&me.studio_home).is_some() {
                continue; // another backend took the data dir: the UI's Restart reuses it
            }
            if allowed && get_health(me.own_port).is_err() {
                if let Ok(c) = me.spawn() {
                    *child = Some(c);
                }
            }
        });
    }

    fn port(&self) -> u16 {
        self.port.load(Ordering::SeqCst)
    }

    /// Idempotent: returns the health body once the server answers. Serialized by the lock.
    pub fn ensure_running(&self) -> Result<Started, String> {
        let mut child = self.child.lock().map_err(|_| "backend lock poisoned".to_string())?;
        if self.stopping.load(Ordering::SeqCst) {
            return Err("The studio is quitting.".into()); // never respawn behind a Quit
        }

        // Forget a child that has already exited (crash, killed) so Retry can respawn.
        if let Some(c) = child.as_mut() {
            if let Ok(Some(_)) = c.try_wait() {
                *child = None;
            }
        }
        // Not ours running: another backend may hold the data dir — reuse it, never fight it.
        if child.is_none() {
            if let Some(holder) = live_holder(&self.studio_home) {
                return self.reuse(holder);
            }
            self.port.store(self.own_port, Ordering::SeqCst);
        }
        if let Ok(body) = get_health(self.port()) {
            return Ok(Started { reused: child.is_none(), health: body, port: self.port() });
        }
        if child.is_none() {
            *child = Some(self.spawn()?);
        }

        let deadline = Instant::now() + self.start_timeout;
        loop {
            if let Ok(body) = get_health(self.port()) {
                return Ok(Started { reused: false, health: body, port: self.port() });
            }
            if let Some(c) = child.as_mut() {
                if let Ok(Some(status)) = c.try_wait() {
                    *child = None;
                    // It lost the race for the data dir to a backend that started meanwhile: use that one.
                    if let Some(holder) = live_holder(&self.studio_home) {
                        return self.reuse(holder);
                    }
                    return Err(format!("The server stopped ({status}).\n{}", self.log_tail()));
                }
            }
            if Instant::now() >= deadline {
                if let Some(c) = child.take() {
                    kill_group(c, STOP_GRACE);
                }
                return Err(format!(
                    "The server didn't answer on port {} within {}s.\n{}",
                    self.port(),
                    self.start_timeout.as_secs(),
                    self.log_tail()
                ));
            }
            sleep(POLL_EVERY);
        }
    }

    /// Point at the lock holder's port; wait for it to answer (it may still be starting).
    fn reuse(&self, holder: LockInfo) -> Result<Started, String> {
        self.port.store(holder.port, Ordering::SeqCst);
        let deadline = Instant::now() + self.start_timeout;
        loop {
            if let Ok(body) = get_health(holder.port) {
                return Ok(Started { reused: true, health: body, port: holder.port });
            }
            if !pid_alive(holder.pid) || Instant::now() >= deadline {
                return Err(format!(
                    "Another AI Studio backend (pid {}, port {}) holds {} but doesn't answer. Stop it, then Retry.",
                    holder.pid,
                    holder.port,
                    self.studio_home.display()
                ));
            }
            sleep(POLL_EVERY);
        }
    }

    /// Stop the server if this app spawned it, giving it until QUIT_DEADLINE to pause its agents
    /// and end what they started. A reused server is left alone. Idempotent.
    pub fn stop(&self) {
        self.stopping.store(true, Ordering::SeqCst);
        if let Ok(mut child) = self.child.lock() {
            if let Some(c) = child.take() {
                kill_group(c, QUIT_DEADLINE);
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
            .env("PORT", self.own_port.to_string())
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

/// `<data dir>/server.lock` as the server writes it.
#[derive(Debug, Clone, Copy, PartialEq, serde::Deserialize)]
pub struct LockInfo {
    pub pid: i32,
    pub port: u16,
}

fn read_lock(home: &std::path::Path) -> Option<LockInfo> {
    let text = fs::read_to_string(home.join("server.lock")).ok()?;
    serde_json::from_str(&text).ok()
}

/// Is a process with this pid alive (EPERM = alive, someone else's)?
fn pid_alive(pid: i32) -> bool {
    if pid <= 0 {
        return false;
    }
    let r = unsafe { libc::kill(pid, 0) };
    r == 0 || std::io::Error::last_os_error().raw_os_error() == Some(libc::EPERM)
}

/// The backend holding the data dir, if its process is alive (a dead pid = a stale lock).
fn live_holder(home: &std::path::Path) -> Option<LockInfo> {
    read_lock(home).filter(|l| pid_alive(l.pid) && l.pid as u32 != std::process::id())
}

/// SIGTERM the child's process group, wait until the whole group is gone (up to `grace`), then
/// SIGKILL whatever is left. Waiting on the group, not just npm: the node server under it is the
/// one doing the graceful shutdown.
fn kill_group(mut child: Child, grace: Duration) {
    let pgid = child.id() as libc::pid_t;
    unsafe { libc::killpg(pgid, libc::SIGTERM) };
    let deadline = Instant::now() + grace;
    while Instant::now() < deadline {
        let _ = child.try_wait(); // reap our child: a zombie would keep the group "alive"
        if !group_alive(pgid) {
            break;
        }
        sleep(Duration::from_millis(50));
    }
    unsafe { libc::killpg(pgid, libc::SIGKILL) };
    let _ = child.wait();
}

/// Does any process remain in this process group?
fn group_alive(pgid: libc::pid_t) -> bool {
    let r = unsafe { libc::killpg(pgid, 0) };
    r == 0 || std::io::Error::last_os_error().raw_os_error() == Some(libc::EPERM)
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
    // one write: `write!` on a raw stream sends each piece separately
    let req = format!("GET /health HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n");
    stream.write_all(req.as_bytes()).map_err(|e| e.to_string())?;
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

    fn temp_home(tag: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("ai-studio-lock-{tag}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    /// A tiny /health server on a free port (answers `n` requests).
    fn fake_backend(n: usize) -> u16 {
        let l = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = l.local_addr().unwrap().port();
        std::thread::spawn(move || {
            for s in l.incoming().take(n) {
                let mut s = s.unwrap();
                // read the whole request head: closing with unread bytes sends a reset, and the client's
                // read then fails (the old 1-in-3 flake when the request arrived in pieces)
                let mut head = Vec::new();
                let mut buf = [0u8; 512];
                while !head.windows(4).any(|w| w == b"\r\n\r\n") {
                    match s.read(&mut buf) {
                        Ok(0) | Err(_) => break,
                        Ok(n) => head.extend_from_slice(&buf[..n]),
                    }
                }
                let _ = s.write_all(b"HTTP/1.1 200 OK\r\ncontent-type: application/json\r\n\r\n{\"ok\":true}");
            }
        });
        port
    }

    fn backend_at(home: &std::path::Path, own_port: u16) -> Backend {
        Backend {
            port: AtomicU16::new(own_port),
            own_port,
            studio_home: home.to_path_buf(),
            server_dir: home.join("no-server"),
            log_path: home.join("logs/app-server.log"),
            child: Mutex::new(None),
            stopping: AtomicBool::new(false),
            restarts: Mutex::new(Vec::new()),
            start_timeout: Duration::from_millis(400),
        }
    }

    #[test]
    fn reads_the_servers_lock() {
        let home = temp_home("read");
        fs::write(home.join("server.lock"), r#"{"pid":123,"port":4391,"startedAt":"2026-11-14T00:00:00Z"}"#).unwrap();
        assert_eq!(read_lock(&home), Some(LockInfo { pid: 123, port: 4391 }));
        fs::write(home.join("server.lock"), "garbage").unwrap();
        assert_eq!(read_lock(&home), None);
    }

    #[test]
    fn a_dead_pid_is_a_stale_lock() {
        let home = temp_home("stale");
        fs::write(home.join("server.lock"), r#"{"pid":999999,"port":4391}"#).unwrap();
        assert!(!pid_alive(999_999));
        assert_eq!(live_holder(&home), None);
    }

    #[test]
    fn reuses_a_live_lock_holder_on_its_port_and_never_kills_it() {
        let home = temp_home("reuse");
        let port = fake_backend(4);
        // a live process that isn't us: our parent (cargo test's runner)
        let ppid = unsafe { libc::getppid() };
        fs::write(home.join("server.lock"), format!(r#"{{"pid":{ppid},"port":{port}}}"#)).unwrap();
        let b = backend_at(&home, 1); // own port 1 never answers → spawning would fail
        let s = b.ensure_running().expect("reuses the holder");
        assert!(s.reused);
        assert_eq!(s.port, port);
        assert_eq!(b.port(), port);
        b.stop(); // nothing of ours to kill
        assert!(pid_alive(ppid));
    }

    #[test]
    fn a_silent_live_holder_is_an_honest_error_not_a_second_backend() {
        let home = temp_home("silent");
        let ppid = unsafe { libc::getppid() };
        fs::write(home.join("server.lock"), format!(r#"{{"pid":{ppid},"port":1}}"#)).unwrap();
        let b = backend_at(&home, 1);
        let err = b.ensure_running().err().expect("no second backend");
        assert!(err.contains(&format!("pid {ppid}, port 1")), "{err}");
        assert!(b.child.lock().unwrap().is_none(), "nothing spawned");
    }

    #[test]
    fn a_stale_lock_falls_through_to_our_own_port() {
        let home = temp_home("own");
        fs::write(home.join("server.lock"), r#"{"pid":999999,"port":1}"#).unwrap();
        let port = fake_backend(2); // "ours" (e.g. a server we left running) already answers
        let b = backend_at(&home, port);
        let s = b.ensure_running().unwrap();
        assert_eq!(s.port, port);
    }

    /// A process group like the server's: `sh` running `script`, with a grandchild in the group.
    fn group_running(script: &str) -> Child {
        Command::new("/bin/sh").arg("-c").arg(script).process_group(0).spawn().unwrap()
    }

    #[test]
    fn stopping_waits_for_the_whole_group_not_just_the_leader() {
        // the leader exits at once on TERM; its child takes 300 ms to wind down
        let c = group_running("(trap 'sleep 0.3; exit 0' TERM; while :; do sleep 0.05; done) & trap 'exit 0' TERM; wait");
        let pgid = c.id() as libc::pid_t;
        sleep(Duration::from_millis(200));
        let t0 = Instant::now();
        kill_group(c, Duration::from_secs(3));
        assert!(t0.elapsed() >= Duration::from_millis(250), "waited for the winding-down child");
        assert!(t0.elapsed() < Duration::from_secs(2), "didn't sit out the whole grace");
        assert!(!group_alive(pgid));
    }

    #[test]
    fn a_group_that_ignores_term_is_killed_at_the_deadline() {
        let c = group_running("trap '' TERM; while :; do sleep 0.05; done");
        let pgid = c.id() as libc::pid_t;
        sleep(Duration::from_millis(100));
        let t0 = Instant::now();
        kill_group(c, Duration::from_millis(300));
        assert!(t0.elapsed() >= Duration::from_millis(300));
        sleep(Duration::from_millis(100));
        assert!(!group_alive(pgid));
    }

    #[test]
    fn no_respawn_once_quitting() {
        let home = temp_home("quitting");
        let b = backend_at(&home, 1);
        b.stop();
        assert_eq!(b.ensure_running().err().unwrap(), "The studio is quitting.");
    }

    #[test]
    fn closed_port_is_not_healthy() {
        // Port 1 on loopback is essentially never listening.
        assert!(get_health(1).is_err());
    }
}
