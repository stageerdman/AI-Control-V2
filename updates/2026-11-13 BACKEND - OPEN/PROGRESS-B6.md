# PROGRESS — B6 Orchestrator & Agent Creator — 🟡 in progress

Resume notes. Plan: `update v1.md`; lessons: `wiki.md`; API: `server/README.md`.
Live runs are **not approved** for B6 — FakeRunner only; the CLI path works by construction.

## Steps
1. ✅ Plan schema + invariants (`src/domain/plan.ts`), studio catalogue (emblems, look slots),
   `drafts.plan` validated, finish staffs from the validated plan.
2. ⏳ Structured agent calls (strict JSON contract, one repair retry, clear error), tool-less
   orchestrator runs in a scratch dir; setup chat `POST/GET /drafts/:id/chat`.
3. ⏳ Agent Creator (`mint`), `POST /drafts/:id/accept` (mint all briefs, then one tx).
4. ⏳ Dispatch: `POST /projects/:id/work` → checklist → runs (cap 2/project, one per agent).
5. ⏳ Fake brain for dev, end-to-end test, docs (README, wiki, Status).
