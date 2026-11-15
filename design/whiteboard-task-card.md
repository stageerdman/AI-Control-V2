# Whiteboard task card

**User goal:** glance at the board and know, for each task, *is it moving, who has it, and if it stopped, why*,
without reading agent output (user model goal 1: get work done without it getting blocked).

## One row, three facts
```
[mark]  Short title, up to 2 lines                         (◉ Scarlett) reviewing
[ ! ]   Add the login screen                                              
        Ran out of steps. The work is saved and can continue.  Details ▸
          ┌ raw note, mono, scrolls (only after Details) ┐
[ ✓ ]   Wire the API                                              (◉ Pete)
```
1. **Mark** (left, 18 px): the status at a glance. Empty ring = to do · sky ring with dot = in progress ·
   teal tick = done · coral `!` = stopped by a problem · grey dash = stopped / skipped.
2. **Title**: the task text, clamped to 2 lines (full text on hover via `title`).
3. **Person** (right): avatar (22 px face) + first name. Running: who is on it *now* (the reviewer during a
   review). Done: who finished it. Team item with several members: up to 3 faces overlapped + "Ava +2".
   To do / stopped: no person (nobody holds it).
   A one-word **status** follows the name only when it adds something: `reviewing`, `merging`,
   `sent back 2×` (sun). Building and done need no word: the mark says it.

## Stopped tasks
- One plain line under the title: the server's `problem.message` (e.g. "Ran out of steps. The work is saved
  and can continue."). Coral-ink for failed, soft ink for cancelled.
- `Details` (quiet text button, `aria-expanded`) reveals `problem.details`, the raw note, in a light mono
  box (max 160 px, scrolls). Hidden by default. No details → no button.

## Removed, and why
- **Captain's plan line** under team items: the sub-tasks underneath already show the split.
- **Raw note clip** on failed rows: replaced by the plain message; raw text is behind Details.
- **"stopped" tag**: the coral mark + message say it; one signal is enough.
- **Name prefix in sub-tasks ("Pete · …")**: the person moves to the right, as an avatar, like every row.
- **Hover with the full raw note**: hover keeps only the reviewer's send-back note (useful, short).

## Team items
Sub-tasks sit indented under their item, same row anatomy, one size smaller (15 px mark, 13.5 px text).

## Accessibility
- Each row starts with a screen-reader phrase: "Done, finished by Pete:" / "In progress, Scarlett reviewing:" /
  "Stopped: <message>". Avatars are decorative; names are text.
- Details is a real button, keyboard reachable, focus ring = grape outline (as the rest of the board).
- Problem text ≥ 4.5:1 on white (#a3242c for failed, ink-soft for cancelled).

## States checked
to do · building · in review · merging · sent back · done · failed (with / without details) · cancelled ·
team item with 0 / 1 / 3+ people working · person who left the studio ("Someone who left", default look) ·
older server without the new fields (falls back to the note and the builder).

Built in `app/src/features/office/TaskCard.tsx`; the pure view is `taskCard()` in `state.ts`.
