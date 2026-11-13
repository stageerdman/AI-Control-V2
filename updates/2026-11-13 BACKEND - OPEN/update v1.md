# BACKEND — v1

Status: **OPEN** · Opened 2026-11-13

## Goal

Make AI Studio real: a local backend that owns the Cast (agents, roles, teams, system
agents), projects and their setup, secrets and access, and actually **runs AI agents inside
real project folders** — orchestrator + teams — streaming live state the UI (the Disney v6
prototype) can show. Test projects live in a dedicated sandbox folder.

User ask (2026-11-13): "it's time to make it real. Let's start creating real backend for
this. And let's connect it to some test folder where we will run some test projects. So
create a roadmap for backend step by step with proper testing and everything, and let's
build it."

## Decisions

- **Stack:** TypeScript on Node (v25 installed) in `server/` at the repo root. Fastify (HTTP,
  `inject()` makes API tests cheap), zod (validation at every boundary), vitest (tests),
  built-in `node:sqlite` (no native deps) for persistence. Tauri shell + React UI come later
  and talk to this server over HTTP + SSE, so the backend stands on its own.
- **Agent runtime:** the **Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk`, Claude Code
  as a library) — built-in file/shell tools, runs with `cwd` = the project folder. Default
  model `claude-opus-5-5`. Hidden behind a `Runner` interface with a scripted **FakeRunner**,
  so every test and UI flow runs free and deterministic; live runs are opt-in.
- **Sandbox:** test projects live in `~/dev/AI-Studio-Sandbox/` (override `AI_STUDIO_SANDBOX`).
  The backend never writes outside the sandbox (plus its own data dir) — enforced in code and tested.
- **Data dir:** `~/.ai-studio/` (SQLite db, logs; override `AI_STUDIO_HOME`). Global secrets keep
  living in `~/.ai-control/.env`; modules (the Blueprint) in `~/.ai-control/modules/`.
- **Secrets:** values never leave the backend — the API returns masked last-4 only; tested.
- **GitHub:** local `git init` + commits by default; creating a remote repo (`gh`) is an explicit,
  opt-in step (outward-facing).

## Roadmap (each phase ends with tests + a real run before commit)

### B0 — Foundation
`server/` project: TypeScript strict, Fastify app factory, config (data dir, sandbox root,
modules dir) with zod, `GET /health`, npm scripts (`dev`, `test`, `typecheck`, `lint`).
*Tests:* config resolution, health endpoint, sandbox path guard (no `..`/symlink escape).

### B1 — Cast & projects domain
SQLite schema + migrations + repositories: roles (user-defined), agents (kind, role, look,
prompt), teams (blurb, "what we do", "how we code", members ≤ 7, captain ∈ members), projects,
setup drafts. Invariants from the prototype: exactly one Project Setter and one Agent Creator,
never deletable; ≥ 1 orchestrator; system agents can't join teams; deleting an agent removes
it from teams (restorable). REST CRUD with zod. Seed = the prototype's cast.
*Tests:* every invariant, API round-trips, seed loads.

### B2 — Blueprint & Project Setter (deterministic)
Read modules from `~/.ai-control/modules`, compile `CLAUDE.md`; scaffold a new project in the
sandbox (`.project`, `CLAUDE.md`, `.gitignore` covering `.env`, `.env`, `updates/`, `issues.txt`),
`git init` + first commit; **adopt** an existing folder (detect what exists, add only what's
missing, never overwrite). Progress emitted as steps (feeds the setup screen).
*Tests:* temp-dir scaffolds, adopt idempotency, never writes outside the sandbox.

### B3 — Secrets & access
Credential metadata in db; values read/written in the global `.env` (0600); API masks to last-4;
per-project grants; project `.env` written from granted secrets only.
*Tests:* no endpoint/log ever contains a secret value; grants round-trip.

### B4 — Live events
Append-only event log per project + SSE stream (agent status, asks, progress, tokens, features,
checklist). Reconnect with `Last-Event-ID`.
*Tests:* ordering, replay from id, stream format.

### B5 — Agent runtime
`Runner` interface; FakeRunner (scripted); prompt composer (agent brain ▸ what the team does ▸
how the team codes ▸ job on this team ▸ project rules); ClaudeAgentRunner (Agent SDK, cwd =
project dir, tools scoped, token usage → events, "ask the user" tool → pending ask that pauses
the run until answered).
*Tests:* composer, Fake runs end-to-end through events; one opt-in live smoke test in a sandbox
project (costs real tokens — run only with the user's go).

### B6 — Orchestrator & Agent Creator
Setup chat with the chosen orchestrator; teams-first plans (structured output validated by zod);
Agent Creator mints agents/teams into the Cast; orchestrator dispatches work to team captains,
keeps the whiteboard (checklist, progress) and features (description, vision) in the db.
*Tests:* plan validation, minting invariants, dispatch with FakeRunner.

### B7 — Health check
Modularity / cleanliness / reusability report via an agent run + git/GitHub status.

**After B7:** new update for the real UI (port the v6 prototype to React, wire to this API).

## Status
- ⏳ B0 next.
