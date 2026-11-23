# NO SILENT STUCK TASKS — wiki

- **One stop path.** Every "this can't go on" case (same review note twice, two send-backs with no new commit, a
  checkout that can't build) uses the same exit: the item goes back to the orchestrator as `todo` (waiting for a new
  owner, on the same branch — never failed) plus one `stuck` stall alert saying why. New cases should reuse it.
- **Notes belong to an owner and a moment.** A requeue, handover or fresh reopen voids the old owner's waiting
  `tell_agent` notes; a resumed session is told earlier notes no longer apply. Otherwise stale instructions win.
- **"Restart fresh" never loses work.** The old checkout's unmerged commits are kept on `<branch>-before-restart-<n>`
  before the item builds again from main's tip.
- **Progress is measured by commits, not words.** Reviews record the branch head they saw; a rework that moved
  nothing is an empty try.
- **Preflight checks only what's local and certain.** git repo + tools on PATH. A remote reachability check was
  dropped: offline would block every build, and builders only push when asked.
- **Pure rules, I/O at the edge.** `preflightProblems`, `emptyTries`, `repeatedNote` are pure and unit tested;
  dispatch only gathers facts and acts.
