# Plan: the message box grows, and drafts are kept

Feature: f-ux-message-form-should-expand. Research: `research.md` (same folder). Builder: Jony. Reviewer: Eraser.

## Goal

Writing to Pixel or any agent feels roomy and safe. The box grows with your text, and what you haven't sent is still there when you come back, even after a restart. No new buttons or labels: it just works.

## Boxes in scope

| Box | File | Draft key |
|---|---|---|
| Live chat with Pixel and every agent (**main**) | `app/src/features/office/Panel.tsx:523` (an `<input>` today, becomes a `<textarea>`) | `draftKey(pid, agentId)` |
| Continue a past chat | `app/src/features/office/ChatHistorySheet.tsx:559` | `draftKey(pid, `${agentId}#${runId}`)` |
| Tinker chat | `app/src/features/cast/TinkerZoom.tsx:581` (an `<input>` today) | `draftKey('cast', 'tinker')` |
| Orchestrator chat in setup | `app/src/features/setup/TeamStep.tsx:336` (an `<input>` today) | `draftKey('setup', orchestratorId)` |

**Out of scope (not message boxes; leave them alone):** `Board.tsx:689` (feature Description), `AgentPanel.tsx:213` (agent Brain), `TeamPanels.tsx:48` (team text field), `TeamPanels.tsx:411` (Job on this team), `HowWeWork.tsx:399` (one-shot ask). They are record fields with their own saving.

## Phase 1: one shared auto-grow

Build `app/src/ui/useAutoGrow.ts`:
`useAutoGrow(ref: RefObject<HTMLTextAreaElement>, value: string, opts?: { maxPx?: number })`

- In a layout effect on `value`, set height to `auto`, then to `min(scrollHeight, max)`. This avoids a flicker frame.
- Default max: 40% of the window height, clamped to about 8–10 lines (`min(0.4 * innerHeight, 10 * lineHeight)`). Below the cap use `overflow-y: hidden`; at the cap, `auto`, so it scrolls inside.
- `value === ''` goes back to one line (`rows=1`, inline height cleared).
- Recompute on window resize.

Wire it into the four boxes above. Panel, Tinker and TeamStep change from `<input>` to `<textarea rows={1}>`:

- Enter sends. Shift+Enter adds a new line. Enter during IME composition (`e.nativeEvent.isComposing`) does nothing. Copy `ChatHistorySheet.tsx:447`.
- Keep the existing labels, placeholders, `maxLength`, `readOnly` and Escape behavior (`Panel.tsx:531`).
- CSS: the composer row lines up at the bottom (`align-items: flex-end`) so Send stays put while the box grows. `resize: none`.
- Update tests that query `textbox` names; the role stays `textbox`.

**Tests (end of phase):** `app/src/ui/useAutoGrow.test.tsx`: it grows as lines are added, stops at max with overflow auto, and shrinks to one line when value becomes `''`. Panel: Enter sends, Shift+Enter doesn't, an IME Enter doesn't. Existing Panel, ChatHistorySheet, TinkerZoom and TeamStep tests pass.

## Phase 2: per-chat drafts

Build `app/src/ui/drafts.ts` on localStorage (the app already uses it; Tauri's WebView keeps it across restarts):

- `draftKey(projectId, personId)` returns `aistudio.draft:${projectId}:${personId}`.
- `loadDraft(key): string` returns `''` if missing or unreadable.
- `saveDraft(key, text): void`: debounced about 300 ms, one timer per key. Empty text removes the entry. A quota or other error fails quietly and the text stays in the box.
- `clearDraft(key): void`: removes the entry **and cancels any pending save for that key**.
- `flushDrafts(): void`: writes all pending saves now. Call it on `blur` of the box and on window `visibilitychange` (hidden), `pagehide` and `beforeunload`. Register these once at module level. Don't rely on quit events alone, because Tauri may skip them.

Optionally, a small hook `useDraft(key)` returns `[text, setText]` (it loads on key change, saves on set, flushes on blur). It keeps the four call sites to one line each. Only if it stays tiny.

Behavior:

- **Switching chats swaps the text in the same render.** In Panel the key comes from `pid + thread`. When `thread` changes, load that chat's draft. Never carry the old text across. This fixes today's bug, where Pixel's half-written text shows in Rivet's box.
- Cursor: keep `selectionStart/End` in memory per key for the session and put it back when you return. After a restart, the cursor goes to the end.
- **Sending clears the draft** (`clearDraft`) and the box shrinks. **A failed send** puts the text back and saves it again (as `ChatHistorySheet.tsx:435` does today).
- In Panel, answering by voice (a yes/no to a card, "new chat") counts as a send: clear the draft.
- No UI: no "draft" label, button or banner.

**Tests (end of phase):** `app/src/ui/drafts.test.ts`: save then load per key; empty removes it; debounce writes once; clear cancels a pending save; flush writes at once; broken storage returns `''`. Component tests: type, unmount and remount, and the text is back; send, remount, and the box is empty; write in A, switch to B, B is empty; back to A, the text is back; same agent in another project, empty; a failed send keeps the draft.

## Phase 3: ship it

- Run the full app test suite (`npm test` in `app/`) and lint (biome) until green.
- Check it in the running app: write a long message to Pixel, paste a long log, switch agents, leave the office, quit and reopen. Each case behaves as above.
- Commit and push the branch. Make sure Start opens the newest build.
- Update feature f-ux-message-form-should-expand (pct and a line on what shipped). Eraser signs off in `review.md`.

## Done when

- Every in-scope box uses the one `useAutoGrow` and the one `drafts.ts`. No per-chat copies.
- No draft ever shows in another person's or project's chat.
- Tests above exist and the full suite is green. The branch is pushed and Start opens the newest build.
