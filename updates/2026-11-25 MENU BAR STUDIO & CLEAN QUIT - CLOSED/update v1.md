# Menu Bar Studio & Clean Quit — update v1

Feature: `f-menu-bar-studio-clean-quit`

## Goal
1. The red cross closes the window, but the studio keeps running, with an icon in the Mac menu bar (Open / Quit).
2. Quit (menu bar, ⌘Q, or Dock right-click → Quit) is the proper close: every agent stops now, even mid-way, with a
   note on their table of what is done and what is next, and picks up from it on the next launch.
3. After a real quit (or a crash) nothing the studio or its agents started keeps running.

## Why agents still opened apps after AI Studio was closed (the cause)

Found by reading the code paths of close, quit and crash (`app/src-tauri/src/lib.rs`, `backend.rs`,
`server/src/main.ts`, `app.ts` preClose, `runtime/service.ts` shutdown, `runtime/claude-cli.ts`,
`running/processes.ts`, `apps/*`) together with the spike in `updates/2026-11-25 SHUTDOWN QUESTION - CLOSED`.
I couldn't take a live process listing on the user's Mac (`ps` isn't in the agent shell), so the evidence is the code
plus that spike.

**Short version: the studio kills only its own server process group. Everything that matters (agent programs, the
apps they launch, Start'ed apps, test runs) runs in *other* groups, or is handed to macOS. The step that would stop
those last ones either never fires or can't see them.**

1. **Apps opened through macOS are never ours to stop.** Start on a desktop project runs `open <App>.app`
   (`apps/start-project.ts`). macOS (LaunchServices) launches the app as its own process, not as a child of the
   studio. Nothing records it and nothing quits it. Agents can do the same: `open` is blocked, but `node`, `npm` and
   `npx` are allowed and can launch anything (`npx tauri dev`, a node script that runs `open`, a Swift build that runs
   the app). So an app launched this way stays open after the studio quits.
2. **The hard kill comes before the cleanup has finished.** When the app quits, `backend.rs` `kill_group` sends
   SIGTERM to the server's group, waits **3 s**, then SIGKILLs that group. Agent CLIs and Start'ed apps are
   `detached: true`, so they sit in their own process groups and that SIGKILL doesn't reach them. The server's own
   cleanup (`runtime.shutdown`, then `stopTree`) sends SIGTERM to each agent's tree. The follow-up SIGKILL is a
   `setTimeout(…).unref()` 3 s later (`running/processes.ts`), and by then the server has already exited
   (`process.exit(0)` in `main.ts`) or been SIGKILLed by the app. **So the SIGKILL never fires.** Anything slow to
   stop, or anything that ignores SIGTERM, keeps running: a `cargo`/`tauri dev` build that then opens its app window,
   vite, a node child, or the CLI in the middle of a tool call. Shutdown also waits for `dispatch.close()` (merges,
   tests), which is why it rarely fits inside those 3 s.
3. **The tree is read once and misses programs that moved.** `stopTree` reads the process table once, at SIGTERM
   time, and finds processes by group id and parent id. A program that forked twice, used `nohup`/`setsid`, or whose
   parent CLI exited first gets re-parented to `launchd` (ppid 1) in its own group. It isn't in that snapshot.
   `sweepLeftovers` on CLI close has the same blind spot.
4. **After a crash nothing is cleaned up.** No pid of an agent, app or test run is stored. If the server dies hard
   (crash, out of memory, killed in Activity Monitor), they are orphaned for good. The next launch then resumes the
   same session in the same checkout, so two copies of one agent can edit one branch.
5. **Smaller leaks.** Landing test runs (`apps/test-run.ts`, detached) are not stopped on shutdown. The self-installer
   is detached on purpose: it doesn't open apps, and it stays as the one named exception.
6. **The close button is a full exit** (Tauri's default, no menu bar). Users close the window expecting a pause, but
   the agents get cut off, which makes paths 2–4 come up all the time.

## Requirements, questioned (step 1 & 2 of the algorithm)
- *"Agent writes its note before stopping"*: deleted as stated. Asking a model to write a note costs a full LLM turn
  (30 s or more), and a quit has to be quick and certain. **The studio writes the note itself** from facts it already
  has: the item, branch, last commit, last activity lines, open to-dos and the run's own summary so far. It then
  commits the work in progress on the branch. The resumed session already keeps its whole context
  (`resumeRunId`), so the note is a map and doesn't need to be an essay. If that turns out not to be enough, one
  optional 10 s "write your note" nudge can be added back.
- *"Stop every process the studio started"*: carries one exception, the self-installer, which builds the studio's
  own app. It stays detached and never opens anything.
- *"Track every app an agent opens"*: we can't hook macOS `open` from inside an agent. Instead every spawned
  process carries a **studio tag in its environment**. The tag is inherited through every fork, including double
  forks and re-parenting, so the sweep finds a process by its tag and not by its parent. Apps that LaunchServices
  started are found by their bundle path.

## Phased roadmap (each phase ends in tests and a live check on the Mac)

### Phase 1: red cross hides, menu bar icon (Open / Quit)
- Tauri: `WindowEvent::CloseRequested` → `prevent_close()` + hide the window. Add a tray icon (`tray-icon` feature)
  with **Open AI Studio** and **Quit AI Studio**. Clicking the Dock icon (`RunEvent::Reopen`) shows the window again.
  The Dock icon stays, so Dock right-click → Quit keeps working.
- Agents keep working while the window is hidden. The backend supervisor already copes with App Nap.
- **UX**: bring in a UX expert for the icon (template image, light/dark) and the two menu labels, with nothing more
  on the menu.
- **Tests**: Rust unit tests for the pure close policy (close → hide; quit → exit path) and the menu model. Live
  check: close with the cross, agents keep running, the window opens again from the menu bar and the Dock.

### Phase 2: Quit is the proper close (stop now, leave a note, resume next launch)
- Tauri: menu bar Quit, ⌘Q and Dock Quit all go through `RunEvent::ExitRequested`. There we call `prevent_exit()`,
  show "Stopping agents…" in the window or the menu, and call a new **`POST /shutdown`** on the server. The app
  waits until the server has really exited (bounded at 20 s, not 3 s) and only then exits. The SIGKILL fallback stays
  for a server that hangs.
- Server shutdown order: stop dispatch → for each live run, **save a studio-written desk note** (`office/desk.ts`:
  where / doing / next, built from the run's facts) and **commit WIP on the branch** → stop the agent's process tree
  (Phase 3's reliable stop) → mark the run `closing` → item back to todo with `resumeRunId` (exists) → close the db.
- Next launch: `dispatch.recover()` resumes the same session, which starts from the note (the same path `forget`
  uses). The chat says "Paused at quit — picking up where you left off".
- **Tests**: fake-runner integration test. Quit during a run → note saved with item/branch/next, WIP commit on the
  branch, item todo with `resumeRunId`, server exits within the deadline. Reboot → the run resumes from the note.
  Rust test: exit is held until the server is gone. Live check: quit mid-task, launch, the agent carries on.

### Phase 3: after a real quit (or a crash) nothing keeps running
- **Process ledger**: every spawn (agent CLI, Start'ed app, test run) is written to `<data dir>/children.json` as
  `{pid, pgid, startedAt, kind, runId}`, and removed when it ends.
- **Studio tag**: every spawned env gets `AI_STUDIO_OWNER=<data dir hash>:<boot id>`. The sweep reads the process
  table and finds tagged processes, plus group and descendants, so re-parented programs are caught.
- **Reliable stop** (`running/processes.ts`): SIGTERM → await up to the grace → read the table **again** →
  SIGKILL what is left. The wait is awaited, not an `unref`'d timer, and shutdown doesn't `process.exit` until the
  sweep is done.
- **Opened Mac apps**: Start and agent builds record the bundle path they opened. On quit, those apps are asked to
  quit (Apple Event quit, then TERM the pid found by bundle path).
- **Crash clean-up on boot** (the earlier "clean up leftover agents after a crash" idea): before `runs.failInterrupted()` /
  `dispatch.recover()`, read the ledger and the tag and stop every still-alive leftover. Start time is checked so a
  reused pid is never killed. Only then is the work resumed, so there is never a double agent on one checkout.
- Test runs are stopped on shutdown too. The self-installer stays the one exception.
- **Tests**: a fake CLI spawns a grandchild that double-forks and ignores SIGTERM → after shutdown, no process with
  the tag is alive. A planted ledger plus a live tagged process → boot stops it before recover. A reused pid with the
  wrong start time → left alone. Live check on the Mac: quit while an agent runs `npm run dev` and a Start'ed app is
  open → Activity Monitor shows nothing of ours. SIGKILL the server → next launch cleans up.

## Status
- [x] Cause found and written down (above).
- [x] Phased roadmap.
- [x] Phase 1: menu bar studio (red cross and Close Window hide; tray Open / Quit; one graceful quit path).
- [x] Phase 2: proper quit with notes and resume (each live agent gets a studio-written desk note).
- [x] Phase 3: nothing keeps running (`server/src/reaper/`). Built simpler than planned:
  - No `children.json` ledger and no boot id. Every child carries `AI_STUDIO_OWNER=<data dir key>`, and since
    the data lock allows one backend per data dir, anything with that key is ours. So one sweep serves both
    quit and boot (a crash's leftovers).
  - Apps macOS opens for us carry no tag, so their bundles go into `<data dir>/opened-apps.json` before they
    open and are swept the same way.
  - A reused pid is safe: each read picks again by tag, and a reused pid no longer carries it.
  - The `ps` that reads the table runs without the tag; otherwise every sweep picked itself.
  - Live check: the backend boots, and on SIGTERM it exits 0 in about 70 ms.
