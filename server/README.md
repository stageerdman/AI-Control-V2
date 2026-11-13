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
| `AI_STUDIO_RUNNER` | (CLI) | `fake` = the free scripted runner + fake crew brain (UI work, demos): the whole setup → work flow runs without Claude |

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
  health/            health.ts (read-only health check), git-status.ts (local git + optional gh visibility)
  office/            what the office screen needs: features.ts (features folder), threads.ts (project conversations)
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
| `GET POST /roles` · `GET PATCH DELETE /roles/:id` | user-defined role names; rename shows on every agent |
| `GET POST /agents` · `GET PATCH DELETE /agents/:id` | `kind` set at creation only; each agent carries `teamIds`, `projectIds`, `canDelete {ok, why}` |
| `GET POST /teams` · `GET PATCH DELETE /teams/:id` | `PATCH {captainId}` to change captain |
| `POST /teams/:id/members` · `PATCH DELETE /teams/:id/members/:agentId` | add / edit job / remove (captain passes on) |
| `GET POST /projects` · `GET PATCH /projects/:id` | `orchestratorId`, `teamIds` (teams first), `agentIds` (specialists), `folder` (sandbox-relative) |
| `DELETE /projects/:id` | 204; forgets the record, never touches the folder |
| `GET POST /drafts` · `GET PATCH DELETE /drafts/:id` | setup drafts: mode, step, orchestrator, `plan` (validated — see Plan below), `chat` |
| `POST /drafts/:id/chat` `{text?}` · `GET /drafts/:id/chat` | one orchestrator turn → `{reply, plan, chat}` (no `text` = the orchestrator opens with a proposal); history `{chat, plan}` |
| `POST /drafts/:id/accept` | the Agent Creator mints every `newAgents`/`newTeams` brief, the plan resolves to real ids — all or nothing → `{plan, minted: {roles, agents, teams}}`; `/finish` refuses until then |
| `POST /projects/:id/work` `{goal, caps?: {maxTurns, maxBudgetUsd}}` | the orchestrator breaks the goal into ≤ 8 checklist items for team captains / specialists → the goal (201); items run as agent runs (with `caps`), ≤ 2 at a time per project, one per agent |
| `POST /projects/:id/health` `{caps?}` | health check: a read-only run in the project folder grades modularity / cleanliness / reusability (A–F, `good`, `fix`) + git/GitHub status → the report (201), event `health.checked` |
| `GET /projects/:id/health` | `{latest, history (≤ 20, newest first), git}` — `git` is live and local only (no network) |
| `GET /projects/:id/work[/:goalId]` · `POST /projects/:id/work/:goalId/cancel` | the whiteboard (goals newest first, items with status/run/note, `pct`) · stop a goal |
| `GET POST /projects/:id/features` · `GET PATCH DELETE /projects/:id/features/:featureId` | the features folder: `{name, status: now\|planned\|shipped (default planned), order (1-based in its status; default last), pct?, owner? (agent or team id), description, vision}` (plain text blocks); list = Now, Planned, Shipped, each in order; moves keep every group dense; event `feature.changed` (`deleted: true` on delete) |
| `GET /projects/:id/threads/:agentId/messages` | the user's thread with the orchestrator or anyone on the project → `{projectId, agentId, busy, messages: [{id, from: 'user'\|agentId, kind: text\|error, text, runId, at}]}` (last 200, oldest first) |
| `POST /projects/:id/threads/:agentId/messages` `{text}` | one turn → 202 `{message, runId}`; the reply arrives as a `thread.message` event (and in GET). The turn is a run in the project folder that resumes the thread's last session: an agent gets its composed prompt + tools (+ its team on this project, granted secrets, ask_user); the **orchestrator** runs big picture — its brain + altitude, no tools, no secrets, no ask tool, caps 3 turns, and a fresh summary of the whiteboard, features, latest health and open questions in every message. One turn at a time per thread (409); an agent already on a run is 409 too; not on the project → 409. Answer an ask on the asks endpoint. Text is secret-scrubbed before it's stored |
| `POST /trash/:token/restore` | undo a delete |
| `GET /blueprint` | global modules (name, description) + the scaffold tree the Setter creates |
| `POST /drafts/:id/finish` | Project Setter: draft → project + scaffold (new or adopt) + local commit; returns `{project, steps, commit}` |
| `GET /projects/:id/scaffold` | what's on disk vs the expected scaffold, plus git head/commit count |
| `GET /sandbox/folders` | top-level sandbox folders not yet under AI Studio (Adopt picker) |
| `GET /projects/:id/events` | SSE: the project's event log — replay after `Last-Event-ID` / `?after=` (default: all), then live; heartbeats |
| `GET /drafts/:id/events` | SSE: the Project Setter's `setup.step`s while `POST /drafts/:id/finish` runs (open it first) |
| `POST /projects/:id/runs` | start an agent run `{agentId, teamId?, task, caps?: {maxTurns, maxBudgetUsd}, resumeRunId?}` — headless Claude Code in the project folder; one live run per agent per project |
| `GET /projects/:id/runs[/:runId]` · `POST /projects/:id/runs/:runId/cancel` | run history (status, usage, `costUsd` = the CLI's API-equivalent estimate, session) · stop a run (kills its process group) |
| `GET /projects/:id/asks[?status=open]` · `POST /projects/:id/asks/:askId/answer` | questions agents asked via `ask_user` · answer one (the run continues) |
| `POST /projects/:id/events` | **dev only** (absent when `NODE_ENV=production`): publish `{type, payload}` by hand |
| `GET POST /credentials` · `GET PATCH DELETE /credentials/:id` | Key Cabinet: `name`, `envVar` (fixed; derived from name if omitted), `serves`, `docsUrl`, `instructions`; `value` on POST only; responses carry `hasValue`, `last4`, `projectIds` |
| `PUT /credentials/:id/value` | replace key `{value}` (write-only) |
| `POST /credentials/import` | register keys already in the global `.env` (also runs on startup), refresh last-4 after hand edits |
| `GET PUT /projects/:id/access` | every cabinet entry with `granted`; `PUT {grants: {credentialId: bool}}` toggles (partial) |
| `POST /projects/:id/access/sync` | write the granted secrets into `<folder>/.env` (managed block, 0600), ensure `.gitignore` has `.env`; returns `{file, written, removed, missing, gitignore}` — names only |

**Delete & restore.** `DELETE` on an agent, role, team or draft hard-deletes it and returns
`{ deleted: {kind, id}, restoreToken }`. The token restores it once, within 7 days, as far
as the rules still allow (a seat on a team that filled up since is skipped). Deleting an
agent removes it from every team (captaincy passes to the next member) and project; deleting
an orchestrator hands its projects and drafts to the first other orchestrator, and restoring
hands them back.

**Secrets.** Values live only in `$AI_CONTROL_HOME/.env` (and, once synced, in a granted
project's `.env`). The db holds metadata + last-4 (none for values under 12 chars). No
response, header or log line ever contains a value — `test/secrets/leak.test.ts` checks every
endpoint and error path, and the sqlite bytes. Credential `DELETE` removes the value too and
is **not restorable** (`restorable: false`; an undo snapshot would have to keep the value);
it lists `projectIds` whose `.env` still holds the key until their next sync. Projects reach
nothing until granted.

**Plan** (`src/domain/plan.ts`): `{teams: [{teamId, why}], specialists: [{agentId, why}], newAgents: [{brief}],
newTeams: [{brief}], summary}`. Teams first is the orchestrator's *guidance* (prompt), not a cap — it decides how many teams and
specialists (user decision). Hard rules are data integrity: ids exist, no duplicates, no captain field (strict objects reject one), no
studio crew as a specialist, no specialist who already comes with a planned team, at least someone staffed; ≤ 20 per list (payload bound). 422 shape/unknown id, 409 rule.

**Crew contracts.** Orchestrator and Agent Creator runs have no tools (`--tools ""`), no MCP server, no secrets, and
run in `$AI_STUDIO_HOME/scratch` (caps 3 turns / $0.50 API-equivalent — a size cap; runs use the Claude Code subscription, nothing is charged). The task's first line names the contract; the answer must be
ONE JSON object (fenced or wrapped is tolerated), validated by zod + the studio rules. A miss is sent back once (same
session, issues listed); a second miss is 502.
- `setup-chat` → `{reply, plan}`
- `mint-agent` → `{name, nick?, role, prompt, look: {hat, tool, body, antenna, face, hue}}` — look values from the studio
  slots (no crew-only gear), role reused by name or created, name unique in the Cast
- `mint-team` → `{name, blurb, instr, code, emblem, color, members: [{agentId, job} | {newAgent, job}], captain}` —
  emblem/colour from the studio ids, 2–7 members, ≤ 4 new, captain = a member's agentId or a new agent's name
- `dispatch` → `{summary, items: [{text, assignee, teamId?, brief, parallel?}]}` — assignee is a project team's captain (with that
  `teamId`) or a project specialist (no `teamId`). Items run **in order** (one shared working tree); `parallel: true` lets an
  item start alongside the one before it; if an earlier item fails, later ones are skipped

- `health` → `{modularity, cleanliness, reusability: {grade: A–F, good, fix}, summary}` — the one crew run that works IN a
  project folder: tools Read/Glob/Grep/Bash, Bash pre-approved only for `ls`, `pwd`, `git status|log|diff|show|ls-files|shortlog`
  (no Write/Edit tool at all), no secrets, caps 15 turns. Commissioned by the project's orchestrator.

**Git / GitHub status** (`src/health/git-status.ts`): branch, clean + change count, last commit, commit count, first remote (URL
with credentials stripped). GitHub visibility (`gh repo view <owner/repo> --json visibility`, read-only, 10 s) is asked only during
a health check, only for a GitHub remote, only when `gh` is installed — never on GET.

Events added: `health.checked`, `chat.message`, `plan.changed`, `cast.created` (draft stream, copied to the project on finish),
`goal.changed`, `checklist.item` (+ `goalId`, `status`, `runId`), `progress` (project stream; also sets `project.progress`).
