# PROGRESS — G3 App UI (access, GitHub, ports, rebuild) + G4 ship to /Applications

Commits prefixed `ACCESS G3:` / `ACCESS G4:`. Spec: `spec-ux-G2.md`. Contract: `PROGRESS-G1.md`.

## Status
0. ✅ Two small server additions the spec needs (G1 didn't expose them): `GET /github/status`
   `{gh: 'ready'|'missing'|'signed-out', login}` (publish form's owner prefix, the "sign in" hints) and
   `remote: {url, github}` on `GET /sandbox/folders` (the Name step's "keeps origin"). Tests in `github.test.ts`, `setter.test.ts`.
1. ✅ Access — the app is on `/accesses` (no `/credentials` calls left; the server's legacy routes stay).
   `AccessEditor` (one wide sheet: create + edit; 3 templates as a radiogroup that steps aside once a value is
   typed; field rows label / env var (placeholder = NAME_LABEL, read-only once saved) / 🔒 toggle (label decides
   until touched) / value (secret = uncontrolled password input) / ✕). `editor.ts` = the pure model + `planSave`
   (create = one POST; edit = meta PATCH, field PATCHes, PUT values, removes first but never the last field
   before adds; Secret→not secret = move aside, re-add plain under its env var, drop the old one — the old
   secret is never read back). The safe: whole-access grant switches (`PUT/DELETE …/access/:accessId`),
   env var line with `••••last4` / `(no value yet)` and `…N more`, coral "new" dot + sr-only prefix, new first;
   `POST …/access/seen` on open, dots kept until close; the office safe gets the dot and
   "Safe — <project> access, N new"; `access.changed` refetches. Shots `g3-access`, `g3-access-edit`,
   `g3-access-template`, `g3-safe-new`.
2. ✅ GitHub — Name step: `⎇ GitHub · private repo` switch (draft `github`, default from `GET /settings`),
   "keeps origin (owner/repo)" with no switch for an adopted folder with a remote, a quiet hint when gh isn't
   signed in (never blocks). Rivet's checklist ends with a `GitHub` row; `githubDetail` maps every server line to
   the spec copy (done / push failed / kept / off / CLI / name taken / other → skipped, setup still finishes);
   "(local only)" gone. Health: `GithubRow` (`office/github.ts` pure state) — repo link ↗, Private/Public switch
   (going public = inline confirm, focus on Keep private; private = at once), last push (`pushed 2 min ago` /
   `not pushed yet` / amber `last push didn’t go through` + `Try again`), unpublished → `Publish to GitHub…` inline
   form (owner from `GET /github/status`, name check, Private default) → one confirm sentence with the commit count;
   gh not ready → how-to hint + `Check again`. Server: `POST /projects/:id/github/push` for Try again (tested).
   Studio default: a switch under the Blueprint's Starter Kit ("A private GitHub repo"). Projects cards: the
   "GitHub not connected" chip is gone (chip only when published). `github.changed` / `github.push` refetch health.
   Shots `g3-setup-github`, `g3-setup-github-setter`, `g3-setup-github-skipped`, `g3-gh-missing`, `g3-gh-publish`,
   `g3-gh-confirm`, `g3-gh-published`, `g3-gh-public-confirm`, `g3-gh-push-failed`, `g3-github-default`.
3. ✅ Ports — `features/ports`: "· Ports" text button in the Projects count line opens **The Switchboard** (read-only
   wide sheet: project · block · app port running/stopped · also listening, with the agent holding a spare;
   projects with a folder only, on set first then the back lot muted; `GET /ports` on open + every 5 s while open;
   name → office). Health App details gain `Ports 3330–3334 · app on 3330 · 3331 also listening · All ports`
   (opens the sheet with that row highlighted + focused). **Cut:** "Free" (no stop-a-listener route) and "Outside
   any project" (`GET /ports` doesn't scan outside the blocks). Shots `g3-ports`, `g3-ports-app-row`.
4. ✅ Blueprint Rebuild — there was no button yet (only a hint naming the routine); each stale project on the
   Principles tab's freshness list now has `Rebuild` → `POST /projects/:id/claude-md/rebuild`, a 409 shown
   word for word under the row, success = toast + the row goes ✓. Server fixes found on the way (tested): the
   compile date moves on even when the text came out the same (a touched module left the row stale for ever),
   and only files git sees as changed are committed (a stamp written back to HEAD's content was a 500).
   Shot `g3-rebuild`.
5. ⏸ G4 ship — **PAUSED** (coordinator: the user is watching a movie; no tests, builds, browsers or app launches).

## G3 checks (done)
App: 230 vitest tests pass, `tsc --noEmit` and biome are clean. Server: 373 tests pass, tsc and biome are clean. `cargo test`: 13 pass.
A release `vite build` caught a broken Switchboard selector that the dev server had let through. It is fixed and committed.
Shots are in `shots/g3-*`. Narrow 560 px: the editor and the Switchboard don't scroll sideways.

## G4: where it stopped (2026-11-14 ~18:50)
- ✅ Backup: `~/.ai-studio/backups/studio-before-access-github-20261114-184601.db` (no -wal/-shm existed;
  integrity ok; 13 projects, 0 credentials). No old backend was running and there was no lock.
- ✅ `tauri build` (release) went through → `~/.cargo-shared-target/release/bundle/macos/AI Studio.app`. Installed with
  `ditto` to `/Applications/AI Studio.app`. `backend.rs` finds `server/` by the compile-time absolute
  `CARGO_MANIFEST_DIR/../../server` (seen in the binary), not by the bundle location, so there was nothing to fix.
- ✅ The first open from /Applications worked. The backend came up on 4319 with the new code, the lock was written
  `{pid, port: 4319}`, `user_version` went 20 → 24 (migrations 21–24), and `GET /projects` returned 13 (the user's
  real ones). `GET /accesses` returned 0, because there were 0 credentials before, so nothing was lost. The global `.env` md5 is
  unchanged. `GET /settings` returned `{githubByDefault: true}`, `GET /github/status` returned ready, and `GET /ports` returned 13 blocks. The server log shows
  the app's UI loading `/projects`, `/drafts`, `/teams`, `/settings`, `/ports` and `/github/status`.
- ⚠ **Open issue:** about 15 s after that first open, the app quit by itself. The lock was removed cleanly and there is no
  crash report. It happened right after I ran `osascript -e 'tell application "AI Studio" to activate'` and a
  `screencapture`, which failed with "could not create image from display", so those may have caused it. A second open to see whether it
  stays up was cut short by the pause. I quit the app gently with `osascript … quit`, and 4319 is free.
- Test servers (:4711 fake runner + stub gh, Vite :1711 and :1712, listener :3331) are all stopped.
- **Left to do:** (1) Open the app from /Applications and watch whether it stays up for more than 60 s without
  osascript. If it quits again, read `~/.ai-studio/logs/app-server.log` and the app's stderr. (2) Take read-only screenshots of the real data
  (`g3/real.cjs` through Vite :1712 proxying to 4319: projects, ports, access). (3) Quit, check 4319 is free, reopen
  and leave it running. (4) Update `HOW-TO-USE.md` (open from Applications; GitHub by default and how to turn it off
  (Name step switch / Blueprint › Starter Kit); Add new access; Ports and `PORT=… npm start`). (5) Update the Status in
  `update v1.md`. The plan's agent run with `PORT=… npm start` plus a 2-field access was already done live in G1.
