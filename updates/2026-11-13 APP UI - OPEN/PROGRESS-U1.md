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
3. ⏳ Cross-project asks (pager) + seen
4. ⏳ Office staffing view
5. ⏳ Reports (waits for `spec-reports.md`)
