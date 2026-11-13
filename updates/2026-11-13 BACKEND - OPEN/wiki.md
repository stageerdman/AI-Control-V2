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
- **Scaffold = add-only, preflight first.** Resolve every target through the sandbox guard before
  writing anything, create with `wx` (fails on an existing file or a dangling symlink), and count
  symlinks as "present" (never follow one to write). Then the same code is safe for new and adopt,
  and a second run is a no-op by construction.
- **Commit exactly what you added.** `git add -- <paths>` + `git commit --only -- <paths>` leaves the
  user's own staged/dirty work alone in an adopted repo.
- **Filesystem work inside the db transaction, last.** Running the (sync) scaffold as the final step of
  `store.tx` means any failure rolls back the record; the only manual cleanup is removing a folder we created.

### Secrets & access (B3)
- **Values in one file, metadata in the db.** The db never holds a value (only `has_value` +
  last-4), so a db file, backup or restore snapshot can't leak one. Consequence: credential
  delete is not undoable — an undo snapshot would have to keep the value.
- **Do the file write inside the db transaction.** If the `.env` write throws, the metadata
  rolls back; the two stores can't disagree after a failure.
- **Own a managed block, not the whole file.** The project `.env` sync rewrites only its marked
  block: ungranting removes the key on the next sync, hand-written lines stay.
- **Leak tests use canaries and check every channel.** Random values through every endpoint
  and error path; assert neither the value nor its non-last-4 part shows in bodies, headers,
  trace-level logs or the sqlite bytes (WAL included). Mutation-check the test (log `req.body`)
  so it's known to bite.
- **Body-parser messages can echo input.** V8's `JSON.parse` errors quote the body; Fastify 5
  already swaps in a fixed message — keep it that way (tested).
- **No last-4 for short values** (< 12 chars): 4 of 8 characters gives too much away.
- **SSE without gaps: subscribe first, then replay.** Hold live events while the backlog is written,
  then drop anything at or below the last id sent. Monotonic AUTOINCREMENT ids make Last-Event-ID resume exact.
- **Long work must yield to stream.** A sync scaffold (execFileSync) blocks the event loop, so nothing
  reaches the wire until it ends. Async git + a `setImmediate` between steps lets SSE flush live. Keep the
  db transaction out of the awaits: validate with a rolled-back dry run, do the slow work, then one short tx.
- **A local server needs Origin enforcement, not just CORS headers.** CORS only stops a page reading the
  answer; the request still runs. Refuse unknown Origins with 403 so no web page can drive the file system.
- **Dangling symlinks are escapes too.** Writing through one creates its target — the guard follows it.

## Claude Code CLI (2.1.322) for headless agents — findings
- **Isolation flags:** `--restricted` (ignores user/project/local settings → no personal plugins or hooks;
  confines file tools to cwd; Bash only if `--tools` names it), `--strict-mcp-config` + `--mcp-config`
  (only our server), `--disable-slash-commands` (skills off), `--no-chrome`. Verified on the live init line:
  plugins built-in only, skills/slash commands empty, `apiKeySource: none`.
- **Don't use `--bare`:** it skips CLAUDE.md discovery and only accepts ANTHROPIC_API_KEY — the user wants
  the Claude Code login. Also never pass ANTHROPIC_API_KEY & co. into the run env (a project grant would
  silently switch billing to the key).
- **Permissions:** `--permission-mode dontAsk` + `--permission-prompts none` + `--allowed-tools` patterns
  (`Bash(git *)`…). A compound command is denied if ANY part isn't allowed (`printf … > f && git …`), so
  tell the agent to run one plain command at a time and to write files with Write/Edit. The model handles a
  denial gracefully (switched to Write, then asked the user).
- **Caps:** `--max-budget-usd` exists; there is no max-turns flag — count assistant messages (dedupe by
  message id: one message streams as several lines with the same usage) and stop the process group.
- **Sessions:** `--session-id <uuid>` lets us pick the id up front (= runId); `--resume <id>` continues.
- **Stream-json input:** send one `{type:'user', message:{role:'user', content}}` line, keep stdin open until
  the `result` message, then close it so the CLI exits — detect it by PARSING (`type === 'result'`); the real
  line starts with other keys (`{"duration_api_ms":…`), so sniffing `^{"type":"result"` leaves the CLI waiting forever.
- **The shell alias trap:** spawn the resolved binary path, never `claude` via a shell — the user's alias adds
  a personal `--plugin-dir`.
- **One backend per port:** the Tauri app launches (or reuses) its own backend on :4319; a dev server started
  next to it fails with EADDRINUSE and requests silently go to the app's backend.
- **Resume works as advertised:** `--resume <session>` with a new task continued the interrupted conversation
  (it remembered hello.txt) and cost $0.14 for 3 turns, mostly cache reads.
- **Record real streams as fixtures.** Both bugs we hit (key order, interrupted host) were invisible in
  hand-written fixtures; the recorded ones now replay in tests.

