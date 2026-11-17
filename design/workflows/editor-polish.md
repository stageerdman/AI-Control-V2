# Editor polish (final, locked): `app/src/features/collab/flow/WorkflowEditor.tsx`

User goal: *draw an arrow without reading the hint line.*

## Modes
New prop `mode: 'view' | 'edit'` (default `'edit'`, so callers stay the same). `readOnly` stays for temporary ways
and implies view.
- **view:** fit to frame, no toolbar, no drag, no selection, nodes not focusable, list folded (see below).
- **edit:** as today, plus the changes below.

## Connect by dragging
- In edit mode each card shows a 12px round handle on its right edge on hover / focus (`--ink-3`, 24px hit
  area). Drag from it to another card: a live line follows the pointer, and the card under it highlights.
  Drop on a card → a **hand-off arrow is made at once** (no form). Drop on empty canvas → nothing.
- The new arrow is selected, and its small inline popover opens next to it (not a sheet):
  `Hands work to  |  ✓ Signs off` (segmented) · if Signs off, a pill row of the kinds
  (`kindLabel` of `SIGNOFF_KINDS`, first one picked) · `Why` (optional, one line) · `Only when…` (optional) ·
  Remove. Esc or a click outside closes it; the arrow stays.
- "Connect to…" stays in the node toolbar for keyboard users (it opens the same popover after picking).
- Opposite arrows between the same two cards bend apart (±18px arc) so both can be read (the team default
  needs it).

## Fewer required fields
- `Why` is optional on both kinds. The server's schema must allow an empty `why` (server need S5).
- No dropdown for the kind: pills. Default kind = `review`.

## The list
- Under the canvas, folded behind **Show as a list** (pointer) / open when reached by keyboard (as on How we
  work). Always in the accessibility tree. Problems open it and scroll to the row.

## Unconnected people (team ways)
`people` not on the drawing appear as faint dashed cards in free spots (`freeSpot`). Giving one an arrow makes
it a real node. They're never saved on their own.

## Phase 6 live-check fixes (built)
- **+ Add someone is always the toolbar's first control**, selected card or not (a first-time user was stuck
  after "Who starts": the new card stayed selected and the picker was hidden). The selected card's actions follow
  after a thin divider. "Connect to…" only shows once there are two cards (with one it can only be disabled).
  With one card the hint reads "Add who they pass work to."
- **Deselect:** a click on empty canvas *or* the board inside it; Escape steps back one level (arrow form /
  connecting first, then the selection).
- **Add arrow off:** every `.btn:disabled` now looks disabled (design system, `prototype.css`), and the form says
  "Say why first" while Why is empty. Optional Why still waits on server need S5.
- **Words:** `onlyWhen()` — "it touches payments" → "only when it touches payments"; "if …" stays "only if …";
  "unless …" stands alone.
- **Branch labels** are drawn in a layer above the cards, so a short arrow's "only when" is never hidden.
- **A line through someone else's card bows out** (`blocked` + `arrowPath`, shared by the canvas and WayThumb):
  Pass it along's way back now reads as a loop.
- **"Checks all work"** badge on whoever signs off every change (`after: "*"`), before "Signs last".
- **No "Signs last must sign something off" check:** `final` only orders sign-offs; a final who signs nothing is a
  harmless no-op (a team default way + one sign-off now saves). Matches the server change.
- Team panel: when the crew reaches two, How this team works scrolls into view once (never on opening).

## Tests
Drag handle → drop on a card makes a hand-off (one `addEdge`), on empty canvas makes nothing; popover switches
kind and sets a pill; save with empty Why is allowed; opposite arrows get different paths; view mode: no
handle, no toolbar, nodes not tab stops; list folded for pointer, open after a key press, present in the a11y
tree either way; an unconnected member shows dashed and isn't in `toDrawing`.
