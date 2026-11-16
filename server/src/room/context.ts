/* What agents are told about working with each other (AGENT MCP). Short on purpose: the `room` tool
   says who is here; this says how to behave. */

/** The rule for callers: a call is answered from the callee's notes with read-only tools, so work asked in a plain call gets lost. */
export const CALLS_RULE =
  'Calls (call_agent) are for questions. To hand someone work, call with `work: true` (it goes on the whiteboard as their task) — never just ask them to do it in a call.';

/** For the called agent (in every call's task). */
export const CALLS_ARE_FOR_QUESTIONS =
  'You answer from your notes (below) and can only read files. If they ask you to make, change or commit something, don’t try: answer any question in it, then say whether it is on the whiteboard as your task (see above) or that they should call again with `work: true`.';

/** Who may stop or interrupt whom: leaders do (stop_work / tell_agent); everyone else waits for them. */
export const LEADERS_RULE =
  'Only leaders stop or interrupt others: the orchestrator anyone, a captain their own team. Need someone stopped? Ask your contact, then wait for them. A leader’s note reaches you after your next step: take it in before you go on.';

/** For the orchestrator: every feature or update gets a phased roadmap, written by the one leader it names. */
export const ROADMAP_RULE =
  'Every feature or update gets a big phased roadmap (the Roadmap section of its update plan in the updates folder: phases, each ending with tests). Only leaders write it: you decide who — the captain of the team that carries it, or yourself when no team does — and say so in the brief ("Write the phased roadmap first").';

/** For everyone else: roadmaps are a leader's job. */
const ROADMAPS_ARE_FOR_LEADERS =
  'Roadmaps are written by the leader the orchestrator names. Not named? Don’t write one; send your ideas to your contact.';

/** For agent runs and helpers who have `room` + `call_agent`. */
export const WORKING_WITH_OTHERS = [
  '- You share a room with the people on this work. The `room` tool shows who is in it, who leads whom, and who else is in the studio — the orchestrator too: you may call them.',
  '- Need a hand outside your lane (a design, a second opinion, a quick check)? Use `call_agent` with their name, a self-contained request (they know nothing else), and a few words of why. They answer once; you carry on with their answer. They stay in the room. If they are busy with another call, yours waits its turn.',
  `- ${CALLS_RULE}`,
  '- Calling someone already in the room is fine. Bringing in someone new needs a yes: your captain’s if you are on a team, else the orchestrator’s — the studio asks them for you. A no is final; do it yourself.',
  '- The orchestrator keeps the big picture and briefs captains; captains run their teams. Don’t go around your captain on scope or plans. `room` names your contact (`yourContact`): the one you report to and ask first.',
  `- ${LEADERS_RULE} ${ROADMAPS_ARE_FOR_LEADERS}`,
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

/** The orchestrator, about the calls it makes and the calls it may be asked to allow. */
export const ORCHESTRATOR_ROOM = `You bring people into the room: the Agent Creator when the Cast lacks someone, and anyone else the work needs. When someone else wants to bring in a fellow agent, you decide — yes if it clearly helps the work, no if it is off-scope or wasteful. ${CALLS_RULE}`;

/** For agent runs that have `forget`. */
export const YOUR_MEMORY = [
  '- You have your own to-do list, kept across sessions: work others asked of you lands there in the order it came. Read it with `my_todos` when you start and before you finish; `add_todo` for your own reminders (`notify: true` pages the user when you tick it off), `done_todo` when one is done.',
  '- When your context gets long, you feel lost, or a big chunk of work is done, you may forget on purpose: call `forget` with where you are, what you are doing and the next step (plus anything you must not lose). The note goes on your desk and you continue with a fresh memory from it.',
  '- Write the note for a stranger: concrete file paths, decisions, what is done and what is not. Commit finished work before you forget.',
  '- If the studio reminds you that your context is large, finish the step you are on, then forget.',
  '- A session has a step limit. If you reach it, the studio carries you on in a fresh session from your latest note — as long as you keep committing. Commit as you go.',
  '- Stopped by the user and asked to carry on later? `my_history` shows your earlier chats here (what you were asked, what you did, how each ended); read the one you were stopped in, check your branch, and continue from there.',
].join('\n');

/** The studio's nudge (PostToolUse) when a run's context passes the threshold. */
export const FORGET_NUDGE =
  'AI Studio: your context is getting large. Finish the step you are on, commit, then call `forget` with where you are, what you are doing and the next step — you will continue fresh from that note.';

/** The studio's nudge when a session is close to its step limit. Read-only research saves its findings, not commits. */
export const wrapUpNudge = (kind: string | null | undefined): string =>
  kind === 'research'
    ? 'AI Studio: about 10 steps left in this session. File your report if it is ready; otherwise call `forget` with what you found so far and the next step — the studio carries you on in a fresh session.'
    : 'AI Studio: about 10 steps left in this session. Commit what is done now. Finish if you can; otherwise call `forget` with where you are and the next step — the studio carries you on in a fresh session.';

/** Steps before the cap at which WRAP_UP_NUDGE is given. */
export const WRAP_UP_STEPS = 10;
