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

## Checklist — ALL DONE (self-test ALL PASS, no console errors on full story / size2 / size20)
- O1 less movement: talk/handoff/commit happen at desks (bubbles, flying paper); ambient loop never walks;
  walks only for deploy, whiteboard, arrive, wake, clock-off. rAF glide + timer fallback, cancelable — done
- O2 no tags; activity in hover/focus card (.o-card) — done
- O3 talk = "…" bubble only (OE.say ignores text) — done
- O4 hotspots: dossier, whiteboard, health only; clock is plain decor above the door — done
- O5 push box + deploy on the left wall — done
- O6 no jackets / headless bodies (chair = just a chair) — done
- O7 #board: big %, In progress, Tasks — done
- O8 zoom: opaque scrim (no filter/blur), scene animations paused, card re-renders only when HTML changes,
  removed drop-shadow filter on the huge SVG — done (headless catches the fade mid-way; real browser fine)
- O9 #health: Modularity/Cleanliness/Reusability with grade word + Good + To fix — done (app.js route)
- O10 #features: Now/Planned/Shipped identical rows, green check mark for shipped — done
- O11 feature page: two textareas, Save & brief Pixel, unsaved-changes confirm; voice "drop X from Y" → OB.stageDrop — done
- O12 chat: header + log + composer; asks still work; per-agent threads + face-you kept — done
- O13 list: no "Around the office"; tiny size switch at bottom — done
- O14 config → layout; ?demo=size2|size6|size12|size20; spec-office-config.md — done

## Verify
python3 build.py; self-test: Chrome headless --virtual-time-budget=60000 --dump-dom "...html?demo=selftest#office"
Shots (gitignored, local): shots/v4-*.png. Demo hooks: t<sec>, end, chat, talk, list, peek, sleepy, fast, sizeN.

## Known gaps / next
- Top bar (GitHub · Private · Test · Access · bell) untouched — candidate for the next declutter.
- Non-Aurora sizes run only the ambient loop (no Act 1 asks); generated agents/teams are pushed into AGENTS/TEAMS (visible in Cast in demo mode).
- Walk smoothness can't be judged from headless stills — check in a real browser.

## Gotchas
- `.ob-card` kinds use class `ob-k-<kind>` (`.ob-health` is the report list).
- headless --dump-dom doesn't fire rAF → glide has a 48ms timer fallback.
