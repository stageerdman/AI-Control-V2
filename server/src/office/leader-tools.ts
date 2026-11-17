/* A leader's hands on running work: stop it (`stop_work`) or tell someone running a note (`tell_agent`).
   The director leads the whole project; a captain leads only their team, a temporary lead their crew (`team` →
   only those agent ids).
   One pair of tools for both, so the two never drift apart. */
import type { Agent } from '../db/agents.ts';
import type { Store } from '../db/store.ts';
import { crewsLedBy } from '../domain/workflows.ts';
import { invalid } from '../errors.ts';
import type { CapableTool } from '../room/bridge.ts';
import type { DirectorStopper } from './director-stop.ts';
import { agentByName } from './people.ts';

export type Leader = {
  projectId: string;
  byId: string;
  /** A captain's team (agent ids); absent → the whole project (the director). */
  team?: readonly string[];
};
export type LeaderServices = {
  store: Store;
  stops: DirectorStopper;
  /** A note for someone's live run, read after their next step (runtime.tell) → false when they aren't running. */
  tell: (projectId: string, agentId: string, from: string, text: string) => boolean;
};

type Args = Record<string, unknown>;
function need(a: Args, k: string): string {
  const v = typeof a[k] === 'string' ? (a[k] as string).trim() : '';
  if (!v) throw invalid(`"${k}" is required.`);
  return v;
}
const names = (a: Args) =>
  (Array.isArray(a.agents) ? a.agents : [])
    .map(String)
    .map((x) => x.trim())
    .filter(Boolean);

/** Who a leader may reach: the director checks the project (passed in); a captain, their team. */
export type Reach = (said: string) => Agent;
export function teamReach(store: Store, team: readonly string[]): Reach {
  return (said) => {
    const a = agentByName(store, said);
    if (a && team.includes(a.id)) return a;
    throw invalid(`Nobody called ${said} is on your team.`);
  };
}

export function leaderTools(s: LeaderServices, l: Leader, reach: Reach): CapableTool[] {
  const where = l.team ? 'your team' : 'this project';
  const fromName = () => s.store.agents.get(l.byId)?.name ?? 'your leader';

  function stopWork(a: Args): string {
    const message = typeof a.message === 'string' ? a.message : undefined;
    const opts = { message, ...(l.team ? { team: l.team } : {}) };
    if (a.everyone === true) return s.stops.apply(l.projectId, l.byId, { everyone: true }, opts).join('\n');
    const agents = names(a);
    if (!agents.length) throw invalid('Say who to stop: "agents" (names) or "everyone": true.');
    return s.stops.apply(l.projectId, l.byId, { agents }, opts).join('\n');
  }

  function tellAgent(a: Args): string {
    const text = need(a, 'message');
    const them = reach(need(a, 'to'));
    const nick = them.nick || them.name.split(' ')[0];
    if (s.tell(l.projectId, them.id, fromName(), text)) return `${nick} will read it after their next step.`;
    return `${nick} isn’t running now — call them, or put the work on the whiteboard.`;
  }

  return [
    {
      name: 'stop_work',
      can: `stop anyone’s work on ${where}, or all of it, at once, optionally with a message for them`,
      description: `Stop work now: these people, or everyone on ${where}${l.team ? '' : ' (every agent and code run; running goals stop too)'}. Their chats and saved work stay, so it can be continued later. A \`message\` (why, or what to do instead) is left on each stopped agent’s desk. Do not start work in the same turn.`,
      inputSchema: {
        type: 'object',
        properties: {
          agents: { type: 'array', items: { type: 'string' }, description: 'Their names.' },
          everyone: { type: 'boolean', description: `Stop everything on ${where}.` },
          message: { type: 'string', description: 'Optional: why, left on their desk.' },
        },
      },
      run: async (a) => stopWork(a),
    },
    {
      name: 'tell_agent',
      can: `tell someone on ${where} who is working right now something without stopping them ("tell Bob to use the existing logger") — they read it after their next step`,
      description: `Send a note to someone running on ${where}; it reaches them after their next tool step and they take it into account without starting over. Use this for suggestions or corrections while they work; stop_work to stop them.`,
      inputSchema: {
        type: 'object',
        properties: {
          to: { type: 'string', description: 'Their name.' },
          message: { type: 'string', description: 'What to tell them, with the context they need.' },
        },
        required: ['to', 'message'],
      },
      run: async (a) => tellAgent(a),
    },
  ];
}

/** A lead's tools on a project: stop and tell, scoped to the teams they captain here plus the crews they lead
    on its running goals (`goals`: the project's; a temporary lead's reach ends with the goal). None → []. */
export function leadTools(
  s: LeaderServices,
  projectId: string,
  agentId: string,
  goals: Parameters<typeof crewsLedBy>[1],
): CapableTool[] {
  const p = s.store.projects.get(projectId);
  const led = (p?.teamIds ?? []).map((id) => s.store.teams.get(id)).filter((t) => t?.captainId === agentId);
  const team = [
    ...new Set([
      ...led.flatMap((t) => t?.members.map((m) => m.agentId) ?? []),
      ...crewsLedBy(agentId, goals),
    ]),
  ];
  if (!team.length) return [];
  return leaderTools(s, { projectId, byId: agentId, team }, teamReach(s.store, team));
}
