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
- [x] **M1** Room rule + bridge registry + events (`room.joined`, `room.call`) — tests
- [x] **M2** MCP server lists bridge tools; CLI args + FakeRunner `tool` step — tests
- [x] **M3** `call_agent` (approval crew call `allow-call`, help crew call `help`), Creator tools, setup chat lines — tests
- [x] **M4** "Working with others" context in agent + crew prompts — tests
- [x] **M5** Setup room UI: the Creator and guests join the stage, the ask-and-allow moment in the chat (UX spec) — tests
- [x] **M6** Verify: fake-runner flow in the app + one real run (Tinker asks Twinkle for a costume) in a throwaway root

## Status
- 2026-11-15: roadmap written; UX spec commissioned (`spec-ux-room.md`).
- 2026-11-15: **M1–M6 done.** Server 487 tests, app 246 tests green.
  - Free runner in the real app (throwaway root): Tinker joins, asks Pixel, Twinkle joins "for Tinker",
    chat shows the ask-and-allow as asides — `shots/room-mid-accept.png`, `shots/room-after-accept.png`. No console errors.
  - Real Claude (throwaway root, 2 accepts ≈ 8 short runs): run 1 found `create_agent` too loose (look sent as a string);
    fixed with the real JSON schema + tolerant parse and a clearer "ask the designer" line. Run 2 (36 s): Tinker
    `call_agent` → Pixel allowed it on its own → Twinkle picked the costume → `create_agent` passed first try →
    "Offshore Ollie" minted wearing Twinkle's look.
- **Next / not built:** guests called during project work aren't drawn in the office yet (events only — spec §4);
  the installed `/Applications/AI Studio.app` front end needs a rebuild to show the room (backend changes apply on restart).
