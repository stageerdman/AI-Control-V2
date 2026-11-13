# PROGRESS — F1c Real team work (server) — ✅ done (311 tests, live check run)

Resume notes. Plan: `update v1.md` (Overnight final build). Builds on `PROGRESS-F1b.md`. API: `server/README.md`.
Commits prefixed `ENGINE F1c:`. `app/` is F2's — not touched here.

## Items
1. ✅ Captains delegate — captain splits a team item into member sub-tasks (structured, validated), members build in
   their own checkouts (cap respected), captain integrates (member branches → item branch, conflicts → member merge-fix,
   one bounded rework round), then the item's collaboration gates, then main. Events `team.split`, `handoff` delegate/deliver.
2. ✅ Features flow — goals link to a feature (created in "now" when needed); goal done → feature shipped (`feature.shipped`).
3. ✅ Run the app — `.project` `run:` (or package.json dev/start), `GET/POST /projects/:id/app[/start|/stop]`, `PATCH …/app {command}`,
   one process per project, log tail (redacted), url detection, stopped on shutdown; health shows it.
4. ✅ Real-app blockers — first goal on an empty project sets up the stack + records `run:` + fills CLAUDE.md project rules; "don't push".
5. ✅ Live check — fresh sandbox project, team captain → 2 members, gate review, merge, feature shipped, app started.

## Done
- **1 + 2 (37d0c8a)** `src/crew/team.ts` (contract `team-split`: `{mode: team|self, summary, subtasks ≤ 4}`, `splitIssues` — members
  of THIS team, one each, not all the captain's; member / integration task words; `parseRework`). Dispatch: a fresh item for a
  team's captain in a git project on a team with ≥ 2 members → the captain's split (read-only tools in the item's checkout, 8 turns;
  any failure → the captain does it itself) → sub-task items (`parentId`, migration 20) in checkouts branched off the item's branch
  (`worktrees.open(…, {branch})`), sharing the parallel cap (the waiting team item holds no seat) → each accepted part merges into the
  team item's checkout (`deliver`; conflicts → member `merge-fix`) → `teamPhase: integrate`: the captain's run sees every part (or
  "did NOT finish") and may send parts back once (`{"rework": […]}` → "Rework: …" sub-tasks, round 1) → then the normal build flow:
  gates, merge into main. Cancel: members' parts first, then the team item. Features: dispatch gets `Features` + may answer
  `feature: {id} | {name, description}, ships?`; new → Now, planned → Now, goal pct → feature pct, goal done → Shipped +
  `feature.shipped`. Fake brain answers `team-split` (two teammates) and links a feature. Tests: `test/crew/team-flow.test.ts` (14).
- **3 (c6d10ae)** `src/apps/run-command.ts` (`.project` `run:` line, package.json dev/start fallback, `projectState`),
  `src/apps/app-runner.ts` (sh -c in the project folder, own process group, minimal env + `BROWSER=none`, local URL detection, 200-line
  tail ANSI-stripped + secrets masked, SIGTERM→SIGKILL, stop-all on shutdown, `app.status`), routes `GET/PATCH /projects/:id/app`,
  `POST …/app/start|stop`, health GET `+ app`. Tests: `test/apps/app-runner.test.ts` (4, real processes).
- **4** (in 1's commit) dispatch tells the orchestrator `The project right now: {hasCode, run}`: an empty project's FIRST item sets up the
  stack, records `run:` in `.project`, fills CLAUDE.md "Project-specific rules"; no run line yet → whoever touches it records one. Every
  build brief: "Do not push" (the project CLAUDE.md says commit AND push; the studio merges) + record `run:` when it changes how the app
  starts; integration reminds the captain too.
- **4b (e4a00d2) one backend per data dir** — found live (below): `src/data-lock.ts`, `<home>/server.lock {pid, port, startedAt}`
  taken in `main.ts` before the db opens; a live holder → the second backend refuses to start ("Another AI Studio backend (pid …, port …)
  already uses …"); a dead pid is stale and taken over; released on exit. Test: `test/data-lock.test.ts`.
- **5 (b57f17b)** live check + the verdict fix (whole JSON verdict lines parse first) + fixtures `test/fixtures/live-f1c-*.jsonl` →
  `test/crew/live-f1c.test.ts` (fails without the fix).

## Live check — 2026-11-14, real Claude Code CLI (2.1.322, claude-opus-5-5, the user's login)
New team **F1c Web Crew** (in the real Cast): captain Captain Semicolon (lead, server + split math), Pixel Pete (page), Twinkle
(styles); specialist Scarlett Scenario (QA, toolsmith); collaboration: quality gate after the team → Scarlett, maxSendBacks 1.
**Run 1** (real `~/.ai-studio`, port 4391, project `tip-splitter`): orchestrator planned 2 items + feature `f-tip-splitter`; item 1 the
captain kept (self) → Scarlett approved → merged; item 2 split three ways (captain + Pete + Twinkle, cap 2 queued Twinkle), all three
merged into the team branch, integration started — then **the desktop app's backend (pid 18444, port 4319) started on the same
`~/.ai-studio`** and its startup recovery marked the running item "Interrupted: the studio restarted" and put its checkout away (work
kept on `studio/build-the-split-math-…-0da62ea2`, incl. the captain's integration commit). → fix 4b (data-dir lock).
**Run 2** (isolated copy of the db, scratchpad `live-home`, port 4392 — so the other backend couldn't interrupt it again; project
**Tip Splitter 2**, `~/dev/AI-Studio-Sandbox/f1c-tip-splitter-2`, created via the API: draft → Setter → plan PATCH → accept → finish):
| step | what happened |
|---|---|
| goal | 1 dispatch call: told `{"hasCode":false,"run":null}` → item 1 "Set up the Node project, split math module and its test", item 2 the page; both to the captain; new feature **f-tip-splitter-2** in Now with a description |
| item 1 | captain split → `self` ("all backend groundwork") → built in its checkout: package.json (no deps), `server.js`, `src/split.js` + tests, `run: node server.js` in `.project`, CLAUDE.md "Project-specific rules" (stack / run / test / layout) → Scarlett reviewed (her approve wasn't read — **bug**, see below) → one rework round → approved → ff-merged |
| item 2 | captain split → `team`: **Pete** "Build the page form and live result" + **Twinkle** "Style the page" (parallel, own checkouts off the team branch) + the captain's own "server tests" part (`parallel: false`, after them); events `team.split` + 3× `delegate`, 3× `deliver` |
| integrate | captain in the team checkout: `git diff --stat`, read the parts, `npm test`, wrote `public/app.test.js` (fake DOM), committed — no rework sent |
| gate | Scarlett: `node --test` 36/36, a QA smoke script booting `node server.js` (`tools/scarlett-scenario/`), approve → merged into main |
| feature | goal done → `f-tip-splitter-2` **Shipped** (pct 100), `feature.shipped`; office progress 100 (1/1), status idle |
| app | `POST /projects/tip-splitter-2/app/start` → `node server.js` (from `.project`), url `http://localhost:3000` detected from its log, page + `/split.js` served; screenshot `shots/f1c-tip-splitter-app.png`; `/health` shows `app`; stop → port free |
9 runs, 87 turns, ≈ $2.83 API-equivalent (subscription usage). `git worktree list` = main only, no `studio/*` branch left.
**Bug** — Scarlett's first review ended with a correct `{"verdict": "approve", "notes": "… returns {ok:false, field, message} …"}`; the
brace-free verdict regex skipped it, the reply counted as unclear = changes → a wasted rework round. Fixed (whole JSON lines first);
confirmed by replaying her real stream (`live-f1c-review-braces`) — no live re-run needed for a pure parser fix.
Not done here: the run-1 project `tip-splitter` stays in the real db with its failed goal (branch kept); run 2's project lives in the
isolated db only — its folder is in the sandbox, adoptable from the app.

## For the UI (F2) — exact shapes
- **Checklist item** (`GET …/work[/:goalId]`): `+ parentId: string|null`, `teamPhase: null|'members'|'integrate'`, `teamRounds`,
  `teamPlan: string|null` (the captain's split in a sentence — also for "self"), `subtasks: ChecklistItem[]` (a member's sub-tasks, same
  shape, `parentId` set, rework rounds appended as "Rework: …" with `notes`). Sub-tasks never appear at the goal's top level; `goal.pct`
  counts top-level items. Who holds a team item: `teamPhase === 'members'` → its running sub-tasks' agents; `'integrate'` → the captain.
- **Goal**: `+ featureId: string|null`, `ships: boolean`.
- **Events**: `team.split {itemId, goalId, captainId, teamId, mode: 'team'|'self', summary, subtasks: [{itemId, agentId, text}], round}` ·
  `handoff` kinds `+ 'delegate'` (captain → member) `+ 'deliver'` (member → captain, merged into the team branch), `+ parentId?` (on
  team handoffs `itemId` is the sub-task) · `checklist.item` `+ parentId?`, `+ teamPhase?` · `feature.shipped {featureId, goalId, name}` ·
  `app.status {status: 'running'|'stopped'|'exited', url?, exitCode?}`.
- **App**: `GET /projects/:id/app` → `{status, command, source, url, pid, startedAt, exitCode, log[]}` · `POST …/app/start` (202; 409
  running / no command — message is human) · `POST …/app/stop` · `PATCH …/app {command}` (writes `run:` in `.project`). Health GET `+ app:
  {status, url, command}`.
- **Backend lock**: a second backend on the same data dir now exits 1 with "Another AI Studio backend (pid …, port …) already uses …" —
  the desktop app should reuse the running backend (its port is in `<home>/server.lock`) instead of starting its own.
