# VAULT FOLDER ACCESS — wiki

- **`--add-dir` is the one key.** Under `--restricted`, it opens both the file tools and the shell's path check
  to a folder. The studio passes only the toolkit dir, the app's own data folder and the granted folders
  (`service.ts addDirsNow` ← `projectAccess.foldersFor`).
- **Pass the real path.** `liveFolder` resolves symlinks at each session start and checks the result again, so a
  link swapped in later can't widen a grant. A folder that doesn't exist yet is simply left out.
- **Folders join at session start only.** A folder shared mid-run gets a 'restart' notice; the fresh session
  (forget / carry-on) reads the grants again.
- **Backups live in the studio's data dir**, not the project, so app data never lands in git. Agents get the
  path back and pass it on to the user.
- **An app's own data folder is not a vault access** (the user's decision, v2). A Mac app project's agents
  always get `~/Library/Application Support/<bundle id>`, found again at each session start
  (`secrets/ownAppData.ts`): no entry, no switch, no startup step. The vault keeps folder accesses only for
  other folders the user adds by hand. v1's on-start offer was a step the user should never have had.
- **Same guard either way.** The own folder must be one plain name under Application Support, exist, and pass
  `liveFolder` (real path, not too broad, no overlap with the studio).
- **Tests never touch the real home**: `testApp` gives every app a temp `userHome` by default.
- **The bundle id comes from the project's own files** (Tauri config, then Xcode). Never guess it.
- **Sandboxed Mac apps** keep their data in `~/Library/Containers/<id>/…`, not Application Support. Check the
  real path before you grant one.
