# Builder C — v5 progress (studio shell + project creation)

Owner files: src/js/studio.js, studio-new.js (new), data-studio.js, core.js, app.js,
src/css/base.css, studio.css, studio-new.css (new), src/shell.html (+2 lines in src/manifest.txt).

- [x] C1 rename AI Control → AI Studio in owned files (title, brand, masklock copy, GitHub instr).
      Remaining elsewhere: only the build output filename `ai-control-disney-v3.html` (build.py, shoot.sh,
      office-selftest.js comment) — kept so scripts keep working.
- [x] C3 PROJECTS gain `orchestrator` + `github {connected, private}`; flat `private`/`public`/`github:bool` gone.
      Cards: "<Orch> · N agents" and one GitHub badge.
- [ ] C2 New project / Adopt flow (studio-new.js) — see below.

## Resume notes
Build: `python3 build.py`. Shots: `./shoot.sh '<route>' v5c-<name>`; flow demo hooks `?demo=new-<step>` / `?demo=adopt-<step>`.
