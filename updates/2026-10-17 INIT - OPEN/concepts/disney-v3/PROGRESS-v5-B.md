# v5 — Builder B (the Office) — progress log

Owner: src/js/office-*.js (theme, layout, engine, panel, board, pager, sim, main, selftest),
src/js/data-office.js, src/css/office.css. Shared touch: src/manifest.txt (+ js/office-pager.js).
Never commit ai-control-disney-v3.html. Build: `python3 build.py`.

## Status
- B1 top bar dropped — room + chat fill the screen (office-main mount; css top-bar rules removed) — done
- B2 door = leave office (hotspot 'door', label "Leave office", door swings open → #projects) — done
- B3 wall safe behind the Director's desk = Access (hotspot 'safe' → openProjectAccess, masked) — done
- B4 health report: GitHub connected · private/public (+ Make public/private) and "Runs locally" — done; WS.testUrl removed
- B5 pager (office-pager.js) bottom-left; ▲▼/wheel/arrows; screen → OM.focusTeam (camera glides, pod glows) — done
- B6 Director = PROJECTS[i].orchestrator via wsDirectorAg()/wsAg(id) in data-office.js (fallback a-pixel → director) — done
- B7 Agent Creator moment: SIM_SCRIPT t=62 'create' beat (OS.H.create), spare desk via cfg.spare — done
- B8 % on the whiteboard + brass plaque on the Director's wall (THEME sync #bossPct/#bossBar) — done

- Extra (coordinator, from C's handoff): one office per project — wsUse(projectId) in data-office.js.
  PROJECTS[i].office (spec-office-config shape) → _wsFresh: own teams/solo + 1 spare desk, nameplate = project,
  greeting from its orchestrator, empty whiteboard/features/health ("first check after the first update"), story 'fresh'
  (ambient loop only). Projects without a config keep showing the Aurora demo. State is stashed per project (_WS_STORE).
  Sub-routes go through omGo(sub) → '#office/<id>/board' for non-Aurora, short '#board' forms kept for Aurora. — done

Self-test: 94 PASS, ALL PASS (?demo=selftest#office), no console errors on projects / office / office/atlas / cast.

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
end · creator (skip to t61; beat at t62) · pager / focus (t75, focus = first pager page) · safe · door ·
fresh (adds Kite Notes with its own office → #office/kite-notes) · orch2 (2nd orchestrator) · selftest
Shots: scratchpad shot.sh → shots/v5b-*.png

## Known gaps
- The bot "pop" is ~1s — headless stills catch walk-in and result, rarely the pop itself; judge in a real browser.
- Pod focus keeps the box's paint containment, so the zoomed room is clipped to its letterbox (dark bands top/bottom).
- Fresh offices reuse SIM_AMBIENT file names (PriceTag.tsx…) once the ambient loop starts.

## v6 — pager pages OFFICES (user: "only offices, not individual teams")
- office-pager.js is now global: self-mounts on document.body (#pager, fixed bottom-left, z 60), follows
  hashchange itself; shown on Projects/Cast/Access/Blueprint and in every office; hidden on #new… / #setup…
  routes and while an office board layer is open; sits above the chat drawer in offices < 900px.
- One page per project: logo tile + name + calm line ("Scarlett needs you" / "2 need you" / the project's note).
  Press → that office (#office for Aurora, #office/<id> otherwise).
- Sources (data-office.js wsPagerOffices): WS.pending of the live office, _WS_STORE offices, and projects
  with status 'needs' (their note). The office you're standing in never pages you (its "!" does).
- Rule kept: OPG.enter(pid) on office mount, OPG.leave() on closeOffice → wsPagerVisited marks that
  office's asks seen (PAGER.seen, keyed project:ask); a NEW ask brings it back with one wiggle.
- Removed: team focus (OM.focusTeam/unfocusTeam, OE.focusRect/_glow, #oUnfocus, .o-podglow, ?demo=focus).
- Self-test ALL PASS; no console errors on projects/cast/access/blueprint/office. Shots: shots/v6p-*.png.
- Gap: on Projects the floating pager can cover the last back-lot card when scrolled to the very bottom
  (studio padding is C's CSS).
