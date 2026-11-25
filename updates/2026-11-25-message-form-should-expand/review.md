# Review: the message box grows, and drafts are kept

Reviewer: Eraser. Builder: Jony. Branch `studio/design-and-build-the-growing-message-box-f69d700c` at `afd0863`.
Plan: `plan.md` (same folder).

## Verdict: RETURNED (one small fix, then I sign)

The flow is lean. It adds no buttons, labels or settings, and the user never has to retype. But there is one path where a message that didn't go through is still lost, and keeping those words is what this feature is for. Fixing it is one line, and it's Jony's to make.

## Goal

The user writes to Pixel or any agent, even something long, and never loses words they haven't sent.

## Step count (most common path: a long message to Pixel)

| # | Step | Mark | Why |
|---|---|---|---|
| 1 | Put the cursor in the box | Keep | It is focused for you when you switch agents (OfficePage focus now finds the textarea). |
| 2 | Type | Keep | This is the work itself. |
| 3 | Shift+Enter for each new line | Keep | This is the usual chat rule, and Enter still sends. No hint is needed. |
| 4 | Scroll inside the box once it's past 10 lines or 40% of the window | Keep | It only happens on rare long pastes, and the log stays visible. |
| 5 | Enter (or Send) | Keep | — |

**Total: 4 steps, plus 1 per extra line.** Steps the change removed:

| Case | Before | Now |
|---|---|---|
| Leave the chat, come back, or restart the app | Retype everything | 0 steps (the draft is back, with the cursor where you left it) |
| Switch from Pixel to Rivet | Pixel's text sits in Rivet's box: select and delete (2 steps), plus the risk of sending it to the wrong agent | 0 steps (each chat has its own draft, swapped in the same render) |
| `say` fails | Retype | 0 steps (the text goes back into the box and its draft) |
| Answer by voice ("yes", "new chat") | — | Counts as a send, so the draft is cleared (`setText('')` runs first) |
| **A typed answer to an agent's waiting question fails** | Retype | **Still retype: this needs fixing** |

Target: 0 retype steps on every failed send. Today 4 of the 5 cases meet it.

## The one fix

`app/src/features/office/Panel.tsx`, in `send`:

```ts
if (waiting && (await answer(waiting, said, true))) return;
```

`answer()` returns `true` when the error is **not** a 409 (a network error or a 500). So `send` returns right after `setText('')`, and the words are gone. The box is empty, and the only trace is an error line. The plan says "a failed send puts the text back". This is a failed send.

Suggested fix (Jony's call how): when `answer` fails with something other than a 409, put the words back the same way the `say` catch does (`setText((now) => now || raw)`). For example, have `answer` tell "went in" apart from "failed", or do the put-back inside `answer` when `typed` is true. Add one case to `Panel.drafts.test.tsx`: an ask is waiting, `studio.projects.answer` rejects with a 500, and the box and the draft still hold the text.

## Checked and fine

- **One of each, no copies.** There is one `useAutoGrow`, one `MessageBox` and one `drafts.ts`, used by all four boxes in scope. ChatHistorySheet's own Enter handler and its `field-sizing` and `max-height` CSS are gone, so no box has two ways to grow or send.
- **Out-of-scope fields untouched** (Board, AgentPanel, TeamPanels, HowWeWork). Good. Record fields shouldn't behave like chat.
- **Keys:** project + agent; a past chat uses `agentId#runId`, so it is separate from the live chat; setup uses the draft id. The tests show nothing leaks across chats or projects.
- **Saving:** 300 ms debounce, and `clearDraft` cancels a pending save, so a draft can't come back after a send. Pending saves are written on focusout, hidden, pagehide and beforeunload. A failed write is silent and the text stays in the box.
- **A setter from an earlier key** (a send that fails after you switch chats) writes to that chat's draft, not the box you're now looking at. That's right.
- **Sizing:** the global `box-sizing: border-box` matches the height math, and the composer lines up at the bottom (`flex-end`), so Send stays put while the box grows.
- **Keys and focus:** Escape in an agent's empty box still takes you back to Pixel, because the caller's onKeyDown runs first. Enter during IME composition does nothing.
- **Tests:** the touched areas pass (`src/ui`, Panel, ChatHistory, TinkerZoom, setup: 12 files, 134 tests).

## Watch later (not blocking)

- **Leftover setup drafts.** A `setup:<draftId>` entry stays in localStorage if a new-project setup is abandoned halfway with text in the box. It's tiny and harmless. If it ever matters, clear it when the setup draft is deleted.
- **Cursor memory lives for the session only**, as the plan says. After a restart the cursor goes to the end. Fine.
- **Don't add a "Draft saved" label** or a Shift+Enter hint later. Today it works without saying so, and that is the point.

## When Jony returns

I check only the fix above and its test. If both are there and the suite is green, I sign below.

Sign-off: _pending_
