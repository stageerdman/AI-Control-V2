# Review: the message box grows, and drafts are kept

Reviewer: Eraser. Builder: Jony. Code checked: `afd0863` (team branch `studio/grow-the-message-box-as-you-type-and-kee-3a640c9f`, same head as Jony's pushed `studio/design-and-build-the-growing-message-box-f69d700c`).
Plan: `plan.md` (same folder). Rechecked 2026-11-25.

## Verdict: RETURNED (one small fix still open, then I sign)

The flow is lean. It adds no buttons, labels or settings, and the user never has to retype. But there is one path where a message that didn't go through is still lost, and keeping those words is what this feature is for. Fixing it is one line, and it's Jony's to make. (Now fixed: see Integration below.)

## Goal

The user writes to Pixel or any agent, even something long, and never loses words they haven't sent.

## Step count (most common path: a long message to Pixel)

| # | Step | Mark | Why |
|---|---|---|---|
| 1 | Put the cursor in the box | Keep | It's focused for you when you switch agents (OfficePage now looks for the textarea). |
| 2 | Type | Keep | This is the work itself. |
| 3 | Shift+Enter for each new line | Keep | It's the usual chat rule, and Enter still sends. |
| 4 | Scroll inside the box past the cap (10 lines or 40% of the window) | Keep | Only for long pastes. |
| 5 | Enter (or Send) | Keep | — |

**Total: 4 steps, plus 1 per extra line. Target: 4.** Steps that are gone:

| Case | Before | Now |
|---|---|---|
| Leave the chat, come back, or restart | Retype all of it | 0 (the draft is back) |
| Switch from Pixel to Rivet | Pixel's text sits in Rivet's box (delete it, or risk sending it to the wrong agent) | 0 (each chat has its own draft) |
| `say` fails | Retype | 0 (the text comes back to the box and the draft) |
| Answer by voice ("yes", "new chat") | — | Counts as a send: the draft is cleared |
| **A typed answer to an agent's waiting question fails (not a 409)** | Retype | **Still retype: open** (now 0, see Integration) |

## Checklist

| Check | Result |
|---|---|
| One shared auto-grow hook (`app/src/ui/useAutoGrow.ts`), one box (`app/src/ui/MessageBox.tsx`) | Pass |
| One draft store (`app/src/ui/drafts.ts`, `useDraft`); no per-chat copies | Pass |
| No leftover resize code in the boxes in scope (ChatHistorySheet's own Enter handler, `field-sizing` and `max-height` are gone) | Pass |
| No new buttons, labels or settings (no "save draft"; it just works) | Pass |
| All four boxes in the plan use it: Panel, ChatView (past chats), TinkerZoom, TeamStep | Pass |
| Drafts cleared on send; never in the wrong chat or project | Pass (`Panel.drafts.test.tsx`) |
| Failed send keeps the words | **Fail for one path** (see below; fixed in Integration) |
| Tests for both parts: `useAutoGrow.test.tsx` (grow, cap, shrink, resize, Enter/Shift+Enter/IME), `drafts.test.ts`, `Panel.drafts.test.tsx` | Pass |
| Full app suite `npm --prefix app test` | Pass: 870 passed, 2 skipped |
| Typecheck | Pass |
| Lint | 7 errors, all in files this work doesn't touch (rebuild/Rearrange, rebuild CSS, CommsDrawer, ReportsList). None in message-box files. |
| Branch pushed | Pass (`afd0863` on origin) |
| Start (`npm --prefix app run dev`) builds from source, so it opens the newest code | Pass |

## Open for Jony (already on the whiteboard as task 2e4b7124)

`app/src/features/office/Panel.tsx`, in `send`:

```ts
if (waiting && (await answer(waiting, said, true))) return;
```

`answer()` returns `true` on any failure that isn't a 409 (offline, a 500). `send` has already run `setText('')`, so the words are gone from the box and the draft. Fix: tell "sent" apart from "failed" and put the words back (`setText((now) => now || raw)`), the way the `say` catch does. Add a case to `Panel.drafts.test.tsx`: an ask is waiting, `studio.projects.answer` rejects with a 500, and the box and `loadDraft(draftKey(pid, id))` still hold the text.

## Checked and fine

- **One of each, no copies.** There is one `useAutoGrow`, one `MessageBox` and one `drafts.ts`, used by all four boxes in scope. ChatHistorySheet's own Enter handler and its `field-sizing` and `max-height` CSS are gone, so no box has two ways to grow or send.
- **Out-of-scope fields untouched** (Board, AgentPanel, TeamPanels, HowWeWork). Good. Record fields shouldn't behave like chat.
- **Keys:** project + agent; a past chat uses `agentId#runId`, so it is separate from the live chat; setup uses the draft id. The tests show nothing leaks across chats or projects.
- **Saving:** 300 ms debounce, and `clearDraft` cancels a pending save, so a draft can't come back after a send. Pending saves are written on focusout, hidden, pagehide and beforeunload. A failed write is silent and the text stays in the box.
- **A setter from an earlier key** (a send that fails after you switch chats) writes to that chat's draft, not the box you're now looking at. That's right.
- **Sizing:** the global `box-sizing: border-box` matches the height math, and the composer lines up at the bottom (`flex-end`), so Send stays put while the box grows.
- **Keys and focus:** Escape in an agent's empty box still takes you back to Pixel, because the caller's onKeyDown runs first. Enter during IME composition does nothing.

## Watch later (not blocking)

- `AgentPanel.tsx:79` and `TeamPanels.tsx:41` still have their own small grow code. The plan leaves them out on purpose, since they're record fields. If they're ever touched, move them to `fitTextarea` so there's one way to grow a box.
- An abandoned new-project setup leaves a small `setup:<draftId>` entry in localStorage. It does no harm.
- Cursor memory lives for the session only, as the plan says. After a restart the cursor goes to the end. Fine.
- Don't add a "Draft saved" label or a Shift+Enter hint later.

## When Jony returns

I check only the fix and its test, run the full suite, and sign below.

Sign-off: _pending (waiting on task 2e4b7124)_

## Integration (Columbo, captain)

Jony's fix for task 2e4b7124 is on master. `answer()` now returns `'in' | 'closed' | 'failed'`, and on `'failed'` `send` puts the raw words back with `setText((now) => now || raw)`. It comes with the test "keep the words when a typed answer fails". Columbo rebased the team branch onto that fix and kept Jony's version. Columbo had written the same fix separately and dropped that copy, so the code has one way to do it.
- Full suite: 871 passed, 2 skipped. `web:build` (typecheck plus build) passes. Lint: the same 7 old errors as before, none in the message-box files.

The last open row ("A typed answer … fails") is now **0 steps, kept**. Every checklist row passes.
