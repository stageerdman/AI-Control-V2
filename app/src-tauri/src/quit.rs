//! The single quit: menu bar Quit, ⌘Q, the app menu, the Dock and a Mac logout all land here.
//!
//! Quit stops the server (which pauses every agent and ends everything the studio started), then
//! exits. If stopping is still going after `SHOW_LINE_AFTER`, the window comes forward with one
//! calm line; a second Quit while stopping does nothing new.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::time::Duration;

/// Shorter than this, the app just closes and nothing is shown (design: no flash).
pub const SHOW_LINE_AFTER: Duration = Duration::from_millis(400);

/// The event the webview listens for to show "Pausing your agents…".
pub const STOPPING_EVENT: &str = "studio://stopping";

/// Once-guard: only the first Quit starts stopping.
#[derive(Default)]
pub struct Quit {
    started: AtomicBool,
}

impl Quit {
    /// True for the first call only.
    pub fn begin(&self) -> bool {
        !self.started.swap(true, Ordering::SeqCst)
    }

    pub fn in_progress(&self) -> bool {
        self.started.load(Ordering::SeqCst)
    }
}

/// Run `stop` on its own thread; call `on_slow` if it outlasts `show_after`; then `exit`.
/// Blocks the caller until `stop` returns (callers run this off the UI thread).
pub fn run<S, W, E>(stop: S, show_after: Duration, on_slow: W, exit: E)
where
    S: FnOnce() + Send + 'static,
    W: FnOnce(),
    E: FnOnce(),
{
    let (done_tx, done_rx) = mpsc::channel::<()>();
    std::thread::spawn(move || {
        stop();
        let _ = done_tx.send(());
    });
    if done_rx.recv_timeout(show_after).is_err() {
        on_slow();
        let _ = done_rx.recv(); // a panicked stop drops the sender: we still exit
    }
    exit();
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;
    use std::time::Instant;

    #[test]
    fn only_the_first_quit_begins() {
        let q = Quit::default();
        assert!(!q.in_progress());
        assert!(q.begin());
        assert!(!q.begin(), "a second Quit does nothing new");
        assert!(q.in_progress());
    }

    #[test]
    fn a_fast_stop_shows_nothing_and_exits() {
        let (slow, exited) = (Cell::new(false), Cell::new(false));
        run(|| {}, Duration::from_millis(200), || slow.set(true), || exited.set(true));
        assert!(!slow.get());
        assert!(exited.get());
    }

    #[test]
    fn a_slow_stop_shows_the_line_then_exits_after_stopping() {
        let (slow, exited) = (Cell::new(false), Cell::new(false));
        let t0 = Instant::now();
        run(
            || std::thread::sleep(Duration::from_millis(150)),
            Duration::from_millis(20),
            || slow.set(true),
            || exited.set(true),
        );
        assert!(slow.get());
        assert!(exited.get());
        assert!(t0.elapsed() >= Duration::from_millis(150), "exit waits for the stop");
    }

    #[test]
    fn a_panicking_stop_still_exits() {
        let exited = Cell::new(false);
        run(|| panic!("boom"), Duration::from_millis(500), || {}, || exited.set(true));
        assert!(exited.get());
    }
}
