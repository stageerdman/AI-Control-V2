# APP UI — v1

Status: **OPEN** · Opened 2026-11-13

## Goal
The whole AI Studio app, done: the selected prototype (Disney v6, `updates/2026-10-17 INIT - OPEN/concepts/disney-v3/`)
rebuilt inside the Tauri app (`app/`, React + Vite + Tailwind) and **fully functional on the real backend**
(`server/`), plus a new **Reports** space. Request verbatim: `user-request.md`.

## Decisions
- **Exactly the prototype.** Same screens, flows, characters, emblems, office, calm v4–v6 rules. The prototype
  is the spec; deviations only where real data demands it (noted in each phase).
- **Reports space (new):** in the office, a reports tray / paperwork spot next to the safe and whiteboard
  (calm, one more interactive object). Click → recent AI reports, newest first, simple and human-readable
  (title, who/which team, when, short summary → full report). Only roles/teams marked as *reporters* file
  reports; an agent files one through an MCP tool (`file_report`) during a run; research tasks naturally end
  in a report. Also reachable studio-wide (latest reports across projects).
- **Front-end stack:** React 19 + TypeScript + Tailwind v4 (already in `app/`), plain fetch + a tiny
  query/cache hook + an SSE hook (CORS is allowed for the app origins), hash/router with the prototype's
  routes. The prototype's character/emblem SVG generators are ported to TS modules (not re-drawn).
- **Dev mode free:** `AI_STUDIO_RUNNER=fake` runs everything end-to-end without using the subscription;
  live runs only with the user's go.

## Roadmap (each phase: tests + real run in the app before commit)
### U0 — Front-end foundation
Port tokens/fonts/base styles; port `hero` (robots, looks, poses, facings) and `emblem` to TS + React
components; app shell (nav: Projects · Cast · Access · Blueprint, AI Studio title, pager slot); router;
API client + query hook + SSE hook; error/empty/loading primitives. *Tests:* hero/emblem render, API client,
SSE reconnect.
### U1 — Backend gaps for the UI
Features (CRUD: status now/planned/shipped, description, vision); **project conversations** (chat with the
orchestrator or any agent on a project → runs that resume per thread; turn-to-face = UI); cross-project
open asks (pager); office staffing view (teams + solo + orchestrator per project); **Reports** (store,
`file_report` MCP tool, reporter flag on roles/teams, endpoints, events). *Tests* for each.
### U2 — Projects home + project setup space
Projects (on set / back lot / in setup, search), standalone setup space (`#new/<draft>`: start/adopt,
name, orchestrator pick, Setter progress streamed live, team step with orchestrator chat + plan, accept with
Tinker minting, open office).
### U3 — Cast
Agents lineup + hero zoom with in-game look arrows, custom roles, system crew; Teams roll call + squad zoom
(captain, jobs, add/remove, emblem picker, "what this team does", "how this team codes").
### U4 — The Office
Scene generated from the project's staffing; live agent states from events; chat side panel (orchestrator
default, any agent); "!" asks; pager (offices); door; safe → Access; whiteboard (progress + tasks from work);
features folder (Now/Planned/Shipped, editable text); health board → report (+ GitHub status); **reports
tray** → Reports space.
### U5 — Access + Blueprint
Key cabinet (masked), per-project grants; Blueprint (modules, scaffold tree, principles, freshness).
### U6 — Whole-app pass
End-to-end click-through on the fake runner, a11y + reduced motion, perf, packaging check (`tauri build`),
then one live demo run with the user's go.

## Status
- ⏳ U0 + U1 starting (parallel), plus a UX spec for the Reports space.
- ✅ **U1 — Backend gaps** (2026-11-13, FakeRunner only): features CRUD, project conversations (threads), pager asks + seen, `GET /projects/:id/office`, Reports (reporter flags, `file_report` MCP tool, endpoints, events, dispatch report items) — migrations 10–13, 23 new tests (242 total). Notes: `PROGRESS-U1.md`, API: `server/README.md`.
