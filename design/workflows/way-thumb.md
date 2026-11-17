# WayThumb: a small, live picture of a way (final, locked)

User goal: *see at a glance that the office (or a team) has a way, and open it.*
Used in three places: the Quest Board header, the "Other ways" row on How we work, and the team panel.
One component: `app/src/features/collab/flow/WayThumb.tsx`.

## What it is
A pure SVG: faces and arrows. No text, no badges, no buttons inside. It isn't focusable itself.
The button around it carries the label.

- Positions: the same `toGraph(way)` the editor uses (saved `layout`, else the editor's default spots),
  fitted to the box with `frame()`. So the thumbnail and the canvas always match.
- Faces: `Hero` heads, round, size by box (sm 14px, md 18px, lg 28px). Teams: their emblem.
- Arrows: solid 1.5px = hands work to; dashed 1.5px = signs off. Same two styles as the editor, in `--ink-3`.
  No ✓ glyph below lg (too small to read). At lg the ✓ sits mid-arrow as in the editor.
- People on the team who aren't on the drawing yet (team only, lg only): a faint dashed ring, no face.
- Temporary way: the frame is dashed, like its chip.

| size | box | where |
|---|---|---|
| sm | 64 × 36 | Quest Board header |
| md | 120 × 68 | Other ways row |
| lg | 100% × 132 | Team panel |

## Props
```ts
WayThumb({ way, people, size, temporary?, loading? })
// way: Pick<Workflow,'gates'|'steps'|'lead'|'crew'|'first'|'final'|'layout'> | null
// people: Person[] (same as the editor)
```
`aria-hidden="true"` on the svg. The wrapper says what's in it with the way's words: `inWords` from the
server (see the server list in `update v2.md`).

## States
- **Drawn:** faces + arrows.
- **Nothing drawn** (`toGraph` → null): three faint dots joined by one faint arrow, a generic "way"
  mark, so the button never looks broken. Wrapper label: "How we work: nothing drawn yet".
- **Loading:** a rounded skeleton the same size (no layout jump).
- **Error:** the wrapper shows its words only (the board button still reads "How we work").
- **Live:** it re-renders when its query refreshes (`workflows.changed`, `team.workflow.changed`), with a
  150 ms crossfade. No crossfade under reduced motion.

## Tests
Draws one face per node and one path per arrow; dashed only for gates; empty mark when null; skeleton
when loading; positions match the editor's for the same way (shared `frame`); svg is aria-hidden.
