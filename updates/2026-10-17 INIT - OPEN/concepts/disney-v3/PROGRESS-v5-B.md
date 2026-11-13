# v5 — Builder B (the Office) — progress log

Owner: src/js/office-*.js (theme, layout, engine, panel, board, pager, sim, main, selftest),
src/js/data-office.js, src/css/office.css. Shared touch: src/manifest.txt (+ js/office-pager.js).
Never commit ai-control-disney-v3.html. Build: `python3 build.py`.

## Status
- B1 top bar dropped — room + chat fill the screen (office-main mount; css top-bar rules removed) — done
- B2 door = leave office (hotspot 'door', label "Leave office", door swings open → #projects) — done
- B3 wall safe behind the Director's desk = Access (hotspot 'safe' → openProjectAccess, masked) — done
- B4 health report: GitHub connected · private/public (+ Make public/private) and "Runs locally" — done; WS.testUrl removed
- B5 pager (office-pager.js) bottom-left; ▲▼/wheel/arrows; screen → OM.focusTeam (camera glides, pod glows) — done, verifying
- B6 Director = PROJECTS[i].orchestrator via wsDirectorAg()/wsAg(id) in data-office.js (fallback a-pixel → director) — done
- B7 Agent Creator moment: SIM_SCRIPT t=62 'create' beat (OS.H.create), spare desk via cfg.spare — done, verifying
- B8 % on the whiteboard + brass plaque on the Director's wall (THEME sync #bossPct/#bossBar) — done

## Design notes
- Pager entries = wsPager(): pending asks grouped per team / solo agent, minus WS.pager.seen.
  A visit (pager → focus) ends on Esc / "← Whole office" / another page / a layer / leaving:
  its asks are marked seen (OPG.leave). Clicking an agent directly also marks theirs seen.
  A NEW ask id brings the team back (with one small wiggle).
- Camera: OE._camTo shared by zoomTo (objects, scrim) and focusRect (pods, room stays live, zmax 2.1).
  Same perf rule: GPU layer during the move, --z + glow only after it lands.
- Creator = WS.agents visitor (onProject:false, visitor:true) → never in List / pager / ambient.
  Stand-in agent if the roster lacks a-creator. New agent minted into AGENTS (Cast) + WS + config.solo.

## Demo hooks (?demo=…)
end · creator (skip to t61; beat at t62) · pager / focus (t75, focus = first pager page) · orch2 (2nd orchestrator) · selftest
Shots: scratchpad shot.sh → shots/v5b-*.png
