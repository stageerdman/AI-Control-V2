# PROGRESS — F1b Engine for real work (server) — ✅ done (288 tests, live check run)

Resume notes. Plan: `update v1.md` (Overnight final build → F1b). Backend docs: `updates/2026-11-13 BACKEND - OPEN/`
(+ `idea-collaboration-design.md`), API: `server/README.md`. Commits prefixed `ENGINE F1b:`.

## Items
1. ✅ Collaboration design (B8) — plan `collaboration` (orchestrator ↔ captains/everyone, review gates), project storage,
   dispatch build → review(s) → done with bounded send-backs, events `handoff` / `review.*`.
2. ✅ Agent toolkits — `toolsmith` roles (QA, Quality), `~/.ai-studio/toolkits/<agentId>/` via `--add-dir`, `tools/<agent>/`.
3. ✅ Git worktrees per item — parallel-safe runs, merge back on accept, conflicts → calm send-back.
4. ✅ Project lifecycle & progress — live / needs / idle automatically, overall progress (features + goal) + target.
5. ✅ Gaps — goal replies in the orchestrator thread, report follow-ups carry the report, turn caps.
6. ✅ Live check (real runner) — build → QA review → merge, research → report; 1 bug found + fixed, re-confirmed live.

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

## Live check — 2026-11-14, real Claude Code CLI (2.1.322, claude-opus-5-5, the user's login), port 4391, real `~/.ai-studio`
Real db migrated 7 → 19 (backup: scratchpad `studio-backup-before-f1b.db`). Fresh project **F1b Live Check** (`~/dev/AI-Studio-Sandbox/f1b-live-check`)
via the API: draft → Setter (`305aae9`) → plan PATCHed (no crew call): specialists Pixel Pete (Frontend), Scarlett Scenario (QA,
toolsmith), Professor Prompt (Research, reporter) + collaboration `{gates: [{after: a-pete, reviewer: a-scar, kind: quality}], maxSendBacks: 1}`
→ accept → finish (collaboration on the project).
| step | what happened |
|---|---|
| goal "Add hello.html…" | 1 dispatch call: ONE item for Pete, gate snapshotted, no separate QA item (the prompt says gates run on their own) |
| build | Pete in `~/.ai-studio/worktrees/f1b-live-check/build-hello-html-9a277e86` on `studio/build-hello-html-9a277e86`: read CLAUDE.md, wrote hello.html, `git add` + `git commit` (one plain command each) — 7 turns, ≈ $0.14 API-equivalent |
| handoff → review | Scarlett in the SAME checkout: `git diff 305aae9444fc..HEAD`, read CLAUDE.md, wrote `tools/scarlett-scenario/check-hello.mjs`, ran it with **node** (dev shell), committed it, ended with `{"verdict":"approve",…}` — 9 turns, ≈ $0.12 |
| merge | fast-forward into main (`8c42155`, `47d10d6`), checkout removed, branch deleted; events `handoff`, `review.approved`, `item.merged`, `project.status` (idle), `project.progress` (100) |
| research "GitHub Pages vs Netlify" | 1 report item for the Professor: 2× WebSearch, 4× WebFetch, `file_report` → `rep_8TVb7Hz7tOB1` (table, recommendation, 6 sources) — 11 turns, ≈ $0.28 |
| **bug** | the report item's checkout + branch were left behind (its "done" path skipped the merge/put-away) → fixed (report items land like any item; failed/cancelled items settle after their checkout is put away) + regression tests; leftover removed by hand (no work in it) |
| re-run (fix only) | a short favicon research → `rep_q12-hAH1Kh0i`, 7 turns ≈ $0.17; `git worktree list` = main only, no `studio/*` branch ✅ |
Orchestrator thread after it: user goal + plan reply per goal (with `goalId`). Usage is plan usage (subscription); `costUsd` is the CLI's estimate.
Fixtures: `test/fixtures/live-f1b-{dispatch-gated,build-worktree,review-approve,report-web}.jsonl` → `test/crew/live-f1b.test.ts`.
Observed, not changed: the builder notes the project CLAUDE.md says "commit and push" (no remote → it didn't push); Scarlett used the
project `tools/` folder, not her toolkit, on a first, tiny job (the toolkit dir exists, empty).

## For the UI (F2) — exact shapes
- **Project** (`GET /projects/:id`, list): `+ collaboration: Collaboration | null`, `+ target: string | null`; `status` (live/needs/idle)
  and `progress` (overall %) now move on their own. `PATCH /projects/:id {target: string ≤ 40 | null}`.
- **Collaboration** = `{orchestratorTalksTo: 'captains'|'everyone', gates: [{after: teamId|agentId|'*', reviewer: agentId, kind:
  'quality'|'user-test'|'crash-test'|'security'|'review', why}], maxSendBacks: 0–3, summary}`.
  `GET /projects/:id/collaboration` → `{collaboration, designed}` · `PUT` (whole design) → `{collaboration, designed: true}` (409 message
  is human) · `POST /projects/:id/collaboration/design {ask?}` → `{reply, collaboration}` (also lands in the orchestrator thread).
  Setup: `plan.collaboration` (optional, `new-agent:N` / `new-team:N` before accept) — PATCH /drafts plan validates it (409).
- **Checklist item** (`GET …/work[/:goalId]`): `+ stage: 'build'|'review'|'merge'`, `gates: [{reviewer, kind, why}]`, `gateIndex`,
  `sendBacks`, `notes` (last reviewer notes), `reviews: [{reviewer, gate, verdict: 'approve'|'changes', notes, runId, at}]`,
  `buildRunId`, `workspace: {cwd, branch, base, main} | null`, `mergeTries`. Who holds it now = `stage === 'review' ?
  gates[gateIndex].reviewer : agentId`. A done item with gates has `gateIndex === gates.length`.
- **Events** (project stream):
  `checklist.item` + `stage?`, `holder?` (only when the item has gates) ·
  `handoff {itemId, goalId, from, to, kind: 'review'|'rework'|'merge-fix', gate?, note?}` (the envelope walk) ·
  `review.approved {itemId, goalId, reviewerId, gate, notes?}` ·
  `review.changes {itemId, goalId, reviewerId, gate, notes, sendBacks, final?}` (final = stops for the user) ·
  `item.merged {itemId, goalId, branch, commit?}` ·
  `collaboration.changed {orchestratorTalksTo, gates (count), summary}` ·
  `project.status {status}` · `project.progress {pct, shipped, total, target?, goalId?, goalPct?}` ·
  `thread.message` + `goalId?`.
- **Office** (`GET /projects/:id/office`): `+ status`, `+ progress: {pct, shipped, total, target, goal: {id, text, pct, status} | null}`.
- **Threads**: messages `+ goalId`; the orchestrator thread now holds goals (user line + plan reply, or `kind: 'error'` "I couldn’t
  plan that: …") → the UI's local "On the whiteboard…" director line can go (dedupe by `goalId`). Follow-up: `POST …/messages
  {text, reportId}` (the run gets the report; the user message keeps `reportId`) → drop the text prefix.
- **Roles**: `+ toolsmith: boolean`; `PATCH /roles/:id {toolsmith}` (a switch next to "files reports").
- Run caps now 30 / 15 / 6 turns; agents may run `mkdir npm npx node` (env `AI_STUDIO_AGENT_SHELL=safe` to turn off).

## Notes / decisions
- Worktrees live under the data dir (not inside the project) — the project folder stays exactly the user's; documented in README.
- A review verdict that isn't a clear approve counts as changes (bounded by `maxSendBacks`), so unclear reviews never let work through.
- Gates are snapshotted per item at dispatch; reviewers who left the project are dropped; the builder never reviews itself.
- Merge conflicts: up to 2 merge-fix rounds by the builder, then the item fails with its branch named; main is never left mid-merge.
- Thread chats with agents (not items) still run in the project folder itself, alongside item checkouts.
- Not done: features don't move to Shipped on their own (the user/orchestrator moves them); a captain still does its item itself.
