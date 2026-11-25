# Menu bar studio & clean quit — what we learned

- **Find processes by tag, not by parent.** Agent programs double-fork, use nohup and get re-parented to
  launchd, so a parent pid or process group misses them. An environment variable is inherited through all of
  that. Tag every child with `AI_STUDIO_OWNER=<data dir key>` and sweep by the tag.
- **The data lock makes the tag enough.** One backend per data dir means anything carrying its key is ours.
  A boot id or a ledger file adds nothing, and the same sweep handles both quit and a crash's leftovers.
- **Pick again on every read.** TERM, wait, read the table again, then KILL only what is still tagged. A reused
  pid no longer carries the tag, so the sweep never hits a stranger.
- **`ps -E` shows its own environment.** If the reader inherits the tag, every sweep finds it. Run `ps`
  without the tag.
- **`ps -E` hides the environment of Apple's own binaries** (`sh`, `sleep`). So also take the group and the
  descendants of each tagged process.
- **macOS-opened apps carry no tag** (`open` hands them to launchd). Write the bundle path to
  `opened-apps.json` *before* opening, then sweep processes running from `<bundle>/Contents/MacOS/`.
- **Things meant to outlive the studio leave the tag out on purpose.** The self-installer is spawned with
  `withoutOwnerTag`.
- **Budget the quit against the app's hard kill** (5 s): graceful close gets 3 s, the sweep gets 1 s, then the
  db closes. Await the waits; never use unref'd timers that die with the process.
