# Project isolation — update v1

Feature: **[PRIORITY] Agents Keep Memory from other Projects** (`f-priority-agents-keep-memory-from-other-p`).

## Goal

The same Cast agent working on two projects acts as two separate people. Nothing it did, said, wrote or is
running in project A is visible to it, or about it, in project B. That covers what the user sees (the recap, the
chat list) and what the agent can reach (tools, files, the CLI's own memory).

Rule: **any memory or state about an agent's work is keyed by (project, agent), never by agent alone.** The
Cast keeps only what an agent *is* (name, look, prompt, role, tools). It keeps nothing about what the agent *did*.

## What happened

The user tapped Columbo in project B. He said he was reviewing a feature request that belongs to project A.

The agent itself had no memory of project A. The **app** asked the server "what did this agent do last?" with
no project in the question. The server answered with his newest chat in any project and had the model recap it
in the first person. See root cause 1.

## Root causes (with the failing repro)

Repro: `server/test/isolation/cross-project.test.ts`. Each case is `it.fails`: it passes while the bug exists,
so the suite stays green. The phase that fixes a case flips it to a plain `it`.

| # | Where | What leaks | Repro |
|---|---|---|---|
| 1 | `server/src/routes/recap.ts:16` → `server/src/db/chats.ts:119` (`latestAgentChat` = agent only). Called by `app/src/features/office/OfficePage.tsx:704` (`clickActor`) → `RecapSheet.tsx:33` → `api.ts:243` (`/agents/:id/recap`); cache key `api.ts:366` (`recap:${agentId}`) | **The reported bug.** Tapping an agent in B recaps its latest chat from A, in its own words, and spends a model call on it. | ✔ "tapping the agent in Atlas recaps nothing from Aurora" |
| 2 | `server/src/routes/chats.ts:59-69` → `db/chats.ts:104` (`listAgentChats` = agent only). Used by `ChatHistorySheet.tsx:138` (key `chats:${agentId}`, `api.ts:367`), Panel History, Recap "Open chat" | B's office lists A's chats. Writing into one continues A's chat (`runtime/chat-reply.ts`), and "Start it" (`office/chat-work.ts`) puts a goal on **A's** board from B. | ✔ "the Atlas office's chat history lists no Aurora chat" |
| 3 | `server/src/running/tools.ts:14` (`mine = { agentId }`) + `registry.ts:89` | `my_runs` in B lists the agent's live sessions in A, task line included. An agent asked "what are you doing?" reads them back as its own. `cancel_run` can **stop** A's session from B. | ✔ "my_runs in Atlas shows nothing running in Aurora…" |
| 4 | `server/src/runtime/env.ts:31` (no `CLAUDE_CODE_DISABLE_AUTO_MEMORY`) + `crew/structured.ts:126` (crew calls without a workspace share one `~/.ai-studio/scratch` cwd) | Claude Code's **auto memory** (`~/.claude/projects/<folder>/memory/MEMORY.md`, loaded into every session) is on. It is keyed by folder, not by (project, agent). Every crew call (recap, chat reply, approvals, room calls with no folder) shares the scratch folder. Inside a project, all agents share one memory the studio neither scopes nor shows, and it costs context on every session. | ✔ "every run starts with Claude Code's auto memory off" |

### Checked and already scoped by (project, agent) (no change needed)

- Session resume: `runtime/service.ts:467-470` refuses a `resumeRunId` from another project or agent. Chat-turn
  resume `office/threads.ts:260` and work resume `crew/dispatch.ts:575-581` only see their own project's ids.
  Sessions are per cwd, and cwd is the project folder or the item's checkout.
- The office thread (chat with an agent in a project): `office/threads.ts` (all queries `project_id = ? AND agent_id = ?`).
- Desk notes `office/desk.ts:100`, to-dos `todos/todos.ts:127`, `my_history` `chats/tools.ts:36-45` (filtered
  to the project), call memory `room/notes-of.ts` (per project), notes to a running agent `runtime/service.ts:885`.
- Live status events (`agent.status`) go out on the project's own event stream (`OfficePage.tsx:642`).
- The system prompt (`runtime/compose.ts`) names only the current project. Team principles are read from
  the project's own folder (`office/principles.ts:31`).

### Smaller cross-project couplings found (not memory, fixed alongside)

- 5. `chats/tools.ts:36`: `my_history` takes the agent's last 50 chats **across projects** and *then* filters.
  An agent busy elsewhere sees "No earlier chats here" (lost memory, the mirror image of the bug).
- 6. `room/room.ts:363` `inTurn(callee.id, …)`: the call queue is per agent. A call in B waits behind the same
  agent's call in A.
- 7. `runtime/compose.ts:139` + `service.ts:958`: a toolsmith's toolkit is **one folder per agent across every
  project** (`--add-dir`). This is a deliberate channel ("yours across every project"). Today it is code only,
  but nothing stops a project's notes landing in its `README.md`.
- 8. `comms_log` `everywhere: true` (`room/room.ts:499-508`) lets any agent read every project's talk. That is
  deliberate (for analysts), but it reaches past the project for everyone.

### Context cost

Nothing runaway. The recap and chat reply are single tool-less calls (≤ 8 000 chars of transcript). The real
cost is waste: a model call to recap *another* project's chat on every tap (cause 1), and auto memory loaded
into every session (cause 4). Coding runs are not affected by causes 1–2 (those are office views). Cause 3 can
mislead a working agent, or let it cancel a session elsewhere.

## Roadmap

Each phase ends with tests. The repro case it fixes flips from `it.fails` to `it`.

### Phase 1: the recap and chat list ask "in this project" (fixes 1, 2: the reported bug)

- Server: `GET /projects/:pid/agents/:id/recap` and `GET /projects/:pid/agents/:id/chats` (`db/chats.ts`
  `listAgentChats(db, agentId, { projectId })`, required). Delete the agent-only routes. Nobody else
  calls them; check `app/` and `routes/` first.
- `POST /chats/:runId/messages` and `/start` take the project in the path too, and 404 on a chat from another
  project.
- App: `api.ts` recap/listAgentChats take `pid`. Cache keys become `recap:${pid}:${agentId}`,
  `chats:${pid}:${agentId}`. `RecapSheet`, `ChatHistorySheet`, `Panel` pass `pid`.
- Tests: repro cases 1–2 flip to `it` on the new routes. Update `test/routes/recap.test.ts` and
  `chat-reply.test.ts`. Add an app test: RecapSheet in project B asks with B's pid. Live check: tap an agent in a
  second project after work in the first. It says "Nothing to tell yet".

### Phase 2: agent tools see only this project (fixes 3, 5, 6)

- `running/tools.ts`: `Caller` gains `projectId`, `mine = { projectId, agentId }` (list and cancel). Wire it
  where `runningTools` is built. Description: "your sessions in this project".
- `chats/tools.ts`: filter by project in SQL (`listAgentChats(..., { projectId })` from phase 1), not after a limit.
- `room/room.ts`: call queue keyed `${projectId}:${agentId}`.
- Tests: repro case 3 flips. A `my_history` test with 60 chats elsewhere still shows this project's. A room test
  where calls to the same agent in two projects don't wait on each other.

### Phase 3: no hidden memory outside the studio (fixes 4, 7)

- `runtime/env.ts`: `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` for every run and crew call. The studio's own memory
  (desk, to-dos, history) is the only memory, scoped and visible. Check live that a session with it set writes no
  `memory/` folder.
- Crew calls without a workspace get a cwd per scope (`scratch/<projectId>/` or `scratch/draft-<id>/`), not one
  shared folder.
- Toolkit: keep it shared (tools are skills, not memory). The brief says it holds checks only, never project
  facts. Decision for the captain: confirm, or scope it per project.
- Tests: repro case 4 flips. `structured.test` asserts the per-scope cwd. `compose` test asserts the toolkit line.

### Phase 4: lock the rule in (guard against the next one)

- Guard test (`test/isolation/keys.test.ts`): every SQL in `src/db` and `src/office` that filters `agent_id = ?`
  also filters `project_id`, except an allow-list (Cast, performance, trash, `countByAgent`, studio-wide
  credits), each with a one-line reason.
- `principles/founders/decisions.md`: one line on the (project, agent) rule. Ask the captain, who keeps it.
- `wiki.md`: the lesson.

## Status

- [x] Trace: root causes 1–8 above, with file references.
- [x] Repro: `server/test/isolation/cross-project.test.ts` (4 `it.fails`, each confirmed failing on the leak itself).
- [x] Phase 1: `GET /projects/:id/agents/:agentId/recap`, `GET /projects/:id/agents/:agentId/chats(/latest)`,
  `GET|POST /projects/:id/chats/:runId/messages`, `POST /projects/:id/chats/:runId/start` (404 for another
  project's chat, `routes/agent-in-project.ts`). Agent-only routes deleted. App passes `pid`; keys
  `recap:${pid}:${id}`, `chats:${pid}:${id}`. Old chats need no migration: every run row already has its `project_id`.
- [x] Phase 2: `runningTools(running, { projectId, agentId, runId })`; `my_history` filters by project in SQL
  (test `test/chats/tools.test.ts`); room call queue keyed `scope:owner:callee` (no dedicated test yet).
  `home/user-activity.ts` routes by the request's project.
- [~] Phase 3: auto memory off for every run (`runtime/env.ts`). Not done: per-scope scratch cwd (with auto memory
  off the shared scratch carries no memory, so it is no longer a leak) and the toolkit decision (captain).
- [ ] Phase 4: guard test and decisions line, not started.
- Repro: all four cases are plain `it`s and pass; the old "agent lists its runs across projects" test now asserts
  the opposite.
