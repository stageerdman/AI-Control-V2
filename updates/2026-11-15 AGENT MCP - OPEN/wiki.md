# AGENT MCP — wiki

- **One dumb MCP server, a smart bridge.** The stdio server only relays: it asks the backend which tools this run has
  (`/internal/bridges/:id/tools`) and runs them as long-polled jobs. New tools = a `BridgeTool` in the backend, no MCP change.
  The FakeRunner calls the same handlers (`io.tool`), so every flow is testable for free.
- **MCP tools work with `--tools ''`.** Crew calls keep zero built-in tools; MCP tools still load when pre-approved by
  name (`mcp__studio__<name>`). Verified live.
- **Give tools real input schemas.** With `{type: object, additionalProperties: true}` Claude sent nested objects as
  JSON strings. `z.toJSONSchema(schema, {io: 'input'})` fixed it; keep a tolerant parse for nested fields anyway.
- **Stage, then commit all-or-nothing.** `create_*` validate at once (fast feedback beats the repair loop) but only stage;
  accept still persists every design in one transaction. The JSON answer stays as a fallback.
- **Approval is an AI decision, shown as speech.** `approverFor`: orchestrator → nobody; callee in the room → nobody;
  team member → captain; anyone else → orchestrator. The approver gets one small crew call (`allow-call`). The user is
  never asked; a no is final.
- **Joins are events.** The room = staff + `room.joined` events, so reloads rebuild it with a pure fold (`roomFold`).
- **Nudge, don't force.** Without an explicit "ask the designer for every costume" line, Claude skipped the call.
