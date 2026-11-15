# Why the Spotlight-opened AI Studio was stale (2026-11-15)

## What was wrong
1. **The installer never ran.** It only ran on an `item.merged` event, and only a backend that *already had*
   the trigger code could react to one. The trigger (a309331), the brand stamp (13c5ed4) and History (f39c479)
   were all merged while the old backend was running. Restarting the app loaded the new backend, but a restart
   isn't a merge, so nothing installed. /Applications kept the build from before all three. That's why there's
   no History button and no commit when you hover the brand.
2. **The build would likely fail even when it ran.** An app opened from Spotlight gives its backend a bare PATH.
   The app adds Homebrew, but not rustup's `~/.cargo/bin`, so `tauri build` couldn't find `cargo`.

## What changed
- **Catch up on start.** After a good install, the installer writes `~/.ai-studio/installed-build.json`
  `{commit, target, at}`. When the backend starts (main checkout, macOS only), it compares that file with
  `git rev-parse HEAD`. If the file is missing or names another commit, it installs right away. A merge that
  lands while no backend is watching is now caught up on the next start instead of being lost.
- **Build PATH.** The installer puts `~/.cargo/bin`, `/opt/homebrew/bin` and `/usr/local/bin` first. It checks
  `cargo --version` before building, so a missing toolchain shows up as one clear `failed` log line.
- **Worktree backends don't try.** Self-install only turns on when the backend runs from the main checkout
  (its `.git` is a folder).
- Tests: `server/test/self-install` (catch-up on start, marker states, a staleness check that throws) and
  `app/scripts/install-mac/plan.test.mjs` (build PATH).

## Getting the Mac current (once this is merged)
The backend running now is older than this fix. Quit AI Studio (⌘Q) and open it again. On start it sees that
the install marker is missing and builds in the background (a few minutes). Watch for the `done` line, with its
commit, in `~/.ai-studio/logs/self-install.log`. Then quit and reopen once more, because the app you have open
keeps running the old build. Hovering the brand should now show that commit. Or run
`npm --prefix app run install:mac` by hand in `~/dev/AI-Control-V2`.

## Not checked live
This agent can only work inside its own worktree. It couldn't read `~/.ai-studio/logs`, look inside
/Applications, or run the installer from the main checkout, so the diagnosis comes from the code and the commit
timeline. Cause 2 is the likely one (rustup's default location), but I couldn't confirm it on this Mac. If an
install still fails, the log's `failed` line names the step.
