# Builder A (v5) — progress log

Owner files: data-cast.js, hero.js, emblem.js, gallery.js, cast.js, teams.js, cast.css, hero.css, emblem.css.
Shared working tree with builders B/C: commit ONLY own paths; `git pull --rebase --autostash`; never commit the html.

## Checklist
- [x] Contract in data-cast.js + hero.js look system (commit 43da2ae), note at top of BRIEF-v5.md
- [ ] A1 ~8 new emblems
- [ ] A2 Studio crew group in Cast + Required marker + delete rules
- [ ] A3 Custom roles combobox + rename/delete
- [ ] A4 In-game look arrows + dice on hero zoom; drop look chips + name dice
- [ ] A5 "Used in N projects · each project runs its own copy — no shared memory."
- [ ] A6 Teams with custom roles (exclude system agents from crew strip; no role badges)
- [ ] Verify: shots v5a-*, cast click-test (scratchpad runtest.sh + test.js.html)

## Notes / gotchas
- agent.role = role NAME (not id) so office/teams display code keeps working.
- ROLES records have a non-enumerable toString → name (data-office _wsGen puts the record in role).
- Office currently throws `OPG is not defined` (builder B WIP, pager module not in manifest yet) — not ours.
