# AI Studio server

Local backend for AI Studio: the Cast (roles, agents, teams, system agents), projects and
setup drafts. TypeScript on Node 25, Fastify, zod, built-in `node:sqlite`. Run from source via tsx — there's no build step.

## Run

```sh
npm install
npm run dev        # watch mode on http://127.0.0.1:4319
npm start          # same, no watch
npm test           # vitest (in-memory sqlite + temp sandbox, Fastify inject)
npm run typecheck  # tsc --noEmit
npm run lint       # biome check   (npm run format to auto-fix)
```

The first start creates the data dir and sandbox, migrates the db and seeds the prototype
cast (14 agents, 10 roles, 4 teams, 9 projects). The seed runs once per database and never
brings back things you deleted.

## Environment

| Var | Default | What |
|---|---|---|
| `AI_STUDIO_HOME` | `~/.ai-studio` | data dir (`studio.db`), created 0700 |
| `AI_STUDIO_SANDBOX` | `~/dev/AI-Studio-Sandbox` | every project folder must resolve inside it |
| `AI_CONTROL_HOME` | `~/.ai-control` | global modules (read only) + secrets: `.env` is the one file we write here (0600, atomic, other lines kept) |
| `PORT` | `4319` | |
| `HOST` | `127.0.0.1` | local only by default |
| `AI_STUDIO_CLAUDE_BIN` | first of `/opt/homebrew/bin/claude`, `/usr/local/bin/claude`, `~/.claude/local/claude`, `~/.local/bin/claude` | Claude Code CLI for agent runs (absolute path; never a shell alias) |
| `AI_STUDIO_MODEL` | `claude-opus-5-5` | model for agent runs |
| `AI_STUDIO_AGENT_TURNS` · `AI_STUDIO_REVIEW_TURNS` · `AI_STUDIO_ORCHESTRATOR_TURNS` | 30 · 15 · 6 | turn caps per kind of run (budgets: $10 · $5 · $2 API-equivalent size caps — the subscription is used, nothing is charged); a goal's own `caps` still win |
| `AI_STUDIO_AGENT_SHELL` | `dev` | shell commands agent runs may use, one plain command at a time: `dev` = `git ls cat pwd mkdir npm npx node` (building real apps: install, run tests); `safe` = B5's `git ls cat pwd`. G1: any of them may carry literal settings in front — `NAME=value [NAME2=value2] <cmd …>` (approved by a PreToolUse hook, `src/runtime/shell-hook.ts`; no `$`, backticks, `;`, `&`, `\|`, `<`, `>`, `( )`, `\\`; PATH / LD_… / DYLD_… / GIT_… / auth names refused). `git push` is denied in every shell |
| `AI_STUDIO_GH_BIN` | first of `/opt/homebrew/bin/gh`, `/usr/local/bin/gh`, `/usr/bin/gh` | GitHub CLI the studio runs for publishing, visibility and health (absolute path; tests and manual checks point it at a stub — never let a check create a real repo) |
| `AI_STUDIO_RUNNER` | (CLI) | `fake` = the free scripted runner + fake crew brain (UI work, demos): the whole setup → work flow runs without Claude |

**One backend per data dir** (F1c): the server takes `<AI_STUDIO_HOME>/server.lock` `{pid, port, startedAt}` before it opens the db; a
second backend on the same data dir exits with a message naming the holder (its startup recovery would mark the first one's running work
"interrupted"). A lock whose pid is gone is taken over.

## Layout

```
src/
  main.ts            entry: config → dirs → db → seed → listen
  app.ts             Fastify factory (deps injected) + shared error handler
  config.ts          zod env → paths
  errors.ts          AppError + parse(): { error: { code, message, details? } }
  fs/sandbox.ts      resolveInSandbox / toSandboxRelative (no '..', no escape via symlink)
  domain/            pure rules, no I/O: cast.ts, teams.ts, roles.ts, look.ts, ids.ts
  db/                connection, migrations (PRAGMA user_version), one repo per aggregate,
                     trash.ts (delete + restore tokens), store.ts (wires them)
  routes/            one file per resource
  blueprint/         modules → CLAUDE.md compile, scaffold file templates (read-only on AI Control home)
  secrets/           dotenv.ts (parse/format), secretStore.ts (atomic 0600 .env), cabinet.ts, projectAccess.ts
  setter/            scaffold/adopt/inspect, local git, finishDraft (draft → project)
  crew/              the studio crew: structured.ts (JSON contracts + one repair), setup-chat.ts,
                     creator.ts (Agent Creator, accept), dispatch.ts (goal → checklist → runs),
                     prompts.ts (Cast catalogue), fake-brain.ts (FakeRunner answers for every contract)
  crew/team.ts       F1c: a captain's split (team-split contract), member + integration tasks, rework parsing
  apps/              F1c: run-command.ts (how a project starts: .project `run:` / package.json), app-runner.ts (start/stop its app)
  git/               worktrees.ts: one checkout + branch per checklist item, merge back, never lose work
  health/            health.ts (read-only health check), git-status.ts (local git + optional gh visibility)
  reports/           reports.ts: who may file, file_report (stamped, secrets masked, ≤ 2 per run), list/read/archive
  office/            what the office screen needs: features.ts (features folder), threads.ts (project conversations),
                     office.ts (staffing + latest status for the scene), lifecycle.ts (status + overall progress)
  seed.ts            the prototype's cast and projects
test/                mirrors src
```

## API

CORS: only `http://localhost:1420`, `tauri://localhost` and same-origin; any other `Origin` gets 403.

Errors: `400 bad_request` (malformed JSON) · `404 not_found` · `409 conflict` (a studio rule
blocks it: second setter, last orchestrator, team full, captain not a member…) · `422 invalid`
(body fails validation or references an unknown id; `details` lists the issues) · `502 agent_error`
(an orchestrator / Agent Creator run failed, or its answer broke the contract twice; `details.issues`).
Bodies are strict — unknown keys are 422.

| | |
|---|---|
| `GET /health` | version, paths, db ok (503 when the db is down) |
| `GET POST /roles` · `GET PATCH DELETE /roles/:id` | user-defined role names; rename shows on every agent; `PATCH {name?, reporter?, toolsmith?}` — `reporter: true` = agents holding the role file reports; `toolsmith: true` = they keep a toolkit of their own checks (seed: QA, Quality) |
| `GET POST /agents` · `GET PATCH DELETE /agents/:id` | `kind` set at creation only; each agent carries `teamIds`, `projectIds`, `canDelete {ok, why}` |
| `GET POST /teams` · `GET PATCH DELETE /teams/:id` | `PATCH {captainId}` to change captain; `reporter: true` = runs for this team file reports |
| `POST /teams/:id/members` · `PATCH DELETE /teams/:id/members/:agentId` | add `{agentId, instr?, at?}` (`at` = put back at an old place, undo) / edit job / remove (captain passes on) |
| `GET POST /projects` · `GET PATCH /projects/:id` | `orchestratorId`, `teamIds` (teams first), `agentIds` (specialists), `folder` (sandbox-relative), `target` (≤ 40, "v1.0"; null clears), `collaboration` (read; set it via `/collaboration`). `status` and `progress` move on their own (see Lifecycle) |
| `DELETE /projects/:id` | 204; forgets the record, never touches the folder |
| `GET POST /drafts` · `GET PATCH DELETE /drafts/:id` | setup drafts: mode, step, orchestrator, `plan` (validated — see Plan below), `chat`, `setupAt`/`setupCommit` (set by `/setup`; the folder can't change after, 409). `DELETE` never touches the disk: a set-up draft's folder stays and the response says so (`keptFolder`, else null) — adopt it later |
| `POST /drafts/:id/chat` `{text?}` · `GET /drafts/:id/chat` | one orchestrator turn → `{reply, plan, chat}` (no `text` = the orchestrator opens with a proposal); history `{chat, plan}` |
| `POST /drafts/:id/accept` | the Agent Creator mints every `newAgents`/`newTeams` brief, the plan resolves to real ids — all or nothing → `{plan, minted: {roles, agents, teams}}`; `/finish` refuses until then |
| `POST /projects/:id/work` `{goal, caps?: {maxTurns, maxBudgetUsd}}` | the orchestrator breaks the goal into ≤ 8 checklist items for team captains / specialists → the goal (201); items run as agent runs (with `caps`), ≤ 2 at a time per project, one per agent |
| `GET /projects/:id/collaboration` | `{collaboration, designed}` — how the project's people work together (B8); `designed: false` = the default (captains, no gates) |
| `PUT /projects/:id/collaboration` | set it by hand (the whole design) → `{collaboration, designed: true}`; 422 malformed, 409 a gate names someone not on the project; event `collaboration.changed` |
| `POST /projects/:id/collaboration/design` `{ask?}` | the orchestrator (re)designs it for the people on the project now (crew contract `collaboration`) → `{reply, collaboration}`; saved + `collaboration.changed` |
| `POST /projects/:id/health` `{caps?}` | health check: a read-only run in the project folder grades modularity / cleanliness / reusability (A–F, `good`, `fix`) + git/GitHub status → the report (201), event `health.checked` |
| `GET /projects/:id/health` | `{latest, history (≤ 20, newest first), git, app: {status, url, command}}` — `git` is live and local only (no network); `app` = the project's app right now (F1c) |
| `GET /projects/:id/app` | the project's app (F1c): `{status: stopped\|running\|exited, command (null = nobody recorded how it starts), source: '.project'\|'package.json'\|null, url (the first local address it printed, else null), pid, startedAt, exitCode, log (last ≤ 200 lines, ANSI stripped, every known secret value masked), port (F3: the `PORT` the studio gave it while running, else null)}` |
| `POST /projects/:id/app/start` · `POST /projects/:id/app/stop` | start it (202; 409 when it's already running or no command is known) · stop it (the whole process group; SIGTERM, SIGKILL after 3 s) → the view. Runs `/bin/sh -c <command>` in the project folder on this Mac with the minimal run env (PATH, HOME…; never the server's env — the app reads its own `.env`), `BROWSER=none` and **`PORT`** — the project's own port (3100–3999, stable per project id, the next free one if another running app holds it; build briefs tell servers to read PORT, default 3000); one app per project; every app stops when the server shuts down. Event `app.status {status, url?, exitCode?}` |
| `PATCH /projects/:id/app` `{command}` | set how it starts: writes the `run: <command>` line in the project's `.project` (one line, ≤ 300; 409 without a `.project`) → the view |
| `GET /projects/:id/work[/:goalId]` · `POST /projects/:id/work/:goalId/cancel` | the whiteboard (goals newest first, items with status/run/note, `pct`) · stop a goal |
| `GET POST /projects/:id/features` · `GET PATCH DELETE /projects/:id/features/:featureId` | the features folder: `{name, status: now\|planned\|shipped (default planned), order (1-based in its status; default last), pct?, owner? (agent or team id), description, vision}` (plain text blocks); list = Now, Planned, Shipped, each in order; moves keep every group dense; event `feature.changed` (`deleted: true` on delete) |
| `GET /projects/:id/office` | the office on load: `{project, name, director (orchestrator id), teams: [{id, name, color, emblem, captain, members}], solo, agents: {agentId: {status, activity?, runId?, since?}}, status, progress: {pct, shipped, total, target, goal: {id, text, pct, status} \| null}, lastEventId}` — the prototype's office-config shape + each agent's latest `agent.status` (a "working"/"waiting" whose run ended or that predates this server's start reads `idle`; never reported = `idle`). Then open `/projects/:id/events?after=<lastEventId>` |
| `GET /projects/:id/threads/:agentId/messages` | the user's thread with the orchestrator or anyone on the project → `{projectId, agentId, busy, messages: [{id, from: 'user'\|agentId, kind: text\|error, text, runId, reportId, goalId, at}]}` (last 200, oldest first). The orchestrator's thread also records every goal: the user's goal line + its plan reply ("<summary>\n\nOn the whiteboard:\n• <item> — <who> (checked by <reviewers>)…", both with `goalId`, `runId: null`), or `kind: error` "I couldn’t plan that: …"; and a collaboration (re)design (`ask` + reply) |
| `POST /projects/:id/threads/:agentId/messages` `{text, reportId?}` | one turn → 202 `{message, runId}`; with `reportId` (a follow-up on a report) the turn carries the report's title, summary and a body excerpt (≤ 4k chars) and the user message keeps `reportId` (unknown report → 404); the reply arrives as a `thread.message` event (and in GET). The turn is a run in the project folder that resumes the thread's last session: an agent gets its composed prompt + tools (+ its team on this project, granted secrets, ask_user); the **orchestrator** runs big picture — its brain + altitude, no tools, no secrets, no ask tool, caps 6 turns, and a fresh summary of the whiteboard (active goals + items; `activeGoals`, `finishedGoals`), features, team, latest health and open questions in every message, labelled as the truth over earlier messages (G1). Its resumed session is rotated after 12 turns, or on the first turn after a new goal follows a finished one; the fresh session carries a recap of the last 6 lines. One turn at a time per thread (409); an agent already on a run is 409 too; not on the project → 409. Answer an ask on the asks endpoint. Text is secret-scrubbed before it's stored |
| `GET /projects/:id/reports[?archived=1]` | the Reports tray: `{reports (newest first, no body), unread}` — archived ones only with `?archived=1` |
| `GET /projects/:id/reports/:rid` · `PATCH /projects/:id/reports/:rid` `{read?, archived?}` | one report (full body) · mark read / archive (or undo) → events `report.read` / `report.archived` |
| `GET /reports[?limit=50]` | studio-wide: the latest non-archived reports across projects (+ `projectName`), newest first, + the `unread` total |
| `GET /projects/:id/github` | `{published, url, visibility, lastPush: {ok, at, note?, commit?} \| null, note?}` — `note` = "GitHub not connected — Publish" or "Couldn’t push to GitHub: …" (also in `GET …/health` as `github`) |
| `POST /projects/:id/github/publish` `{name?, visibility: private\|public (default private)}` | the user's button: `gh repo create <name (default: folder)> --private\|--public`, `origin` = `https://github.com/<owner>/<name>.git`, push the current branch → 201 view + `pushed`. 409: gh missing, gh not logged in, already a remote, not a repo / no commit, GitHub refused. Event `github.changed {published, url, visibility}` |
| `PATCH /projects/:id/github` `{visibility}` | `gh repo edit <repo> --visibility … --accept-visibility-change-consequences` → the view (409 when not published) |
| `GET PATCH /settings` | studio-wide: `{githubByDefault}` (on): new projects get a GitHub repo at setup |
| `GET /ports` | the Ports room (G1): `{range: {from: 3100, to: 3999}, projects: [{projectId, name, block: {app, spares: [4]}, app: {status, port, url}, ports: [{port, role: app\|spare, listening, heldBy: {runId, agentId} \| null}]}]}` — each project owns a stable block of 5 (persisted, never overlapping; `app` = F3's port); every agent run gets a free spare as `PORT` (+ `AI_STUDIO_PORTS` = the spares, `AI_STUDIO_APP_PORT`) and a line in its brief; `listening` = a 200 ms local connect check |
| `POST /trash/:token/restore` | undo a delete |
| `GET /blueprint` | global modules (name, description, body = the markdown text, updatedAt = file mtime) + the scaffold tree the Setter creates |
| `POST /drafts/:id/setup` | the Project Setter, on the draft (user's order: Setter first, then the orchestrator picks the team): scaffold the folder (new or adopt) + local commit, steps live on the draft stream; the draft then owns the folder (hidden from `/sandbox/folders`, no second draft may claim it). Idempotent/resumable: again = only what's missing (`commit: null`). A failed *first* setup of a new project removes the folder it just made; nothing else is ever removed → `{draft, steps, commit}` |
| `POST /drafts/:id/finish` | draft → project from the set-up folder + the accepted plan, one transaction (on set: `status: live`, tile from the name), the draft's events re-filed under the project, draft deleted; no scaffolding (a draft that skipped `/setup` is set up first — back-compat). 409 while briefs are pending or when the set-up folder is gone → `{project, steps, commit}` (`steps: []` when it was already set up) |
| `GET /projects/:id/scaffold` | what's on disk vs the expected scaffold, plus git head/commit count and `claudeMdGenerated` (from `.project`) |
| `GET /sandbox/folders` | top-level sandbox folders not yet under AI Studio (Adopt picker) |
| `GET /projects/:id/events` | SSE: the project's event log — replay after `Last-Event-ID` / `?after=` (default: all), then live; heartbeats |
| `GET /drafts/:id/events` | SSE: the draft's log — the Project Setter's `setup.step`s / `setup.failed` while `/setup` (or a back-compat `/finish`) runs (open it first), the setup chat, the Creator |
| `POST /projects/:id/runs` | start an agent run `{agentId, teamId?, task, caps?: {maxTurns, maxBudgetUsd}, resumeRunId?}` — headless Claude Code in the project folder; one live run per agent per project |
| `GET /projects/:id/runs[/:runId]` · `POST /projects/:id/runs/:runId/cancel` | run history (status, usage, `costUsd` = the CLI's API-equivalent estimate, session) · stop a run (kills its process group) |
| `GET /projects/:id/asks[?status=open]` · `POST /projects/:id/asks/:askId/answer` | questions agents asked via `ask_user` · answer one (the run continues) |
| `GET /asks[?status=open\|answered\|cancelled\|all][&unseen=true]` | the pager: asks across every project (default `open`), oldest first → `[{id, projectId, projectName, agentId, agentName, runId, question, options, status, since, seen}]`; `unseen=true` drops asks you already went to see |
| `POST /asks/seen` `{projectId}` | you opened that office and left: every ask open there now is seen (`{seen: n}`); a NEW ask brings the office back. Project asks carry `seenAt` |
| `POST /projects/:id/events` | **dev only** (absent when `NODE_ENV=production`): publish `{type, payload}` by hand |
| `GET POST /accesses` · `GET PATCH DELETE /accesses/:id` | the cabinet (G1): an **access** = `{id, name, serves, docsUrl, instructions, fields[], projectIds, createdAt, updatedAt}`; a field = `{id, label, envVar (unique across the cabinet), secret, hasValue, last4, value? (non-secret fields only)}`. `POST {name, serves?, docsUrl?, instructions?, fields: [{label, envVar? (default NAME_LABEL), secret? (default true), value?}] (1–20)}`; `DELETE` → `{deleted: {kind: 'access', id}, restorable: false, projectIds}` (values removed) |
| `POST /accesses/:id/fields` · `PATCH DELETE /accesses/:id/fields/:fieldId` · `PUT …/fields/:fieldId/value` | add `{label, envVar?, secret?, value?}` (201) · rename / move / flip `{label?, envVar?, secret?}` (a moved env var takes its value along) · remove (409 on the last field) · set a value `{value}` (write-only) → the access |
| `POST /accesses/import` | register keys already in the global `.env` as one-field accesses (also on startup), refresh last-4 after hand edits → `{imported, refreshed}` |
| `GET POST /credentials` · `GET PATCH DELETE /credentials/:id` · `PUT /credentials/:id/value` · `POST /credentials/import` | **B3 compat** (the app still calls them until G3): a credential = an access read through its first field |
| `GET PUT /projects/:id/access` | `{projectId, granted, total, seenAt, newCount, accesses: [access + {granted, isNew}], entries (B3 rows)}`; `PUT {grants: {accessId: bool}}` toggles (partial) |
| `PUT DELETE /projects/:id/access/:accessId` | grant / revoke one access (all its fields) → the view; event `access.changed {accessId, change: granted\|revoked}` (also `updated` / `deleted` when a granted access is edited / deleted) |
| `POST /projects/:id/access/seen` | the project looked: `{projectId, seenAt}`; accesses created after it read `isNew` |
| `POST /projects/:id/access/sync` | write every field of every granted access into `<folder>/.env` (managed block, 0600), ensure `.gitignore` has `.env`; returns `{file, written, removed, missing, gitignore}` — names only |

**Delete & restore.** `DELETE` on an agent, role, team or draft hard-deletes it and returns
`{ deleted: {kind, id}, restoreToken }`. The token restores it once, within 7 days, as far
as the rules still allow (a seat on a team that filled up since is skipped). Deleting an
agent removes it from every team (captaincy passes to the next member) and project; deleting
an orchestrator hands its projects and drafts to the first other orchestrator, and restoring
hands them back.

**Secrets.** Values live only in `$AI_CONTROL_HOME/.env` (and, once synced, in a granted
project's `.env`). The db holds metadata + last-4 (none for values under 12 chars). No
response, header or log line ever contains a value — `test/secrets/leak.test.ts` checks every
endpoint and error path, and the sqlite bytes. Access `DELETE` removes its values too and
is **not restorable** (`restorable: false`; an undo snapshot would have to keep the value);
it lists `projectIds` whose `.env` still holds the key until their next sync. Projects reach
nothing until granted. Agent runs get every field of the granted accesses in their env, and their prompt
lists each access by name, field label and env var ("Access you have") — never a value. Non-secret fields
(`secret: false`) are the one exception: their value is shown in responses on purpose.

**Plan** (`src/domain/plan.ts`): `{teams: [{teamId, why}], specialists: [{agentId, why}], newAgents: [{brief}],
newTeams: [{brief}], summary}`. Teams first is the orchestrator's *guidance* (prompt), not a cap — it decides how many teams and
specialists (user decision). Hard rules are data integrity: ids exist, no duplicates, no captain field (strict objects reject one), no
studio crew as a specialist, no specialist who already comes with a planned team, at least someone staffed; ≤ 20 per list (payload bound). 422 shape/unknown id, 409 rule.

**Crew contracts.** Orchestrator and Agent Creator runs have no tools (`--tools ""`), no MCP server, no secrets, and
run in `$AI_STUDIO_HOME/scratch` (caps 6 turns / $2 API-equivalent — a size cap; runs use the Claude Code subscription, nothing is charged). The task's first line names the contract; the answer must be
ONE JSON object (fenced or wrapped is tolerated), validated by zod + the studio rules. A miss is sent back once (same
session, issues listed); a second miss is 502.
- `setup-chat` → `{reply, plan}`
- `mint-agent` → `{name, nick?, role, prompt, look: {hat, tool, body, antenna, face, hue}}` — look values from the studio
  slots (no crew-only gear), role reused by name or created, name unique in the Cast
- `mint-team` → `{name, blurb, instr, code, emblem, color, members: [{agentId, job} | {newAgent, job}], captain}` —
  emblem/colour from the studio ids, 2–7 members, ≤ 4 new, captain = a member's agentId or a new agent's name
- `dispatch` → `{summary, items: [{text, assignee, teamId?, brief, parallel?, report?}]}` — assignee is a project team's captain (with that
  `teamId`) or a project specialist (no `teamId`); with `orchestratorTalksTo: everyone` any team member. Items run **in order**;
  `parallel: true` lets an item start alongside the one before it (git projects: each item has its own worktree, so the orchestrator is
  told independent items may run side by side, ≤ 2 per project); if an earlier item fails, later ones are skipped

- `dispatch` (F1c) also gets `The project right now: {hasCode, run}` and `Features: [{id, name, status, about}]`, and may answer
  `feature: {id} | {name, description}` (+ `ships?: false`) — see Teams & features below. An empty project (only the scaffold) is told
  its first item sets up the stack, records `run:` in `.project`, and fills CLAUDE.md's "Project-specific rules".
- `team-split` (F1c) → `{mode: team|self, summary, subtasks: [{text, assignee, brief, parallel?}] (≤ 4)}` — the captain, in the item's
  checkout with the health check's read-only tools, caps 8 turns; `team`: 1–4 sub-tasks, each for one member of THIS team (one each),
  not all the captain's. A second miss (or a failed run) is not an error: the captain does the item itself.

- `collaboration` → `{reply, collaboration}` (see Collaboration below; validated against the project's staffing)

- `health` → `{modularity, cleanliness, reusability: {grade: A–F, good, fix}, summary}` — the one crew run that works IN a
  project folder: tools Read/Glob/Grep/Bash, Bash pre-approved only for `ls`, `pwd`, `git status|log|diff|show|ls-files|shortlog`
  (no Write/Edit tool at all), no secrets, caps 15 turns. Commissioned by the project's orchestrator.

**Collaboration** (B8, `src/domain/collaboration.ts`, the user's idea in `updates/2026-11-13 BACKEND - OPEN/idea-collaboration-design.md`):
`{orchestratorTalksTo: captains|everyone (default captains), gates: [{after: teamId|agentId|"*", reviewer: agentId, kind:
quality|user-test|crash-test|security|review, why}] (≤ 8), maxSendBacks: 0–3 (default 2), summary}`. Designed by the orchestrator in the
setup plan (`plan.collaboration`, optional; `new-agent:N` / `new-team:N` point at briefs and resolve on accept; copied to the project on
finish), by `POST …/collaboration/design`, or set by hand. Rules: `after` is `*` or a team/agent on the project, the reviewer is a team
member or specialist on it, never the same person, no duplicates. **Dispatch enforces it:** `everyone` lets the orchestrator brief any team
member (with their `teamId`), `captains` keeps captains + specialists only; every build item snapshots its gates (`gates`, in order, the
builder never reviews itself, reviewers no longer on the project are dropped; report items have none). Flow: build run → `handoff` (kind
`review`) → a review run by the reviewer (its team context; task = the brief, the builder's summary, the gate's focus, earlier notes; ends
with `{"verdict": "approve"|"changes", "notes"}` — anything unclear counts as changes) → `review.approved` → next gate or **done**; or
`review.changes` + `handoff` (kind `rework`, with the notes) → the builder reworks in its own resumed session → the same gate again.
Past `maxSendBacks` the item **fails** for the user (`review.changes` with `final: true`; later items are skipped as usual). Item fields:
`stage` (build|review|merge), `gates`, `gateIndex`, `sendBacks`, `notes` (last reviewer notes), `reviews` ([{reviewer, gate, verdict,
notes, runId, at}]), `buildRunId`. `checklist.item` carries `stage` + `holder` (who has it now) when the item has gates.

**Lifecycle** (F1b, `src/office/lifecycle.ts`): a project's `status` moves on its own from the event log — `needs` while an agent waits
on the user (an open ask), `live` while a run or checklist work is in flight, else `idle` (`draft` / `archived` are the user's and never
touched; a fresh project stays `live` "on set" until its first work; after a restart only projects that were ever worked on are re-read).
Overall `progress` = features shipped / total when the features folder has any, else the current goal's % (the newest running goal, else the
newest); `target` labels it. Events `project.status {status}` and `project.progress {pct, shipped, total, target?, goalId?, goalPct?}`
(only on change); `projects.progress` follows (dispatch no longer writes the goal % there).

**Worktrees** (F1b, `src/git/worktrees.ts`): in a git project (a commit, on a branch) every checklist item works in its **own
checkout** `$AI_STUDIO_HOME/worktrees/<projectId>/<item-slug>-<id8>` on its own branch `studio/<item-slug>-<id8>` from the main
branch's tip — chosen over `<project>/.ai-studio/worktrees` so the project folder stays exactly as the user knows it (no extra
checkouts in searches, health checks or editors, no ignore rule in their repo); git keeps the worktree metadata in the project's
`.git/worktrees/`. Build, review and fix runs of the item all run there (`StartRun.workdir`, must be under the worktrees root). When the
item is **accepted** (built + every gate approved) whatever is left is committed on its branch (never `.env*`, `node_modules`, `.venv`,
`__pycache__`, `.DS_Store`), then merged into main in the project folder — fast-forward if possible, else a merge commit, one merge at a
time per project → event `item.merged {itemId, goalId, branch, commit?}`, checkout removed, branch deleted (`git branch -d`: only when
merged). A **conflict** is aborted (main untouched) and goes back to the builder (`handoff` kind `merge-fix`, stage `merge`): "run `git
merge main` in your checkout, resolve, commit" → merge again; after 2 tries, or any other merge failure (project folder on another
branch…), the item **fails** with the work kept on its branch (named in the note). Failed / cancelled / interrupted items: their work is
committed on the branch and the checkout removed (`… — work kept on branch studio/…` when there was work). Not a git repo yet → items
work in the project folder as before (in order unless `parallel`). Item fields: `workspace {cwd, branch, base, main} | null`, `mergeTries`.

**Teams & features** (F1c, `src/crew/team.ts`; the user's rule: teams are the primary unit, captains lead them). An item for a team's
captain, in a git project, on a team with ≥ 2 members, is a small **team task**: (1) the captain splits it (`team-split`, prompt: split
when it saves time or matches a member's job; small items it does itself) → event `team.split {itemId, goalId, captainId, teamId, mode,
summary, subtasks: [{itemId, agentId, text}], round}` and per sub-task `handoff` kind `delegate` (captain → member). (2) Each sub-task is
a checklist item with `parentId` (never on the whiteboard's top level — it hangs under `subtasks`), worked by the member with its team
context ("Your job on this team") in its **own checkout branched off the team item's branch**; sub-tasks share the project's parallel cap
(the waiting team item holds no seat), run side by side unless `parallel: false`. Accepted → merged into the team item's checkout (one at a
time) → `handoff` kind `deliver` (member → captain); a conflict → `merge-fix` back to that member (same bounds as main). (3) When every
part has ended the team item goes to `teamPhase: 'integrate'`: the captain's run in its checkout sees each part (summary, or "did NOT
finish" — it finishes those itself), checks it fits together and runs, commits; it may send parts back **once**
(`{"rework": [{assignee, notes}]}` at the end of its reply → new sub-tasks "Rework: …" with `notes`, `team.split` round 1, `handoff` kind
`rework` captain → member). (4) Then it's the captain's build: the project's gates (reviewer rework resumes the integration session), then
merged into main (`item.merged`). Cancelling the goal stops the members' parts first, then the team item. Item fields: `parentId`,
`teamPhase: null|members|integrate`, `teamRounds`, `teamPlan` (the captain's split in a sentence, also for `self`), `subtasks`
(sub-task items). `checklist.item` + `parentId?`, `teamPhase?`; `handoff` + `parentId?`, kinds `delegate`, `deliver`. Migration 20.
**Features:** a goal links to a feature (`featureId`, `ships`): an existing one (Planned → Now) or a new one in Now with its
description; while the goal runs the feature's `pct` follows the goal; when every item has landed (goal done) and no other running goal
works on it, the feature moves to **Shipped** (pct 100) → `feature.changed` + `feature.shipped {featureId, goalId, name}`; overall
progress follows (shipped / total). Failed/cancelled goals leave the feature where it is; `ships: false` never ships it.
**Real-app prompts:** every build brief says "do not push" (the studio merges) and to record `run: <command>` in `.project` when the
work sets up how the app starts.

**Toolkits** (F1b): an agent whose role is a `toolsmith` (quality / test; seed QA + Quality, migration 16) gets a persistent toolkit
folder `$AI_STUDIO_HOME/toolkits/<agentId>/` (0700, created on its first run; inside the data dir, never anywhere else) — the ONLY extra
directory its runs may reach (`--add-dir`; `--restricted` confines the file tools to cwd + that dir). Its prompt gains a "Your toolkit"
section: reuse/build small checks there (one-line notes in its `README.md`), project-specific checks in `tools/<agent-slug>/` in the
project (committed), and read the big picture first (CLAUDE.md, the open update plan, issues.txt) to keep the work on track and simple.
The Cast catalogue marks toolsmiths, so the orchestrator picks them as reviewers. **Reporter** runs also get `WebSearch`/`WebFetch`
(read-only web research).

**Reports** (`src/reports/reports.ts`, spec: `updates/2026-11-13 APP UI - OPEN/spec-reports.md`). A report =
`{id: 'rep_…', projectId, kind: research|review|status|other, title (4–80), summary (≤ 280), body (markdown ≤ 40k), question?,
sources: [{title, url? (http/s), path? (project-relative)}] ≤ 20, author: {agentId, name, teamId, teamName} (snapshot), runId, goalId,
itemId, threadId, createdAt, readAt, archivedAt}`. Only **reporters** file: a run whose agent's role has `reporter`, or that runs for a
`reporter` team (seed: role Research, team The Expedition); orchestrators/crew never. Such runs get the `file_report` MCP tool on the same
per-run server as `ask_user` (`AI_STUDIO_REPORT_URL` + `mcp__studio__file_report` allowed) — others never see it. The server stamps
project, author, run, the checklist item / chat thread it answers, time; every text field is secret-masked; ≤ 2 per run (then 409 "One report
per question"); bad input → 422 back to the agent. Event `report.filed {reportId, projectId, authorAgentId, title}` (never the body). A chat turn
that filed a report replies in one line (`"<Nick> filed it — <title>."`, `reportId` on the message). Dispatch items carry `report: true` for
knowledge-not-change goals (research, compare, review, write-up…): only a reporter may take one, its brief says to answer with
`file_report`, and it's **done only when its run filed a report** (else failed: "Finished without filing the report"); goal items expose
`reportId`. Big-picture prompts (setup chat, dispatch, orchestrator chat) route research to reporters; the Cast catalogue marks them.

**GitHub** (G1, `src/github/github.ts`): the Project Setter's last step (`setup.step` `github`) creates a **private repo named after
the folder** and pushes (`done`), keeps an existing origin (`kept`), or is `skipped` when the draft says `github: false` (`PATCH
/drafts/:id` or `POST /drafts/:id/setup {github: false}`), the studio setting is off, gh is missing / logged out, or GitHub refuses —
the setup always finishes. After every `item.merged` on a published project the studio pushes (one at a time) → `github.push {ok,
commit?, note?}`; a failure is a note on health, never the item's. Agents never push: runs with a shell get `--disallowed-tools
Bash(git push),Bash(git push *)`. The project payload's `github` = `{connected, private, published, url, visibility}`.

**Git / GitHub status** (`src/health/git-status.ts`): branch, clean + change count, last commit, commit count, first remote (URL
with credentials stripped). GitHub visibility (`gh repo view <owner/repo> --json visibility`, read-only, 10 s) is asked only during
a health check, only for a GitHub remote, only when `gh` is installed — never on GET.

Events added: `feature.changed`, `thread.message`, `report.filed` / `report.read` / `report.archived` (U1), `health.checked`, `chat.message`, `plan.changed`, `cast.created` (draft stream, copied to the project on finish),
`goal.changed`, `checklist.item` (+ `goalId`, `status`, `runId`, `stage`, `holder`), `progress` (the goal's %, project stream).
F1b: `collaboration.changed {orchestratorTalksTo, gates, summary}`, `handoff {itemId, goalId, from, to, kind: review|rework|merge-fix, gate?, note?}`,
`review.approved {itemId, goalId, reviewerId, gate, notes?}`, `review.changes {itemId, goalId, reviewerId, gate, notes, sendBacks, final?}`,
`item.merged {itemId, goalId, branch, commit?}`, `thread.message` + `goalId?`, `project.status {status}`, `project.progress {pct, shipped, total, target?, goalId?, goalPct?}`.
F1c: `team.split`, `handoff` kinds `delegate`/`deliver` + `parentId?`, `checklist.item` + `parentId?`/`teamPhase?`, `feature.shipped {featureId, goalId, name}`, `app.status {status, url?, exitCode?}`.
