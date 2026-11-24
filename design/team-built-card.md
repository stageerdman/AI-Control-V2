# "Built for you" card

**User goal.** After saying yes to "build me a team for X", see what was made and change or take it back, right where they said yes.

## Flow
1. The user says yes in the orchestrator's chat. The Agent Creator builds the team.
2. The orchestrator's chat line about the build ("Tinker built The Tide Tellers for you: …") shows as this card, not as a bubble.
3. From the card: **Edit** opens the team or agent in the Cast. Their name, look and everything else are edited there. **Remove** takes one new thing away, and **Undo** appears on its row. **Remove all** takes the whole build back, and the card becomes one line with **Undo**.

## Layout
- Heading: "Tinker built The Tide Tellers for you".
- Rows: the team first, then its people in seat order, then any new agent no longer seated. Each row shows a face, the name, and a soft line (role · captain · "already in the Cast"), with Edit and Remove on the right.
- Footer: You said “yes, build it” · 2:14 PM, and Remove all as a soft text button.
- Names and faces are live from the Cast, so a rename shows here at once.

## States
- **Loading:** nothing (the card appears once the request and the Cast are read).
- **Can't read it** (request missing, not built, error): the plain chat line in a quiet one-line box.
- **One removed:** the name is struck through and marked "Removed", with Undo. After a reload, Undo is gone and it says "in Recently deleted".
- **All removed:** "Removed The Tide Tellers and its 2 new agents. They’re in Recently deleted." plus Undo.
- **Busy:** the button reads "Removing…" or "Bringing back…", and the other actions wait.
- **Error:** one plain red line. An agent busy in a session says so by name.

## What I removed and why
- **No rename field in the card.** Edit opens the Cast, where the name already lives. One place to edit, nothing new to learn.
- **No Remove on agents who were already in the Cast.** Removing them would delete someone the user had before this build. Edit only.
- **No confirm dialogs.** Every removal has Undo, which is calmer than asking first.
- **No separate "open" and "edit".** In the Cast they're the same screen.
- **The chat bubble.** The card replaces it, so the build appears once.

## Accessibility
- The card is a `section` named by its heading. Every button has a full name ("Remove Tidewright", "Bring back Tidewright").
- Tap targets are at least 44px, with a sky focus ring. Results are announced in a polite status line, and errors use `role="alert"`.
- Reduced motion: a fade, with no movement.

## Build
- `app/src/features/office/built/` holds BuiltCard.tsx, api.ts, built.css and BuiltCard.test.tsx. Panel.tsx renders it for director messages that have `teamRequestId`.
- Server: `thread_messages.team_request_id`, plus `POST /projects/:id/team-requests/:rid/undo` and `/restore`.
