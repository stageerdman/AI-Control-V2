# AGENT MCP — v1

**Goal:** a studio MCP that agents use to work with each other. The Agent Creator designs and creates agents
through tools, and any agent can call a fellow agent for a hand (e.g. Tinker asks Twinkle to design a costume).
All of it is visible: during project setup, whoever is called **joins the room**. Calls to someone **not in the room**
by anyone but the orchestrator need the **orchestrator's or the team captain's** OK.

## Design
- **One thin MCP server** (`server/src/mcp/ask-server.ts`, stdio). Besides `ask_user` / `file_report` it lists whatever
  tools the backend's **bridge** gives this run (`AI_STUDIO_TOOLS_URL`): the server stays standalone and dumb.
- **Bridge** (`server/src/room/bridge.ts`): per-run token + tool handlers, for agent runs *and* crew calls.
  FakeRunner reaches the same handlers directly (`io.tool`).
- **Room** (`server/src/room/`): who is in it (draft: the orchestrator + anyone who joined; project: its staff +
  anyone who joined), from `room.joined` events. Pure rule `approverFor(caller, callee, room)`:
  orchestrator → nobody; callee already in the room → nobody; a team member → their captain; anyone else → the orchestrator.
- **Tools:** `room` (who's here), `call_agent {agent, request}` (approval if needed → callee joins → a help run of
  the callee → its answer), and for the Agent Creator `studio_catalog`, `create_agent`, `create_team` (validated
  at once, staged, persisted all-or-nothing when the plan is accepted — the JSON answer stays as fallback).
- **Context:** every agent and crew prompt gets a short "Working with others" section.

## Phases
- [ ] **M1** Room rule + bridge registry + events (`room.joined`, `room.call`) — tests
- [ ] **M2** MCP server lists bridge tools; CLI args + FakeRunner `tool` step — tests
- [ ] **M3** `call_agent` (approval crew call `allow-call`, help crew call `help`), Creator tools, setup chat lines — tests
- [ ] **M4** "Working with others" context in agent + crew prompts — tests
- [ ] **M5** Setup room UI: the Creator and guests join the stage, the ask-and-allow moment in the chat (UX spec) — tests
- [ ] **M6** Verify: fake-runner flow in the app + one real run (Tinker asks Twinkle for a costume) in a throwaway root

## Status
- 2026-11-15: roadmap written; UX spec commissioned (`spec-ux-room.md`).
