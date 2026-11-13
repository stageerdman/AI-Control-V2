# Builder A (v5) — progress log

Owner files: data-cast.js, hero.js, emblem.js, gallery.js, cast.js, teams.js, cast.css, hero.css, emblem.css.
Shared working tree with builders B/C: commit ONLY own paths; `git pull --rebase --autostash`; never commit the html.

## Checklist
- [x] Contract in data-cast.js + hero.js look system (commit 43da2ae), note at top of BRIEF-v5.md
- [x] A1 ~8 new emblems
- [x] A2 Studio crew group in Cast + Required marker + delete rules
- [x] A3 Custom roles combobox + rename/delete
- [x] A4 In-game look arrows + dice on hero zoom; drop look chips + name dice
- [x] A5 "Used in N projects · each project runs its own copy — no shared memory."
- [x] A6 Teams with custom roles (exclude system agents from crew strip; no role badges)
- [x] Verify: shots v5a-*, cast click-test (scratchpad runtest.sh + test.js.html)

## Notes / gotchas
- agent.role = role NAME (not id) so office/teams display code keeps working.
- ROLES records have a non-enumerable toString → name (data-office _wsGen puts the record in role).
- Office currently throws `OPG is not defined` (builder B WIP, pager module not in manifest yet) — not ours.

## Status
DONE (all items). Cast click-test: scratchpad runtest.sh + test.js.html — 70 checks pass.
Shots: shots/v5a-cast.png, v5a-hero-arrows.png, v5a-setter.png, v5a-roles.png, v5a-orchestrator.png,
v5a-creator.png (820px), v5a-teams.png, v5a-squad-picker.png, v5a-emblems-new.png, v5a-emblems.png, v5a-looks.png.
Demo hooks: ?demo=tag:<slot> (show a look tag), ?demo=roles (role editor open).
Follow-ups (not done): projects referencing a deleted orchestrator are not reassigned (useOrchestrator falls back
to the first one); Pizza Planet emblem is the weakest of the 8 at 24px.
