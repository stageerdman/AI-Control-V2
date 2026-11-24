# Vault folder access — update v3: global or per-project, read or read/write

**Goal:** the user adds any outside folder to the Access Vault, either for every project (global) or for one
project only (local), as read-only or read and write. Once it is switched on for a project, every agent run
there can reach that folder, and only in the mode it was given. A folder that isn't switched on stays blocked.

Builds on v1/v2: folder accesses already exist (read and write only, always global), and they reach runs
through `projectAccess.foldersFor` → `service.ts addDirsNow` → `--add-dir`, the same path the Mac app's own
data folder uses. The live-access path already tells working agents to restart when a folder is shared.

## Phase 1: the data model (server)

- Migration 55: `accesses.folder_mode` (`'read' | 'write'`, existing rows stay `'write'`) and
  `accesses.local_to` (a project id, `NULL` = global; deleted with its project). The folder must be unique per
  scope: the same folder may be global once and local once per project, never twice in the same scope.
- `Access` gains `folderMode` and `localTo`.
- The guard (`checkFolder`) also asks that the folder **exists and is a folder** when it is saved. It still
  checks the real path (symlinks followed) and refuses `/`, the home folder, `~/Library`, Application Support
  and the studio's own folders.
- **Tests:** the guard refuses a missing path and a file; the migration keeps old rows as read and write.

## Phase 2: scope and switches

- Global: listed in every project's Vault (`GET /projects/:id/access`), off by default, switched on per
  project with the existing grant routes.
- Local: `POST /projects/:id/accesses` creates it for that project only, switched on at once (the user added
  it there to use it; it can be switched off). No other project lists it, and switching it on from another
  project is refused (422, as for an unknown access, so its existence isn't revealed).
- `GET /accesses` (the Vault overview) still lists everything; each entry carries `localTo` so the app can
  show where it lives.
- **Tests:** global vs local visibility, switch on and off, another project can't switch a local one on.

## Phase 3: read-only really is read-only

- `foldersFor` returns `{ path, write }` per folder (real paths). The run gets every folder as `--add-dir`,
  and a read-only one also as a deny rule for every file-editing tool (`Edit(//<path>/**)`): deny rules beat
  any allow. Claude Code's shell path check uses the same Edit rules for commands that write (`mkdir` …).
- The prompt and the live-access notice name the mode ("read only" / "read and write"); `backup_folder`
  points only at writable folders.
- **Tests:** a read-only folder reaches the CLI as `--add-dir` plus the Edit deny rule; a read/write folder
  has no deny rule; a folder that isn't switched on reaches no run.

## Phase 4: notes

- This file's status, the wiki, the feature lines.

## Status

- Phases 1–3 landed (server). `test/secrets/folder-scope.test.ts`: global vs local visibility, switch on/off,
  read-only deny rule vs read/write none, the projects folder read-only only, path checks (missing, file,
  home root, `/`, symlink to the home root, relative). Full suite passes.
- Live check with the real CLI (`spike-readonly.mjs`, haiku, a read-only `--add-dir`): `Read` and `ls` work;
  the `Write` tool, `touch`, `echo >` and `mkdir` are all denied; `.env` is refused to both `Read` and
  `cat`. One `Edit(//dir/**)` rule is enough — the CLI ignores a `Write(path)` rule and says so, so the
  studio no longer passes one.
- Still open: the Vault screen (mode picker, "this project only" switch) — the client side.
- Phase 4 is this section, the wiki and the feature lines.

## Risks

- `node` and `npm` scripts aren't path-checked by Claude Code: a script can read or write outside the granted
  folders, read-only ones included. This is not new (it holds for the whole disk today); the file tools and
  the checked shell commands are what the modes govern.
- Agents pick up a newly switched-on folder at their next session start (the existing 'restart' notice).
