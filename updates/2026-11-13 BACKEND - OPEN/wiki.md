# BACKEND — decisions & lessons

Durable knowledge from this update. Status lives in `update v1.md`.

## Principles
- **Fake first, live opt-in.** Every flow runs end-to-end on a scripted FakeRunner; live Claude
  runs cost money and are opt-in.
- **The sandbox is a wall.** All project file writes resolve inside the sandbox root; tested.
- **Secrets never cross the API.** Masked last-4 only, in every response and log.

## Lessons
- **Rules live in pure functions, the schema backs them up.** `src/domain` holds every cast/team
  rule (no I/O, tested directly); the repos call them inside a transaction. Where SQL can say it
  alone, it does too (partial unique index = one setter/one creator; FK cascades for seats).
- **Hard delete + restore token beats soft delete.** A trash row holds a JSON snapshot (row +
  team seats + project links + orchestrator hand-over). Every other query stays filter-free;
  restore re-applies the rules, so it can never resurrect an invalid state (a full team just
  skips the seat).
- **Reference by id, display by name.** Agents point at roles by id, so a rename touches one row.
  The API still returns the display name (`role`), with system agents falling back to their kind label.
- **Rosters are small — rewrite them whole.** Team members and project links are ≤ a handful, so
  `saveRoster` / `setLinks` delete-and-reinsert in order; ordering and captain fallback stay trivial.
- **Sandbox guard = lexical check + realpath of the deepest existing ancestor.** That catches
  `..`, absolute paths outside, prefix look-alikes (`/sandbox-evil`), and symlink escapes even for
  paths that don't exist yet. Reject `..` segments outright rather than normalising them.
- **409 vs 422.** 422 = the body is malformed or names an id that doesn't exist; 409 = the body is
  fine but a studio rule says no. The UI can show 409 `message` as-is (it's written for people).

### App shell (A0)
- **Kill the backend by process group, not pid.** `npm run dev` → `tsx watch` → `node`: killing npm
  orphans the server. Spawn with `process_group(0)` and `killpg` (TERM, grace, then KILL).
- **Hard app death needs a watchdog.** `RunEvent::Exit` only fires on a clean quit; a tiny `sh`
  loop in the same group (`while kill -0 $APP_PID; … ; kill -TERM 0`) ends the server within ~1 s
  if the app is SIGTERM'd/SIGKILL'd. Verified both paths.
- **Reuse beats spawn.** If `/health` already answers, the app uses that server and leaves it
  running on quit — lets backend devs keep their own `npm run dev`.
- **Health is fetched from Rust (raw TCP GET), not the webview.** The server sends no CORS
  headers, so a webview `fetch` from `localhost:1420`/`tauri://` would be blocked. The real UI
  will need either CORS on the server (allow the Tauri origins) or calls proxied through Rust.
- **GUI apps get a bare PATH.** Add `/opt/homebrew/bin`, `/usr/local/bin` before spawning `npm`.
- **Screenshots from an agent shell fail** (`screencapture` → "could not create image": no
  Screen Recording permission). Workaround that tests the real UI: headless Chrome via CDP on the
  Vite dev URL with `window.__TAURI_INTERNALS__.invoke` mocked to return the live `/health` body.
