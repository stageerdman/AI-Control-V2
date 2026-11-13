# PROGRESS — U1 Backend gaps for the UI — ⏳ in progress

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
