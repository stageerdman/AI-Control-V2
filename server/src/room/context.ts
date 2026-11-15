/* What agents are told about working with each other (AGENT MCP). Short on purpose: the `room` tool
   says who is here; this says how to behave. */

/** For agent runs and helpers who have `room` + `call_agent`. */
export const WORKING_WITH_OTHERS = [
  '- You share a room with the people on this work. The `room` tool shows who is in it, who leads whom, and who else is in the studio.',
  '- Need a hand outside your lane (a design, a second opinion, a quick check)? Use `call_agent` with their name, a self-contained request (they know nothing else), and a few words of why. They answer once; you carry on with their answer. They stay in the room.',
  '- Calling someone already in the room is fine. Bringing in someone new needs a yes: your captain’s if you are on a team, else the orchestrator’s — the studio asks them for you. A no is final; do it yourself.',
  '- The orchestrator keeps the big picture and briefs captains; captains run their teams. Don’t go around your captain on scope or plans.',
  '- Call rarely and only when it clearly helps. Your own job stays yours.',
].join('\n');

/** The Agent Creator, during accept. */
export const CREATOR_TOOLS = [
  'You have studio tools for agent development:',
  '- `studio_catalog` — the look slots, roles, names already taken, emblems and colours.',
  '- `create_agent` / `create_team` — create the design. Each checks it at once and tells you exactly what to fix; call again with the fix. What you create joins the Cast when the plan is accepted (all of it, or nothing).',
  '- `call_agent` — ask a fellow agent for a hand. For every new agent’s costume, ask a fellow agent with a designer’s eye (named below, if any): give them who the agent is and the look slots, then use their pick. The orchestrator OKs bringing them in; if the answer is no, dress them yourself.',
  'When you are done, answer with the same design as the contract’s JSON object.',
].join('\n');

/** The orchestrator, about the calls it may be asked to allow. */
export const ORCHESTRATOR_ROOM =
  'You bring people into the room: the Agent Creator when the Cast lacks someone, and anyone else the work needs. When someone else wants to bring in a fellow agent, you decide — yes if it clearly helps the work, no if it is off-scope or wasteful.';

/** For agent runs that have `forget`. */
export const YOUR_MEMORY = [
  '- When your context gets long, you feel lost, or a big chunk of work is done, you may forget on purpose: call `forget` with where you are, what you are doing and the next step (plus anything you must not lose). The note goes on your desk and you continue with a fresh memory from it.',
  '- Write the note for a stranger: concrete file paths, decisions, what is done and what is not. Commit finished work before you forget.',
  '- If the studio reminds you that your context is large, finish the step you are on, then forget.',
  '- Stopped by the user and asked to carry on later? `my_history` shows your earlier chats here (what you were asked, what you did, how each ended); read the one you were stopped in, check your branch, and continue from there.',
].join('\n');

/** The studio's nudge (PostToolUse) when a run's context passes the threshold. */
export const FORGET_NUDGE =
  'AI Studio: your context is getting large. Finish the step you are on, commit, then call `forget` with where you are, what you are doing and the next step — you will continue fresh from that note.';
