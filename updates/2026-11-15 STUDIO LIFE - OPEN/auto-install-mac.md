# Auto-install the newest AI Studio build on the Mac (2026-11-15)

## How it works
1. An item is accepted and the studio merges it into master in the main checkout (`~/dev/AI-Control-V2`).
2. The backend sees the `item.merged` event. If the project's folder is the same checkout the backend runs
   from, it starts the installer: `node app/scripts/install-mac/main.mjs`
   (`server/src/self-install/self-install.ts`).
3. The installer:
   - runs `npm install` in `app/` and `server/` only if a lockfile changed,
   - builds the app (`npm run build`, i.e. `tauri build`),
   - deletes the old `/Applications/AI Studio.app` and **moves** the new bundle into its place. Moving means
     the build output folder doesn't keep a second copy.
   - finds every other copy by its bundle id (`mdfind kMDItemCFBundleIdentifier == "xyz.erdman.aistudio"`, plus
     `~/Applications`) and removes it from Launch Services and from disk,
   - registers the installed copy (`lsregister -f`) and asks Spotlight to re-index it (`mdimport`).
4. Spotlight → "AI Studio" now opens the one copy in /Applications, which is the newest build.

## What runs it
- **Automatically:** the AI Studio backend, after every merge into the AI Studio project. Only on macOS.
  Set `AI_STUDIO_SELF_INSTALL=0` to turn it off.
- **By hand:** `npm --prefix app run install:mac` from the main checkout.
- Only one install runs at a time. If more merges land during an install, they add one more run at the end.
- It runs in the background and in its own process group, so quitting the app never cuts off a build.
- Log: `~/.ai-studio/logs/self-install.log`. There is one JSON line per step, all sharing a trace id, and the last
  line is `done` or `failed`.

## Things to know
- **If the app is open during an install,** it keeps running the old build until you quit it (⌘Q) and reopen it.
  The installer doesn't quit it for you, because quitting stops the backend and every agent that's running.
  Next step: show "New build installed — Restart" in the app.
- **It only runs from the main checkout.** The installed app has this checkout's `server/` path built in, and a
  worktree is deleted after its merge. From a worktree, the installer stops with a clear error.
- **The first time:** the backend that's running now was started before this merge, so it doesn't have the
  trigger yet. Restart the app once, or run `npm --prefix app run install:mac`, and every merge after that
  installs on its own.
- **Not checked live yet:** the agent that built this can only work inside its own checkout, so the build, the
  copy into /Applications and the Spotlight search were never run on the Mac. Tests cover the trigger
  (`server/test/self-install`) and the install plan (`app/scripts/install-mac/plan.test.mjs`).
