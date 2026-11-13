# PROGRESS — U1 Backend gaps for the UI — ✅ done (242 tests, FakeRunner only)

Resume notes. Plan: `update v1.md` (U1); backend docs: `updates/2026-11-13 BACKEND - OPEN/` + `server/README.md`.
FakeRunner only — no live runs (not approved for this phase).

## Items
1. ✅ **Features** — migration 10 (`features`), `src/db/features.ts` (dense order per status), `src/office/features.ts`
   (service + `feature.changed`), `src/routes/features.ts`. `feature.changed` redefined to the prototype's statuses
   (now/planned/shipped; it had no publisher yet). 4 tests.
2. ✅ **Project conversations** — migration 11 (`thread_messages`), `src/office/threads.ts`, `src/routes/threads.ts`;
   runtime `StartRun.bigPicture` (own prompt, `tools: []`, no secrets, no ask bridge) for the orchestrator's chat;
   `health.latest()`; event `thread.message`. Replies are the run's final result (one event per message — the live
   "typing" state is the agent's `agent.status` working/waiting). 5 tests.
3. ✅ **Cross-project asks** — migration 12 (`asks.seen_at`), `runsRepo.studioAsks/markSeen`, `GET /asks`, `POST /asks/seen`. 2 tests.
4. ✅ **Office staffing view** — `src/office/office.ts`, `GET /projects/:id/office` (config shape + latest status via `json_extract` over `agent.status` events, stale-busy → idle, `lastEventId` for a gap-free SSE start). 2 tests.
5. ✅ **Reports** (per `spec-reports.md` §4) — migration 13 (`reports`, `reporter` on roles/teams, `checklist_items.report`,
   `thread_messages.report_id`, starter reporters marked: role Research, team The Expedition; seed too). `src/reports/reports.ts`
   (canFile, file: stamped + masked + ≤ 2/run, list/get/patch/studio, byRun, unreadTitles), `src/routes/reports.ts`,
   `POST /internal/runs/:runId/reports` (token), `file_report` on the ask_user MCP server (listed only with `AI_STUDIO_REPORT_URL`),
   runtime `ReportDesk` seam (`askBridge.reportUrl`, `RunIO.report`, FakeRunner `{report}` step), dispatch `report` items (reporter only,
   done only when filed, `reportId` on items), threads' one-line reply, orchestrator summary `unreadReports`, reporter flags in the Cast
   catalogue + setup-chat/dispatch/orchestrator-chat guidance, fake brain files a report for report items. 7 + 2 tests.

## Real check (free) — 2026-11-13
`AI_STUDIO_RUNNER=fake PORT=4359`, temp home/sandbox/control (4319 and the real `~/.ai-studio` untouched). Aurora given a folder +
Professor Prompt as a specialist, then curl: features created/moved (Multi-currency to the top of Now → Voice search order 2);
`/office` → director a-pixel, ship-it (captain a-semic) + polish (a-lint), solo incl. a-prof, statuses `done` after the chats;
threads with a-pixel and a-pete → user message 202, reply stored a moment later, `busy:false`; a-maestro → 409 "isn’t on Aurora";
`/asks` + `/asks/seen` answer (the fake brain never asks — the pager path is covered by tests); goal "Research payment providers
for checkout" → one `report: true` item for a-prof → fake run filed `rep_…` → item done with `reportId`, goal done 100 %;
`/projects/aurora/reports` (no body, unread 1) and `/reports` (with projectName). SSE replay: feature.changed ×3, thread.message ×4,
report.filed ×1, plus the usual run/goal events.

## For the UI builders (U2–U4)
- **Office on load:** `GET /projects/:id/office`, then SSE `/projects/:id/events?after=<lastEventId>`. Agents in `agents{}` are keyed by
  id; the director is the orchestrator's real agent id (the prototype's actor id `pixel` maps to it).
- **Chat:** `POST …/threads/:agentId/messages` returns 202 immediately; render the user bubble from the response, show "typing" while
  `busy` / the agent's `agent.status` is working, append the reply from the `thread.message` event (`from: 'agent'`). `kind: 'error'`
  = the turn failed (show it calmly). A message with `reportId` = "Open report". 409 = busy / not on project (show `message`).
  "!" asks keep using `/projects/:id/asks` + `/answer`.
- **Pager:** poll `GET /asks?unseen=true` (there is no studio-wide event stream); group by `projectId`; on leaving an office,
  `POST /asks/seen {projectId}`.
- **Features:** `order` is 1-based within a status; PATCH `{status, order}` to move; texts are plain blocks.
- **Reports:** list rows have no `body`; open → `GET …/reports/:rid` then `PATCH {read: true}`; tray dot = `unread`; studio header dot =
  `GET /reports` `unread`. Live: `report.filed` / `report.read` / `report.archived`. Cast switches: `PATCH /roles/:id {reporter}`,
  `PATCH /teams/:id {reporter}`.
- Fake runner: chats echo ("Got it — …"), research-like goals ("research / compare / investigate / find out / write up / review /
  status of") with a reporter on the project end in a fake report.

## Not done / notes
- No live run (not approved). A live check would be: one orchestrator chat turn (no tools, ~1 turn), one agent chat turn, and one
  research goal for a reporter that calls `file_report` through the real MCP server.
- Replies arrive whole (the final result), not token-streamed; the agent's activity streams as `agent.status`.
- `report.read`/`report.archived` are on the project stream only; the studio-wide `#reports` should re-fetch `/reports`.
