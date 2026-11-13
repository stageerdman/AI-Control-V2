# PROGRESS — F1b Engine for real work (server) — ⏳ in progress

Resume notes. Plan: `update v1.md` (Overnight final build → F1b). Backend docs: `updates/2026-11-13 BACKEND - OPEN/`
(+ `idea-collaboration-design.md`), API: `server/README.md`. Commits prefixed `ENGINE F1b:`.

## Items
1. ✅ Collaboration design (B8) — plan `collaboration` (orchestrator ↔ captains/everyone, review gates), project storage,
   dispatch build → review(s) → done with bounded send-backs, events `handoff` / `review.*`.
2. ✅ Agent toolkits — `toolsmith` roles (QA, Quality), `~/.ai-studio/toolkits/<agentId>/` via `--add-dir`, `tools/<agent>/`.
3. ✅ Git worktrees per item — parallel-safe runs, merge back on accept, conflicts → calm send-back.
4. ✅ Project lifecycle & progress — live / needs / idle automatically, overall progress (features + goal) + target.
5. ✅ Gaps — goal replies in the orchestrator thread, report follow-ups carry the report, turn caps.
6. ☐ Live check (real runner, once).

## Done
- **1 (bdad639)** `src/domain/collaboration.ts` (schema, rules, placeholders, `gatesFor`, `parseVerdict`), plan `collaboration`
  (setup chat rule + example, resolved on accept, copied on finish), `src/crew/collaboration.ts` + routes (GET/PUT/design),
  dispatch: `everyone` vs `captains`, gates snapshotted per build item, review runs, rework (resumed session), bounded send-backs,
  events `collaboration.changed` / `handoff` / `review.approved` / `review.changes`; migration 15; fake brain answers `collaboration`
  and approves reviews. Tests: `test/domain/collaboration.test.ts`, `test/crew/collaboration.test.ts`.
- **2** migration 16 `roles.toolsmith` (QA, Quality), `PATCH /roles {toolsmith}`, runtime `toolkitsRoot` → `<home>/toolkits/<agentId>/`
  (0700) as the only `--add-dir`, compose "Your toolkit" section (`tools/<slug>/`, big picture), Cast catalogue `toolsmith`, reporters get
  WebSearch/WebFetch. Tests: `test/runtime/toolkit.test.ts`.
- **3** `src/git/worktrees.ts` (open / commitAll (never .env*, node_modules…) / merge ff-or-merge-commit, abort on conflict /
  close: commit first, `branch -d` only when merged), migration 17 (`workspace`, `merge_tries`), runtime `workdir` (must be under
  `<home>/worktrees`), dispatch: claim → launch (checkout, then run), accept → serial merge per project → `item.merged`; conflict →
  `merge-fix` back to the builder (≤ 2), else failed with the branch named; failed/cancelled/restart → shelve; any run ending pumps the
  queue (an item waiting on a hand-started run no longer sticks); the orchestrator is told items may run side by side in git projects.
  **Choice:** checkouts under the data dir, not `<project>/.ai-studio/worktrees` (project folder stays clean, no ignore rule needed).
  Tests: `test/git/worktrees.test.ts` (temp repos), `test/crew/worktrees-flow.test.ts` (parallel, conflict → fix, unresolved, reviews in
  the checkout, failed build keeps its branch).
- **4** `src/office/lifecycle.ts` on `bus.subscribeAll` (run/ask/goal/item/feature events → re-read the db): status needs/live/idle
  (draft/archived untouched), overall progress (features shipped/total, else current goal %), migration 18 `projects.target`
  (`PATCH /projects/:id {target}`), events `project.status` / `project.progress`, office view `status` + `progress`. Tests:
  `test/office/lifecycle.test.ts`; exact-sequence tests now ignore the lifecycle's own lines.
- **5** migration 19 (`thread_messages.goal_id`): dispatch `onPlanned` → the orchestrator's thread gets the user's goal + the plan reply
  (`planReply`: summary + "• item — who (checked by …)") or a calm error; collaboration redesigns land there too (`threads.record`).
  `POST …/threads/:agentId/messages {text, reportId?}` → the turn carries the report (title, summary, ≤ 4k body excerpt).
  Caps: agent 30 / review 15 / orchestrator 6 turns (env `AI_STUDIO_*_TURNS`; budgets 10/5/2 API-equivalent). Blockers found: agents
  could only run `git ls cat pwd` — no `npm`/`node`, so no installs or tests: default shell is now `dev` (+ `mkdir npm npx node`,
  `AI_STUDIO_AGENT_SHELL=safe` restores B5's), named exactly in the prompt; agents are told to commit (keeping .env/node_modules out);
  the project `.env` is copied into each checkout (0600, never committed). Tests: `test/office/goal-thread.test.ts`, worktrees `.env`.
