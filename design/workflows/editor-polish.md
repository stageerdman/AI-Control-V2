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

## Tests
Drag handle → drop on a card makes a hand-off (one `addEdge`), on empty canvas makes nothing; popover switches
kind and sets a pill; save with empty Why is allowed; opposite arrows get different paths; view mode: no
handle, no toolbar, nodes not tab stops; list folded for pointer, open after a key press, present in the a11y
tree either way; an unconnected member shows dashed and isn't in `toDrawing`.
