# VAULT FOLDER ACCESS — wiki

- **`--add-dir` is the one key.** Under `--restricted`, it opens both the file tools and the shell's path check
  to a folder. The studio passes only the toolkit dir and the granted folders (`service.ts addDirsNow`).
- **Pass the real path.** `liveFolder` resolves symlinks at each session start and checks the result again, so a
  link swapped in later can't widen a grant. A folder that doesn't exist yet is simply left out.
- **Folders join at session start only.** A folder shared mid-run gets a 'restart' notice; the fresh session
  (forget / carry-on) reads the grants again.
- **Backups live in the studio's data dir**, not the project, so app data never lands in git. Agents get the
  path back and pass it on to the user.
- **The bundle id comes from the project's own files** (Tauri config, then Xcode). Never guess it.
- **Sandboxed Mac apps** keep their data in `~/Library/Containers/<id>/…`, not Application Support. Check the
  real path before you grant one.
