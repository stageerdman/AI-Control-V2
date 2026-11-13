# PROGRESS — B6 Orchestrator & Agent Creator — ✅ done (206 tests)

Resume notes. Plan: `update v1.md`; lessons: `wiki.md`; API + contracts: `server/README.md`.
Live runs were **not approved** for B6 — everything ran on the FakeRunner; the CLI path works by construction
(same `Runner` interface, `RunSpec.tools = []` → `--tools ""`).

## Done (28 new tests → 206 total)
1. ✅ `src/domain/plan.ts` (PlanSchema + `planIssues`/`assertPlan`, `pendingBriefs`, `staffingOf`),
   `src/domain/catalog.ts` (emblem ids, hues, look slots, crew-only gear); `drafts.plan` validated on PATCH (422/409);
   `/finish` refuses pending briefs (409) and staffs from `plan.teams` / `plan.specialists`.
2. ✅ `src/crew/structured.ts` — contract line, JSON extraction, zod + rules validation, one repair (resumes the
   session), `agent_error` 502; tool-less runs in `$AI_STUDIO_HOME/scratch`. `src/crew/setup-chat.ts` +
   `POST/GET /drafts/:id/chat` (atomic turn, one at a time per draft, events `chat.message` / `plan.changed` / `tokens` /
   `agent.status` on the draft stream).
3. ✅ `src/domain/creator.ts` (AgentDef/TeamDef + rules), `src/crew/creator.ts` (design → persist), `POST /drafts/:id/accept`
   (all briefs designed first, then ONE tx: roles + agents + teams + resolved plan + creator chat lines; `cast.created`).
4. ✅ `src/crew/dispatch.ts` + `src/db/work.ts` + migration 6 (goals, checklist_items); `POST/GET /projects/:id/work`,
   `GET …/work/:goalId`, `POST …/work/:goalId/cancel`; runtime `onFinished` hook; boot recovery.
5. ✅ `src/crew/fake-brain.ts` (default FakeRunner answers for every contract), `AI_STUDIO_RUNNER=fake` in main.ts,
   end-to-end test (`test/crew/flow.test.ts`), real-server check below, docs.

## Real check (free) — 2026-11-13
`AI_STUDIO_RUNNER=fake PORT=4329` with a temp home/sandbox (4319 left alone): draft → chat ("design a new team for docs")
→ accept minted *The Night Shift* (+ role, 2 agents) → finish scaffolded `fake-live-check` staffed with ship-it + the new
team → work "Write a hello page" → 2 items (a-semic for ship-it, the new captain) ran → goal done, 100 %. The project SSE
stream replayed setup.step ×18, chat.message ×3, plan.changed ×2, cast.created ×4, goal.changed ×2, checklist.item ×6,
progress ×3, run.started/finished ×2.

## Live smoke test (NOT run — needs the user's go)
One sandbox project, real CLI (`npm start`, port checked first):
1. `POST /drafts {mode:new, name:"Smoke Six", about:"A one-page hello site."}` → `POST /drafts/:id/chat {}` (orchestrator
   proposes) → `POST …/chat {text:"add a specialist for accessibility"}` (expect a `newAgents` brief).
2. `POST /drafts/:id/accept` → the Agent Creator designs one agent (role created or reused).
3. `POST /drafts/:id/finish` → scaffold + local commit (no remote).
4. `POST /projects/smoke-six/work {goal:"Add index.html saying hello"}` → 1–3 items → agent runs in the folder.
What it verifies: `--tools ""` + `--restricted` accepted together; the model follows the JSON contracts (or the repair
works); resume of a scratch-dir session for repair; whether the user's `~/.claude/CLAUDE.md` leaks into crew runs (look at
the init line in `~/.ai-studio/runs/<id>.jsonl`); captains' runs commit in the project.
Cost: 3 crew calls (no tools, 1 turn each, ~5–10k input tokens) + 1–3 agent runs. Reference point: B5's resumed 3-turn
run cost $0.139. Expect roughly **$0.5–1.5 total**; hard ceiling from the caps = 3 × $0.50 (+ up to 3 repairs × $0.50)
+ 3 runs × $1.00 ≈ **$6 worst case** (pass smaller run caps, or a 1-item goal, to lower it).

## Gotchas
- Port 4319 may belong to the Tauri app's backend — use another PORT for checks.
- Captains do their item themselves for now; real in-team delegation (captain → members) is a later phase.
- After a restart running items fail and queued ones are cancelled — post the goal again (nothing spends money unasked).
