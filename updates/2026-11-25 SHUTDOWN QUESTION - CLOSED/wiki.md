# Shutdown: what happens to agents (answer to f-question-what-happens-on-shutdown)

## How the pieces connect
- Mac app (`app/src-tauri/src/backend.rs`, `lib.rs`): spawns the server in its own process group with a
  shell watchdog. On app exit (`RunEvent::Exit`) → `stop()` → SIGTERM the server group, 3 s grace, SIGKILL.
  Closing the only window exits the app (Tauri default; nothing keeps it alive in the Dock or menu bar).
  Force-quit of the app → watchdog notices within ~1 s → `kill -TERM 0` → same clean server shutdown.
  A server reused from another backend (dev server) is never stopped by the app.
- Server (`server/src/main.ts`, `app.ts` preClose): SIGTERM/SIGINT → dispatch stops starting work →
  `runtime.shutdown()` marks every live run `closing` and stops its agent CLI (SIGTERM, SIGKILL after 3 s) →
  chat gets "Paused: the studio closed during this run" → db closes, `server.lock` removed.
- Next launch: `runs.failInterrupted()` marks leftover 'running' rows interrupted; `dispatch.recover()` puts
  each cut-off checklist item back to todo with `resumeRunId` (same session, same checkout/branch) and pumps;
  nothing is marked failed. `threads.recover()` answers cut-off chat turns (or carries on one waiting on a
  question). Open questions of checklist runs stay open; a hand-started run's question is withdrawn.

## Spike (spike.mjs, fake runner, temp data dir)
- Normal quit: whole group gone in 25 ms, lock removed.
- Hard kill (SIGKILL): lock left behind; next launch takes the stale lock over and answers in 1.6 s.
- A child started `detached` (how agent CLIs and user apps are started) keeps running when its parent is
  SIGKILLed.

## Gap
Agent CLIs and Start'ed apps run in their own process groups and their pids are not stored. If the server
itself dies hard (crash, out of memory, killed in Activity Monitor) — not the app — they are orphaned:
an agent can keep editing its checkout while the next launch resumes the same session in the same
checkout; an app keeps its port. Fix: store each live run/app pid group in the db (or a pid file) and on
boot stop any still-alive group before recover() resumes work.
