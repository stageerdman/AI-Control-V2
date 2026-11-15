# Cast · Recently deleted

**User goal:** "I deleted someone by mistake. Get them back, exactly as they were, without hunting."

## Removed (and why)
- Bulk restore / select all: mistakes are one agent at a time. Not needed.
- Delete forever: the 30-day expiry does that. One less way to lose work.
- A separate Trash page or tab: the list sits where the agent used to be, at the end of the lineup.
- A confirm on Restore: restoring is safe and easy to undo (delete again).
- A chat count on each row: the date line is enough. Chats come back with the agent anyway.

## Flow
1. Delete an agent → toast "<Name> deleted" with **Undo** (6 s). Undo uses the same restore token and the same path as the list.
2. After the toast is gone, a quiet **Recently deleted (n)** row shows at the end of the lineup (only when n > 0).
3. Tap it → it opens a plain list in place (a disclosure, `aria-expanded`). Newest first.
4. **Restore** → the row leaves, the agent comes back to their old spot in the lineup, keyboard focus moves to them, and a toast says "<Name> is back".

## Layout
- Row: centred text button, cream-72, 15px/800, chevron, ≥ 44px tall.
- List: one well (rounded 18px, glass line), max 640px wide, centred.
- Each item: faded avatar (48px, opacity .5, desaturated) · name (16/900) · role (14, cream-72) · "Deleted 2 days ago · kept until Dec 14" (14, cream-72) · **Restore** (`btn btn-sm`, ≥ 44×44).
- Time words: just now · N hours ago · yesterday · N days ago. Date: "Dec 14".

## States
| State | What shows |
|---|---|
| Loading | Nothing. The row shows up once the list arrives. |
| Empty (n = 0) | Nothing. The row is hidden, and it closes if it was open. |
| List failed to load | Nothing at first. If it fails on a refresh while open: "Couldn't refresh this list. Try again". |
| Restore in progress | Button reads "Restoring…", `aria-busy`, more taps do nothing. |
| Restore failed | Inline message under the name (`role="alert"`, linked by `aria-describedby`): "Couldn't bring <Name> back: <reason>. Try again." Restore stays as the retry. |
| Token expired (404) | "Their 30 days ran out, so they can't come back." |
| Seat taken meanwhile | The restore worked, so this isn't an error. The toast says: "<Name> is back, but their seat on <Team> was taken". |

## Accessibility
- Restore is a real `<button>` with `aria-label="Restore <name>"` and a target of at least 44px.
- Text is cream / cream-72 / coral on the dark stage, all AA.
- After a restore, focus moves to the agent's lineup slot (`.slot[data-id]`).
- The toast is the shell's `role="status" aria-live="polite"`.
- Reduced motion: no slide-in and no smooth scroll.

## API (built in `app/src/features/cast/api.ts`)
- `listDeletedAgents()` → `GET /trash/agents` → `DeletedAgent[]` (query key `trash-agents`).
- `restoreAgent(token)` → `POST /trash/:token/restore`, using the existing `studio.restore` client.
- `seatsLost?: string[]` (team names) on the restore reply drives the seat-taken toast. The server sends it only when a seat was skipped because the team filled up. Otherwise the toast just says "<Name> is back".
- Expired entries are purged when the list loads, on restore and at server start, so "kept 30 days" means exactly that. Past chats stay as history after the purge.

## Code
`RecentlyDeleted.tsx`, `recently-deleted.css`, and `bringBack(token, name)` in `store.ts`, which both Undo and the list use. Tests are in `RecentlyDeleted.test.tsx`.
