# Ready to Test — update v1

**Goal.** Every project has one Start button. For a desktop app it opens the newest
built app; for a website it starts it and opens it at `http://localhost:<PORT>/`.
The user never has to run or set anything up to test. (Feature: f-ready-to-test.)

Earlier goals for this were cancelled before any work; this is the first real pass.

## What already exists on master

- **Run the app (F1c)** — `server/src/apps/app-runner.ts`: starts a project's dev
  server inside its folder (one per project, its own process group, stopped with
  the studio), minimal env, masked log tail, first printed local address.
  Routes: `GET/PATCH /projects/:id/app`, `POST /projects/:id/app/start|stop`.
- **How it starts** — `server/src/apps/run-command.ts`: `.project`'s `run:` line,
  else package.json `dev` / `start`.
- **Ports (G1)** — `server/src/apps/ports.ts`: each project owns a stable block in
  3100–3999; block[0] is the app's PORT. `listening(port)` checks 127.0.0.1 and ::1.
- **Mac projects** — `server/src/runtime/mac-project.ts` (`isMacProject`: Package.swift
  or .xcodeproj) and the Mac build rules (`mac-build.ts`: outputs stay in the
  project — `.build/`, `build/DerivedData`).
- **Tauri** — builds go to the shared Cargo target `~/.cargo-shared-target`
  (`release|debug/bundle/macos/<productName>.app`).
- **App UI** — the Office board has a Run/Stop toggle on the dev server
  (`app/src/features/office/Board.tsx`).

What was missing: a desktop app had no way to open (its `run:` line rebuilds
first, or starts a dev build); the printed address could be `127.0.0.1`, which
breaks passkey/OAuth sign-in (they are bound to `localhost`); and the start call
returned before the site was reachable.

## Phases

1. **Server: one start call** — `POST /projects/:id/start`.
   - Desktop (a `src-tauri/tauri.conf.json`, Package.swift or .xcodeproj): find the
     newest built `.app` (Tauri bundles in the shared target by `productName`;
     Swift/Xcode `.app`s under `.build/` and `build/`), open it, answer
     `{ kind: 'desktop', app }`. None built yet → a plain 409.
   - Website: start it (or reuse the running one), wait until its port answers,
     answer `{ kind: 'website', url: 'http://localhost:<PORT>/' }`. Exits early →
     409 with its last log lines.
   - Addresses always read `localhost`, never `127.0.0.1`.
   - Tests: kind detection, newest-app pick, website start/ready/reuse, early exit.
   - Live check: MagicCut (Mac app) opens; Erdman Knowledge opens at
     `http://localhost:3980/`.
2. **App: the Start button** — one button on every project (office board/card) that
   calls phase 1 and opens the link in the browser. (Separate item.)
3. **Keep it working** — teams record `run:` and build early; a health line shows
   when Start would fail. (Separate item.)

## Status

| Phase | State |
| --- | --- |
| 1. Server start call | done: `POST /projects/:id/start` (`server/src/apps/start-project.ts`, `built-app.ts`); tests `test/apps/start-project.test.ts`; live `npm run check:start` passed (Erdman Knowledge at http://localhost:3980/, MagicCut opened) |
| 2. Start button | not started |
| 3. Keep it working | not started |
