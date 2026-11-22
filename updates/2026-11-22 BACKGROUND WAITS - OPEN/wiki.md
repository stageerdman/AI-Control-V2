# BACKGROUND WAITS — wiki

- **The CLI wakes the model itself** when a background command ends, even after stdin is closed. Keeping the
  process alive is all it takes. Never write to stdin to wake it.
- **Live background commands** come as `{"type":"system","subtype":"background_tasks_changed","tasks":[{task_id,
  description}]}`. `[]` means none are left.
- **The woken reply is a `result` with `origin.kind: "task-notification"`.** It counts as the answer only after
  `awaitWake()`. Otherwise it stays a notice (F3: "the test server stopped...").
- **Two conditions to wait:** commands still running AND waiting words in the answer. A server left running
  with a "done" answer is still stopped after 10 s (F3).
- **The timeout text must start with `Stopped: waited ... for its background command`.** `limits.ts` STUCK
  matches it, so the stall reaches Pixel as "stuck".
- **Tune it with `CliOptions.backgroundWaitMs`** (default 45 min). Tests use a few hundred ms.
- **Requeue only through `requeuePatch`** (crew/requeue.ts, via dispatch `requeue()`). Failed in review or merge
  goes back to the builder with counts reset. Re-running the reviewer fails it again at once.
- **A carry-on must restate the brief.** The session holds the brief it started with; edits only reach the
  agent through `carryOnTask`'s "Your brief now" line.
- **`stopped` ≠ `cancelled`.** stop_work (`cancelAll`) → `stopped`, resumable; a hand cancel → `cancelled`. Use
  `resumable(status)`, never `=== 'failed'`.
- **Never write a status read before an `await`.** Between picking an item and its run starting, it can be
  stopped and queued again; write the status read now (`recordWorkspace`) and let `preparing` / `closing`
  hold the item until the checkout is made or put away.
