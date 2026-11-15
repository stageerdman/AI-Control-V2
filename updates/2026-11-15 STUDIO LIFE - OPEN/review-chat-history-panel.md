# Review — History in the agent chat panel

Reviewer: Health Analyst (The Founders) · 2026-11-15
Scope: what changed against `master` in `Panel.tsx`, `ChatHistorySheet.tsx`, `chat-history.css`, `OfficePage.tsx`, and the new `Panel.history.test.tsx`.

## Checks

| Check | Result |
|---|---|
| Whole app test suite | ✅ 39 files, 385 tests pass (`npm --prefix app test`) |
| Typecheck | ✅ `tsc --noEmit` clean |
| Lint on the changed files | ✅ clean. `npm run lint` still fails, but only in older files (`rebuild/*`, `api/types.ts`). This change didn't cause those. |
| No new endpoints or data shapes | ✅ uses only the existing `listAgentChats` and `getChatMessages`, plus the `ChatSummary` type. `api.ts` and the server are unchanged. `PanelView` is a UI-only type. |
| Live view polls and sends as on master | ✅ the thread query, `send`, `answer`, the composer, and the Esc → director shortcut are unchanged. They are only re-indented under `view === 'live'`. Polling is above the view switch, so it keeps running while you're in History. |
| View resets when the agent changes | ✅ resets during render (`nav.for !== id`). Tests cover both the list and a past chat, and A → B → A. The recap's "Open chat" (`openThread` + `show`) works in the same batch because `go` reads the new `id`. |
| Leaked listeners or timers | ✅ none. Esc is a React `onKeyDown` on `.op-hist`, not a document listener. Its `stopPropagation` stops the event before the document handler in `OfficePage.tsx`. The new-message dot is state plus an effect, with no timers. The one timer in `ChatView` is cleared on unmount. |
| `ChatHistorySheet` still works where it is used | ✅ its own tests pass. ⚠️ But the app no longer mounts it: `OfficePage` dropped it, and only `ChatList` and `ChatView` are reused by the panel. See nice-to-fix 1. |

## Must-fix

1. **A trip to History throws away unsaved work in the live chat.** The live block (`.op-log`, the context chip, the composer) is now *unmounted* while History is open, not just hidden. The composer draft survives because `text` lives in `Panel`. But these lose their local state:
   - `AskCard`: the typed answer (`useState('')` in `Panel.tsx`, `AskCard`).
   - `RebuildCard`: `picks`, `err`, `staleNow`.
   - The log's scroll position: you always land back at the bottom.

   On master, nothing in the normal chat could reset like this, so this breaks "the normal chat flow is untouched".
   **Fix:** keep the live nodes mounted and hide them with `hidden={view !== 'live'}` on `.op-log`, `.op-ctx` and `.op-composer`, rather than `view === 'live' && …`. Make the input `ref` and the focus code handle a hidden input. Then drop `nav` from the scroll effect's deps, or scroll only if you were at the bottom.
   Add one test: type into an AskCard, open History, come back, and the draft is still there.

## Nice-to-fix

1. **`ChatHistorySheet` and `ChatHistoryBody` are now dead in the app.** Only tests use them. Either delete the sheet wrapper (keep `ChatList`/`ChatView`, perhaps moved to a `chat-history/` module), or say in the file header that the panel owns history now. The header comment still describes the recap opening a sheet.
2. **Nothing locks in the live flow.** `Panel` has no test for sending a message or answering an ask, and master had none either. Add two small tests: one that Send in live posts to the thread exactly as before, and one that a thread refetch while in History updates the Current chat row and the dot. The current dot test writes to the query cache directly.
3. **The "Open chat" focus race.** `openThread(a, 'report')` still schedules a 60 ms focus on `.op-composer input`. When the panel opens straight into a past chat, that input doesn't exist and the focus does nothing. It works, but only by accident. Pass a `from` that skips the composer focus.
4. **Small churn:** the `RecapSheet`/`Rearrange` import order swap in `OfficePage.tsx` is unrelated (biome ordering). It's harmless.

## Verdict

**Ship it after must-fix 1.** It's a small, local change in `Panel.tsx`. Everything else is sound: the changes stay inside the files listed above, no API changes, good a11y coverage.

**For the orchestrator:** the team can handle all of this. No HQ request is needed.
