# One AI Studio on the Mac: the clean-up script (2026-11-15)

## Run it (in Terminal, with AI Studio quit)
```
node ~/dev/AI-Control-V2/app/scripts/clean-mac/main.mjs
```
Add `--dry-run` to only see the list. It:
1. Looks everywhere for copies: /Applications, ~/Applications, ~/Downloads, ~/Desktop, the build folders
   (`~/.cargo-shared-target`, `app/src-tauri/target`, release and debug, .app and .dmg), mounted disk images
   in /Volumes, what Spotlight has indexed (by bundle id `xyz.erdman.aistudio` and by name), and what Launch
   Services still has registered (including entries whose file is gone).
2. Shows the numbered list with what it will do to each one, then asks you to type `yes`. Anything else stops,
   and nothing changes.
3. Fast-forwards master from GitHub if GitHub is ahead, then builds the app.
4. Moves old copies to the Trash (never deletes them), ejects mounted images, and unregisters missing entries.
   It installs the new build at /Applications/AI Studio.app, then refreshes Launch Services and Spotlight.
5. Prints what it removed, where the new app is, **Built from** next to **Latest master**, **MATCH/MISMATCH**,
   and whether Spotlight now lists only the new app. Details go to `~/.ai-studio/logs/clean-mac.log`.

It stops before changing anything if AI Studio is open, the checkout isn't on master, or cargo is missing.

## Checked on this Mac (read-only, 2026-11-15 20:4x)
- The auto-install did run: `~/.ai-studio/installed-build.json` holds `16004e1`, which is latest master.
  The last `done` line of `self-install.log` has the same commit.
- `mdfind` (by bundle id and by name) and `lsregister -dump` list only `/Applications/AI Studio.app`.
  There are no AI Studio copies in ~/Downloads and no mounted images. The dry run found 1 copy: the installed one.

## Auto-rebuild: the gap that's now closed
The backend's start-up check trusted the marker alone. If the app was trashed after an install, the marker
still named HEAD, so the backend never reinstalled it. Now the app also counts as behind when the marker's
`target` is gone. The auto-installer uses the same wider search as the clean-up (name and Launch Services
ghosts, not just the bundle id). Both share `app/scripts/install-mac/steps.mjs` and `copies.mjs`.
