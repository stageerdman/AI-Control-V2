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

## Overnight final build (2026-11-14) — "a final app … real AI … tested properly … build real apps in the morning"
Live runs on the user's Claude Code subscription are approved for this build (real-AI testing), kept purposeful.
- **F1a — Cast finish (U3):** roles editor + reporter switches, verify the whole Cast on the backend, screenshots.
- **F1b — Engine for real work (server):** collaboration design (B8: orchestrator-designed communication plan —
  who talks to whom, review/handoff gates such as QA / quality manager / user tester, optional crash tester;
  agent toolkits folder for quality/test agents); **git worktrees per run** so agents can work in parallel safely
  and merge back; project status lifecycle; orchestrator replies to goals persisted in its thread; report
  follow-ups carry the report; overall project progress (target + features).
- **F2 — Whole-app pass (U6):** UI for collaboration (plan in setup team step, handoffs/reviews visible in the
  office), gaps from U2/U4/U5 notes, end-to-end click-through, a11y/reduced motion, release build that works from
  Finder.
- **F3 — Real-AI end-to-end:** through the real app/API with the real runner: create a real small app project,
  orchestrator chat → plan → Tinker → work with reviews → reports → health; fix every issue found; repeat until
  it reliably builds a working app.
- **F4 — Ship:** final `.app`, a short "How to use AI Studio" guide, status + memory.

## Status
- ✅ U0 front-end foundation — characters ported byte-identical (823 golden cases, 0 px diff vs the prototype gallery), tokens, API client + query + SSE hooks, shell/router/placeholders, ui primitives, #gallery; 60 tests (PROGRESS-U0.md, app/src/README.md).
- ⏳ U0 + U1 starting (parallel), plus a UX spec for the Reports space.
- ✅ **U1 — Backend gaps** (2026-11-13, FakeRunner only): features CRUD, project conversations (threads), pager asks + seen, `GET /projects/:id/office`, Reports (reporter flags, `file_report` MCP tool, endpoints, events, dispatch report items) — migrations 10–13, 23 new tests (242 total). Notes: `PROGRESS-U1.md`, API: `server/README.md`.
- ✅ **U5 — Access + Blueprint** (2026-11-13, FakeRunner only): Key Cabinet on `/credentials` (masked last-4, add/edit/replace with a write-only uncontrolled key field, import from .env, delete = not restorable + holders), reusable `ProjectAccessPanel` for the office safe (grants + sync, names only), Blueprint (real scaffold tree, module texts read-only, principles, per-project freshness); server: module body/mtime + `claudeMdGenerated`. 16 UI tests incl. DOM leak tests; live headless run, no secret in DOM/logs. Notes + gaps: `PROGRESS-U5.md`, shots `u5-*.png`.
- ✅ **U2 — Projects home + setup space** (2026-11-13, FakeRunner only): Projects (in setup / on set / back lot, search, cards with tile, orchestrator, mini-cast, progress, GitHub badge; Reports button + unread dot), standalone `#new/<draft>` in the user's order Start · Name · Orchestrator · Setup · Team (Setter live over SSE via the new draft-level `POST /drafts/:id/setup`, then team chat + plan + accept with Tinker minting, finish = create the project on set → office), drafts as "In setup" cards with delete + undo (a set-up folder is always kept). Server: migration 14, finish no longer scaffolds. 23 app + 4 server tests; new + adopt clicked in headless Chrome. Notes: `PROGRESS-U2.md`, shots `u2-*.png`.
- ✅ **U4 — The Office + Reports + pager** (2026-11-13, FakeRunner only): office generated from staffing (+ Reports tray), live robots from `agent.status`/asks over SSE (asleep = no session), chat panel (threads, ask cards, goals → whiteboard via Start work / intent), whiteboard/health (run check)/features CRUD/reports zoom cards, door, safe → Access, list mirror, keyboard; Reports list/page/archive+undo/follow-up + studio `#reports`; global pager (asks?unseen, leaving = seen). 52 office+reports tests; full flow clicked in headless Chrome. Notes + gaps: `PROGRESS-U4.md`, shots `u4-*.png`.
