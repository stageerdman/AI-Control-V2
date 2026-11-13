# Builder C — v5 progress (studio shell + project creation)

Owner files: src/js/studio.js, studio-new.js (new), data-studio.js, core.js, app.js,
src/css/base.css, studio.css, studio-new.css (new), src/shell.html (+2 lines in src/manifest.txt).

- [x] C1 rename AI Control → AI Studio in owned files (title, brand, masklock copy, GitHub instr).
      Remaining elsewhere: only the build output filename `ai-control-disney-v3.html` (build.py, shoot.sh,
      office-selftest.js comment) — kept so scripts keep working.
- [x] C3 PROJECTS gain `orchestrator` + `github {connected, private}`; flat `private`/`public`/`github:bool` gone.
      Cards: "<Orch> · N agents" and one GitHub badge.
- [x] C2 New project / Adopt flow — src/js/studio-new.js + src/css/studio-new.css (one sheet: dark stage + cream body).
      Steps: Start → Name/Folder → Orchestrator (stage = radiogroup) → Setter setup (checklist + progress; adopt
      reads first, marks kept items blue) → Orchestrator proposes team (Swap cycles 3 proposals; #1 asks the Agent
      Creator, who mints a real AGENTS entry + new TEAMS entry) → Open the office.
      Finish pushes PROJECTS[0] with `office: {project, director, teams:[{id, members}], solo:[]}` (spec-office-config shape).
      Fallbacks until Builder A's contract lands: setter/creator stand-ins, orchestrators() → [agentById('pixel')].
      core.js openSheet gained opts.cls + opts.onClose.
- [ ] Re-verify against Builder A's contract (a-setter look, orchestrators(), ROLES objects) once pushed.
- Known handoff: the committed Office still renders the static Aurora WS for any project id; Builder B should
  build WS from `projById(id).office` when present (new projects) and use `PROJECTS[i].orchestrator` as director.

## Resume notes
Build: `python3 build.py`. Shots: `./shoot.sh '<route>' v5c-<name>`; flow demo hooks `?demo=new-<0..6>` / `?demo=adopt-<0..6>` (3 setup running · 4 proposal · 5 minted · 6 creator at work).
Shared tree has other builders' WIP: verify with a scratch build of HEAD + own files (see report).
