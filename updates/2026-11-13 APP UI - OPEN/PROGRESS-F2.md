# PROGRESS — F2 Whole-app pass — ⏳ in progress

Resume notes. Plan: `update v1.md` (Overnight final build → F2). Commits prefixed `APP F2:`. Shots `shots/f2-*.png`.

## Harness (scratchpad `f2/`)
- Fake-runner server on :4501 (temp home/sandbox/control, `AI_STUDIO_FAKE_PACE_MS=600`), started through a tiny
  `f2srv.mjs` that imports `server/src/main.ts` (a plain `tsx src/main.ts` command line got killed by other sessions'
  cleanup). Vite on :1501 proxying `/api`. Playwright-core driving a **renamed copy** of the cached
  `chrome-headless-shell` (`hs/f2view`).
- Flows: `new.cjs` (Projects → New → Name → Orchestrator → Setter → team chat → Accept/Tinker → office),
  `office.cjs` (director chat, goal → whiteboard, research → report → tray → read → follow-up, features, health,
  safe), `ask.cjs` ("ask me" → "!" → answer; ask raised while away → pager → office), `pages.cjs` (every page at
  1440 and 900 px: no horizontal scroll), `lost.cjs` (server killed → bar → restart).

## Click-through findings
- ✅ New project flow, office flow, reports, features, health, safe, asks, pager — all PASS on the fake runner.
- Fixed: the app had no idea when the server died mid-session (see below).
- Pending (collaboration follow-up from F1b): goal lines now stored server-side (`thread.message.goalId`) → the
  UI-local goal line + user bubble show twice; follow-ups should send `{text, reportId}`; whiteboard ring label
  "to <goal summary>" should use the project target/progress.

## Done
- **Backend robustness (release app):** `backend.rs` runs `npm start` (no `tsx watch` in a long-running app), keeps
  the previous log as `~/.ai-studio/logs/app-server.prev.log`, Finder PATH = Homebrew (`/opt/homebrew/bin`,
  sbin), `/usr/local/bin`, `~/.local/bin` first, then the inherited PATH, then the system dirs (cargo tests).
  UI: `BackendGate` keeps watching `/health` every 5 s (visible only); 2 misses → calm top bar "The studio stopped
  answering." — in the app it restarts the server once by itself, **Restart** tries again (Rust respawns a dead
  child); nothing unmounts; on recovery every query refetches. Tests: `watchStep`, `ping`.
