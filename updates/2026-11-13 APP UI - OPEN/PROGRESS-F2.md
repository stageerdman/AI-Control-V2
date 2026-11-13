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
- Fixed: goal user line + director line showed twice (server now records goals in the thread) → server lines only,
  a local line only as a fallback for an older server; follow-ups send `{text, reportId}` ("About: <title>" label
  kept); chat bubbles keep line breaks (the plan reply's bullets ran together); ring label was "to <goal summary>"
  (now the project target); Projects list never refreshed after visiting an office (status/progress stale) → refetch
  on visit + every 10 s; a project that just went idle (server lifecycle) dropped to "The back lot" → idle real
  projects worked on this week stay on set with an Idle pill; role `Create “x”` label normalised; orchestrator
  delete says it hands its N projects to another orchestrator (toast too).

## Done
- **Backend robustness (release app):** `backend.rs` runs `npm start` (no `tsx watch` in a long-running app), keeps
  the previous log as `~/.ai-studio/logs/app-server.prev.log`, Finder PATH = Homebrew (`/opt/homebrew/bin`,
  sbin), `/usr/local/bin`, `~/.local/bin` first, then the inherited PATH, then the system dirs (cargo tests).
  UI: `BackendGate` keeps watching `/health` every 5 s (visible only); 2 misses → calm top bar "The studio stopped
  answering." — in the app it restarts the server once by itself, **Restart** tries again (Rust respawns a dead
  child); nothing unmounts; on recovery every query refetches. Tests: `watchStep`, `ping`.
- **Collaboration UI (F1b shapes):** `features/collab/` (`designView` model + `WorkDesign`): setup team step shows
  "How we'll work" (Pixel talks to captains only / everyone; review chain chips after → reviewer · kind, why on
  hover, ≤ 3 + `+N`; "Sent back up to 2× — then it comes to you." / "No reviews — work merges once it's built.");
  changes come from the side chat (chips that changed flash mint once). Office: `handoff` → the sender carries the
  paper to the reviewer's desk, the reviewer turns to take it, sender walks home (≤ 2 at once, none in reduced
  motion); `review.approved` → a hop; whiteboard rows carry the stage (in review · sent back n× · merging · stopped;
  hover = "Scarlett is reviewing (quality)" / the reviewer's notes); "How we work →" on the whiteboard opens a card
  (`#office/<id>/how`) with the design + "Ask Pixel to change how we work…" (POST design {ask}, reply bubble).
  Progress: ring / plaque / cards use the project's overall % (`project.progress`), label "to v1.0" only with a
  target, "n of m features shipped", Set / Change target inline (PATCH target). Cast → Edit roles: "Own tools"
  switch (toolsmith) next to "Files reports". UX spec by a UX agent (cuts: no stamps/red, no names on rows, no
  manual gate editor). Tests: collab model, task stages/hover/holder, progress, goal dedupe, router `how`, toolsmith
  switch, progressLine, idle-on-set. Live on the fake runner: handoff walk seen, item in review on the board,
  design asked → Pixel's reply + new chips, target saved → card "100% to v1.0".
- **Release build:** `tauri build` → `AI Studio.app` (name + icon ok). Opened with `open`: spawns `npm start` in
  its own group with Homebrew first on PATH, `claude` resolved by the server (`/opt/homebrew/...`), UI requests
  reached the server, quit → whole group gone; `kill -9` of the server → back in ~2 s (supervisor).
