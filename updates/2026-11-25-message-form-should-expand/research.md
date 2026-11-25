# Research: how people type here, and how they leave drafts

Feature: f-ux-message-form-should-expand. Researcher: Columbo. 2026-11-25.

## Summary

The user writes long, multi-line requests to Pixel (the director) and pastes logs into the chat. Then they get pulled away: they open another agent, leave the office, or close the app. Today the box where they talk to Pixel is a **one-line `<input>`** (`app/src/features/office/Panel.tsx:523`). It can't hold a line break and hides everything after the first ~60 characters. Nothing is saved: the text is plain React state and is gone on reload or quit.

**Found while reading the code:** the Panel is one component that stays mounted for every agent (`OfficePage.tsx:1052` has no `key`). So **a half-written message to Pixel stays in the box when you click Rivet**, and Enter sends it to the wrong agent. That is a trust bug today, and the draft work must fix it.

## Scope

**In:** the boxes where you write *to a person* (an agent, Pixel, Tinker, the orchestrator):

| Box | Where | Today | Verdict |
|---|---|---|---|
| Live chat with Pixel and every agent | `app/src/features/office/Panel.tsx:523` | `<input>`, no saving, text leaks across agents | **In: the main box of this feature** |
| Continue a past chat | `app/src/features/office/ChatHistorySheet.tsx:559` | `<textarea rows=1>`, no growth, no saving | **In** |
| Tinker (agent creator) chat | `app/src/features/cast/TinkerZoom.tsx:581` | `<input>`; the screen already promises "I'll keep the draft" | **In** (same box, same promise) |
| Orchestrator chat in setup | `app/src/features/setup/TeamStep.tsx:336` | `<input>` | **In** (same box; cheap) |

**Out: not message boxes.** These are form fields that save to a record, not chats:

| Box | Where | What it really is |
|---|---|---|
| `Board.tsx ~689` | `app/src/features/office/Board.tsx:689` | A feature's **Description** field (rows=10, has its own Save/Discard) |
| `AgentPanel.tsx ~213` | `app/src/features/cast/AgentPanel.tsx:213` | An agent's **Brain** (system prompt). It already grows with its own `grow()` and autosaves |
| `TeamPanels.tsx ~48` | `app/src/features/cast/TeamPanels.tsx:48` | A team text field (`TeamText`). It already grows and saves to the team |
| `TeamPanels.tsx ~411` | `app/src/features/cast/TeamPanels.tsx:411` | A member's **Job on this team**. Saves to the team |
| How-we-work ask | `app/src/features/office/HowWeWork.tsx:399` | A short one-shot command (max 500 chars), not a conversation. Leave it as is |

The brief's line numbers pointed at the out-of-scope fields. The real Pixel chat is `Panel.tsx`. Giving those form fields the shared auto-grow hook would be a nice cleanup, but it isn't needed for this feature. Leave them alone so the change stays small (Eraser may note it as a follow-up).

**Out for now:** syncing drafts across devices (there is only one desktop app), showing a list of drafts, and any visible "draft saved" sign.

## Behaviors

Scores run 1–10. L = likelihood, F = frequency. Sorted by L+F.

| # | Behavior | L | F | Why |
|---|---|---|---|---|
| 1 | **Long ask to Pixel**: a several-sentence request with line breaks (Shift+Enter) | 10 | 9 | The feature request itself describes this. Pixel is "hired" to turn a fuzzy idea into a plan, and that takes paragraphs |
| 2 | **Re-read before sending**: scroll back through what you wrote and fix a word | 9 | 9 | Comes with long asks. A one-line input hides most of the text, so people can't check it |
| 3 | **Switch chats mid-sentence**: click another robot to check something, then come back | 8 | 8 | The office shows every agent live, and a status change pulls the eye. This is when the leak bug bites |
| 4 | **Half a thought left for later**: start writing, go to a meeting or lunch, come back hours later | 8 | 7 | People think out loud in drafts. The feature request asks for this directly ("when I leave studio and come back") |
| 5 | **Paste a log or error** (50–500 lines) from a terminal or browser | 8 | 7 | A builder's studio: "here's the error, fix it" is a core job |
| 6 | **Leave the office**: go to Cast or Projects and come back | 8 | 7 | The app has many places to visit, and leaving unmounts the office |
| 7 | **Close or restart the app by accident**: Cmd+Q, an update restart, a crash | 7 | 4 | Happens, though not daily. When it does, the lost text hurts a lot. The user named this case |
| 8 | **Send, then start the next message**: expect an empty, small box at once | 9 | 9 | Every send. Already true for the text; the size must follow |
| 9 | **Voice dictation** fills the box with a long run-on paragraph | 5 | 5 | The project is voice-first, but dictation goes through the OS. Scored lower because I'm unsure |
| 10 | **Two projects open in turn**: write to Pixel in project A, switch to project B | 6 | 4 | Several projects exist. Each Pixel is a different director |
| 11 | **Type into a past chat**, then go back to the list | 5 | 3 | Less common, but the same box |

### Watch out (low score, high harm)

- **A stale draft sent by mistake.** You come back days later, forget there was a draft, type a new line on the end and press Enter, and an old half-thought goes to Pixel. Pixel acts on it, so harm is real. *Mitigation:* the restored draft must be fully visible (the box grows to show it) and the cursor goes to the end. No auto-send, ever.
- **A draft in the wrong chat.** Pixel's draft showing in Rivet's box, or in another project's Pixel. **This happens today** (shared Panel state). Drafts must be keyed by project + person, and switching must swap the text in the same render, not one frame later.
- **Lost draft after a crash or quit.** beforeunload is unreliable in Tauri (on macOS it may not fire in fullscreen; tauri-apps/tauri#2996), so it can't be the only save. Save while typing (debounced about 300 ms) as the main path, and flush on `blur`, `visibilitychange`/`pagehide` and `beforeunload` as extras. The worst case is then losing the last ~300 ms of typing.
- **Draft that comes back after sending.** The debounced save fires *after* send cleared the box, writing the old text back. Clearing on send must cancel the pending save.
- **A huge paste.** Storing 500 KB per keystroke slows typing and can fill localStorage (~5 MB). Keep the existing per-box `maxLength` (8000 in the past-chat box) and debounce. If a save throws (quota), fail quietly and keep the text in the box.
- **The box eats the chat.** A 300-line paste must not push the conversation off screen. Cap the height and scroll inside.
- **A drift in Enter's job.** A textarea's Enter adds a new line. Panel's input sends on Enter through the form today. After the switch to a textarea: Enter sends, Shift+Enter adds a new line, and Enter while composing with an IME (`isComposing`) does nothing. This copies `ChatHistorySheet.tsx:447`. Escape-to-go-back-to-Pixel in an empty box (`Panel.tsx:531`) must keep working.

## Deep dives

### 1. Long ask to Pixel

- **Moment:** a weekday morning at the desktop, coffee in hand. Just before, they were thinking about the product in the shower or reading feedback.
- **Trigger:** "I know what I want next. Let me tell Pixel before I lose it."
- **Thoughts:** "Pixel needs the whole picture: the goal, the two screens, and what not to touch. Let me put each on its own line."
- **Emotions:** eager and a bit protective of the idea at first. Today, cramped and anxious once the text scrolls out of the one-line box. Calm and in control when it's done well.
- **Expectations:** the box grows line by line as they type, like ChatGPT's or Slack's composer, with no jump. Shift+Enter makes a new line. They can see everything they wrote, up to a point.
- **Success:** "I could see my whole message, I fixed the second line, and I hit Enter."
- **Friction and fears:** text hidden off to the side; Enter sending half the message when they wanted a new line; the box jumping or flickering as it resizes.
- **Product insight:** Panel's `<input>` must become a textarea that grows from 1 line to a cap, with Enter-to-send kept and Shift+Enter for a new line.

### 2. Paste a log

- **Moment:** mid-afternoon. A build failed in another window and they copied 200 lines.
- **Trigger:** "Pixel, this broke."
- **Thoughts:** "Paste it all and add one line on top: 'fix this'."
- **Emotions:** irritated before; wanting it handled during; relieved once it's sent.
- **Expectations:** the paste lands, the box grows to its cap and scrolls inside, and the chat above stays visible. The cursor stays where they pasted, so they can scroll up and type their line.
- **Success:** the paste didn't take over the screen, and they still saw Pixel's last reply.
- **Friction and fears:** the box filling the whole panel; lag on every key after the paste; the text cut short with no warning.
- **Product insight:** cap at about 40% of the panel height (8–10 lines), then `overflow-y: auto`. Debounce saves so a big paste doesn't make typing slow.

### 3. Switch chats mid-sentence

- **Moment:** writing to Pixel when Rivet's robot lights up with a question.
- **Trigger:** "What does Rivet want? I'll check and come back."
- **Thoughts:** "My message to Pixel is safe, I'll finish it in a second."
- **Emotions:** a small worry about losing the text, then curiosity, then wanting to pick up where they stopped.
- **Expectations:** Rivet's box is empty (or shows *Rivet's* draft). Going back to Pixel shows the same text with the cursor where they left it.
- **Success:** "It was just there." They don't even notice.
- **Friction and fears:** **today the Pixel text sits in Rivet's box.** If they type "yes" and press Enter, Rivet gets "Pixel, please redo the… yes". Trust in the box is lost.
- **Product insight:** the draft is keyed by `projectId + agentId` and swapped as part of the thread switch. A test must cover this: write to A, switch to B, B's box is empty, back to A and the text is back.

### 4. Half a thought left for later (leave the office, or come back hours later)

- **Moment:** before lunch, or at the end of the day. They visit Cast or Projects and come back to the office later.
- **Trigger:** they open the office again and see Pixel.
- **Thoughts:** "Where was I? Oh, there it is."
- **Emotions:** a little guilt about the unfinished thought, then relief it's still there, then focus.
- **Expectations:** the box already holds the text, grown to show it, cursor at the end (or where they left it if it's the same session). No banner, no "restore draft?" prompt.
- **Success:** they carry on typing as if they never left.
- **Friction and fears:** they've forgotten the draft and add to it by accident (see *stale draft*). If the box shows the whole draft, they notice it.
- **Product insight:** restore on mount from the store. No UI for drafts at all; the growing box is the sign.

### 5. Close or restart the app by accident

- **Moment:** Cmd+Q meant for another app, an update restart, or a crash.
- **Trigger:** they open AI Studio again.
- **Thoughts:** "Ugh, I was writing something long… is it gone?"
- **Emotions:** dread, then delight if it's there. This is the "magic" moment.
- **Expectations:** the same chat, the same text. They don't expect the cursor position after a restart; the end of the text is fine.
- **Success:** "It kept it. I didn't even have to think about it."
- **Friction and fears:** the text gone; the last sentence gone (a save that only happens on quit); the draft showing in a different project.
- **Product insight:** save to localStorage while typing (debounced) and flush on blur, visibilitychange, pagehide and beforeunload. Don't rely on quit events alone.

### 6. Send, then the next message

- **Moment:** right after any send.
- **Expectations:** the box shrinks to one line at once, and the stored draft is gone, so a restart doesn't bring it back.
- **Friction:** a tall empty box; an old draft coming back after a reload; a failed send that loses the text. Today a failed send puts the text back (`ChatHistorySheet.tsx:435`), and that must stay true. If the send fails, the draft is saved again.
- **Product insight:** clearing on send cancels any pending debounced save. A failed send restores the text and its draft.

## Key insights

1. **Fix the right box.** The main box is `Panel.tsx`'s `<input>`, not the textareas the brief listed. Four of those five are record fields, not chats.
2. **Drafts fix a bug that exists today:** text leaking across agents in the shared Panel.
3. **Invisible is the feature.** No "save draft" button, no "restored" banner. The growing box showing the old text is enough.
4. **Save while typing, not on quit.** Tauri can't promise unload events.
5. **Keep keys stable:** `draftKey(projectId, personId)`. For a past chat, personId is the agent id plus the run id (`${agentId}#${runId}`), so a past chat and the live chat with the same agent don't share a draft. Tinker and setup have no project, so they use a fixed scope (`'cast'`, `'setup'`).

## Open questions and assumptions

- *Assumption:* the cursor is restored within a session (switching chats). After a restart the cursor goes to the end. This is good enough and simpler.
- *Assumption:* drafts never expire. A 30-day sweep could come later if stale drafts turn out to be a problem.
- *Open:* should a new chat (Pixel's "New chat") clear the draft? Recommendation: no. The draft belongs to the person, not the thread.
- *Unsure (scored low):* how much voice dictation flows through this box.

## Sources

- Slack drafts (2019): https://slack.com/blog/productivity/in-case-you-missed-it-drafts-email-dark-mode
- Stream Chat drafts (per channel; cleared on send): https://getstream.io/chat/docs/sdk/react-native/features/messaging/drafts/
- MDN, beforeunload is unreliable, prefer visibilitychange: https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event
- Tauri: beforeunload/close-requested missing in macOS fullscreen: https://www.github.com/tauri-apps/tauri/pull/2996
