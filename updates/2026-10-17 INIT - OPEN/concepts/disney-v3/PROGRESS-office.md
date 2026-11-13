# Office v4 (calm & clean) — progress log

Owner: Office builder. Files: src/js/office-*.js, data-office.js, office-layout.js (new), office.css,
app.js (only: 'health' route shorthand), manifest.txt (added office-layout.js before data-office.js).
Never commit ai-control-disney-v3.html, hero.*, cast.*, teams.js.

## Architecture (new in v4)
- `office-layout.js`: pure `officeLayout(cfg) → PLAN` (W grows ≥1600, ≤2 desk rows, pods per team,
  solo desks, director corner + couch in right 400px column, wall objects: door/clock/outbox/console
  on LEFT, dossier·whiteboard·health centred). Seat ids `<teamId>-N`, `solo-N`; agents get `home`.
- `data-office.js`: OFFICE_CONFIGS size2/size6(Aurora story)/size12/size20, `?demo=sizeN`;
  `gen:N` ids mint extras from FUNNY_NAMES into AGENTS; inline team defs pushed into TEAMS.
  WS built from config; THEME_OFFICE = {plan, depth}. Features description/vision = plain strings.
  checkup = {when, items:[{key,name,grade,good,fix}]}. WS.story 'aurora' runs Act 1, else ambient only.
- `office-theme.js`: art(plan, ctx) — decluttered (no jackets, flags, signs, printer, coffee, cat).
- `office-engine.js`: rAF glide walking (cancelable token, constant speed), no status tags,
  "…" bubbles (OE.say text ignored), hover card shows activity, zoomTo any plan object.
- `office-sim.js`: talk = OE.converse bubbles at desk; commit = plane flies to outbox;
  handoff = envelope flies; ambient loop has no walking; walks only deploy/whiteboard/arrive/wake/clockOff.

## Checklist
- O1 less movement + rAF glide ........ done in engine/sim (verify)
- O2 no tags, hover card .............. done in engine (CSS pending)
- O3 "…" bubbles ...................... done in engine (CSS pending)
- O4 only agents/whiteboard/health/features interactive — TODO office-main.js hotspots
- O5 push+deploy left ................. done in layout/theme
- O6 no headless bodies ............... done (chair jacket removed)
- O7 minimal whiteboard zoom .......... TODO office-board.js
- O8 zoom glitch ...................... TODO (opaque scrim, pause anims, no drop-shadow filter, render board only on key change)
- O9 health zoom report ............... TODO office-board.js (route #health, app.js done)
- O10 features folder Now/Planned/Shipped — TODO office-board.js
- O11 feature page textareas .......... TODO office-board.js (+ Pixel "drop crypto" voice path → edit text)
- O12 chat panel strip ................ IN PROGRESS office-panel.js (remove mic, system/comm, quick replies, wait row)
- O13 list drop "Around the office" ... TODO office-main.js (+ tiny size switch in list footer)
- O14 config + demos .................. layout+data done; TODO spec-office-config.md
- office.css rewrite for all of the above, selftest update, build + headless shots (v4- prefix).

## Gotchas
- office-main.js / office-panel.js / office-board.js / office.css / selftest still v3 — build is broken until updated.
- OP.system, OE.declutterSoon, OE.pop, THEME_OFFICE.objects, OM_HOTS clock/outbox/printer/door are gone.
