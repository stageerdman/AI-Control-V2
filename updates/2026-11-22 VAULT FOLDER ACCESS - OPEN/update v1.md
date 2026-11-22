# Vault folder access — update v1

> **Superseded in part by `update v2.md`:** the app's own data folder no longer goes through the vault
> (no entry, no switch, no on-start offer, no `POST /projects/:id/app-data-access`). The rest stands.

**Goal:** Pensieve agents can read and write the Pensieve Mac app's data folder
(`~/Library/Application Support/<bundle id>/`: the vault with `raw/<id>.json`
batch records and the processed outputs) once the user grants it in the Access Vault.
Nothing outside the project folder opens up unless it is granted.

## Phase 1: why agents were refused (done)

### The cause, in plain words

Two locks stop it, and **both** have the same key:

1. **The file tools' folder limit.** Every agent runs `claude -p --restricted`
   (`server/src/runtime/claude-cli.ts`). With `--restricted`, Read, Glob, Grep, Edit
   and Write only work inside the run's working folder (the project checkout) plus any
   `--add-dir` folders. The only `--add-dir` the studio ever passes is a toolsmith's
   own toolkit folder (`service.ts`: `addDirs: [toolkit.dir]`). So the vault is
   outside every agent's reach. Seen first-hand: Glob on `~/dev` from this checkout
   returns "outside … --restricted confines the file tools to the working directory".
2. **The shell's path check.** `ls`, `cat` and `mkdir` are on the allow-list
   (`AGENT_SHELL.dev`, `config.ts`), but Claude Code still checks the paths these
   commands touch against the same working folders. In `dontAsk` mode a path outside
   is refused with no prompt. Seen first-hand: `ls /Users/stage/.ai-studio` was refused
   in this run, even though `Bash(ls *)` is allowed. Our own PreToolUse shell hook
   (`shell-hook.ts`) doesn't cause this: it only rules on `NAME=value` prefixes and Mac
   build tools, and gives no answer for anything else.

The allow-list itself (which commands may run) is **not** the blocker for reading and
writing: Read/Write/Edit plus `ls`/`cat`/`mkdir` cover it once the folder counts as a
working folder. `cp` isn't on the list, so a backup is made with the file tools or a
small `node` script inside the granted folder.

3. **The Access Vault can't express it yet.** An access today is a set of env-var
   fields, written into the project's `.env` (`secrets/projectAccess.ts`). There is no
   "folder" kind, so granting a folder had nowhere to go.

### Bundle id

Not found yet. This checkout (and the orchestrator's) can't open the Pensieve project
folder, which is the same lock. Pensieve looks like a Tauri app (npm/vitest,
`src/lib/...`, a phone web build), so the id is most likely the `identifier` in
`src-tauri/tauri.conf.json`. The fix **reads it from the project's own files** when the
access is granted. Nothing is hard-coded.

## Phase 2: the fix (built)

What shipped, and where it differs from the plan below:

- **Folder access** = an access with a `folder` (migration 49, `accesses.folder`, unique). Read and write
  only, as the brief asked; the read-only mode is left out until someone needs it. It may have no fields.
- **Guard** `secrets/folderAccess.ts`: `checkFolder` on save (absolute; not Application Support or any
  folder above it; not overlapping the studio's data dir, sandbox or global secrets: 422), `liveFolder` on
  each run start (real path after symlinks, same rules, missing = not passed).
- **Runs**: `projectAccess.foldersFor` → `service.ts addDirsNow()` → `--add-dir`, read again for every fresh
  session. A folder shared mid-run is a 'restart' notice (it joins only when a session starts).
- **Backups**: the studio tool `backup_folder` copies a path inside a shared folder (symlinks followed;
  outside or nothing shared is refused) to `<data>/backups/<project>/<stamp>-<name>`. It replaces the plan's
  "backup inside the project", because that would put app data into the project's git.
- **Bundle id** `secrets/bundleId.ts`: Tauri v2/v1 `identifier`, then Xcode `PRODUCT_BUNDLE_IDENTIFIER`
  (test targets and `$(…)` left out). No Info.plist step: Tauri and Xcode cover it. None or several → 409
  naming the files.
- **Entry**: `POST /projects/:id/app-data-access` adds `<Name> app data` for
  `~/Library/Application Support/<bundle id>`, not granted; calling it again returns the existing one
  (201 / 200). The user shares it in the project's safe.
- **No step by hand (fix after review).** Nothing in the app called that endpoint, so the Pensieve folder
  only appeared if someone sent the request by hand. Now the studio offers it itself on every start
  (`projectAccess.offerAppDataFolders`, called in `app.ts`): each project with exactly one bundle id gets its
  `<Name> app data` entry, not shared. Projects that aren't Mac apps (409) are skipped; anything else is logged
  with the project id. The user's only step: flip the switch beside it in Pensieve's safe.
- **UI**: the cabinet row and the safe show "Folder · read and write: <path>"; the editor saves a folder
  access with no fields.
- **Tests**: `server/test/secrets/folder-access.test.ts` (guard, bundle id, backups inside/outside/before
  shared, the endpoint, `--add-dir` only after the grant), `app/src/features/access/access.test.tsx`.

### The plan as written

One key for both locks: **a granted folder becomes an extra working folder of the run (`--add-dir`).**

- **Folder access in the vault.** Add a `folder` kind of access that holds an absolute
  path and the mode (read, or read+write). Grant it per project like any access, using
  the same grants table and Access sheet.
- **Pass it to the run.** `runtime/service.ts` `start()` adds each granted folder that
  exists to `spec.addDirs` (beside the toolkit dir). `cliArgs` already turns `addDirs`
  into `--add-dir`. This lifts the file tools' limit and the shell's path check together.
- **Read-only means read-only.** For a read grant, add `Edit(<dir>/**)` and
  `Write(<dir>/**)` to the denied tools, so only reading is allowed.
- **Tell the agent.** The prompt's access section lists the granted folder, its mode,
  and "make a backup inside the project before changing anything" (the
  `composePrompt` access line).
- **Path guard (pure, tested).** Accept only an absolute, existing directory after
  following symlinks. Refuse `/`, the home folder itself, `~/Library` as a whole,
  and any folder that contains the studio's data dir or sandbox root. This is a new
  small module, `secrets/folderAccess.ts`.
- **Bundle-id lookup (pure, tested).** Given the project folder, look in this order:
  `src-tauri/tauri.conf.json` `identifier`, the Xcode `PRODUCT_BUNDLE_IDENTIFIER`,
  then `Info.plist` `CFBundleIdentifier`. Return exactly one id, or an error that
  says none or several were found. It fills in the suggested path
  `~/Library/Application Support/<id>/`, and the user confirms it on grant.
- **Tests:** the path guard, the bundle-id lookup, `cliArgs` gets `--add-dir` for a
  granted folder (and none when it isn't granted), and read-only adds the deny rules.

### Risks

- If Pensieve is a **sandboxed** Mac app, its data lives in
  `~/Library/Containers/<id>/Data/Library/Application Support/` instead. macOS (App
  Data protection) may then block even the studio process. Check the real path once
  the id is known.
- Write access to a live app's data: the Mac app must be quit, or at least not
  processing, while an agent changes batch statuses.
