/* What the studio crew is told. The Cast goes in as compact JSON — the model reads it
   well and the fake brain can parse it back (src/crew/fake-brain.ts). */
import type { Agent } from '../db/agents.ts';
import type { Store } from '../db/store.ts';
import { ORCHESTRATOR_ROOM } from '../room/context.ts';

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export type CastCatalogue = {
  teams: {
    id: string;
    name: string;
    blurb: string;
    does: string;
    codes: string;
    captain: string | null;
    members: { id: string; name: string; role: string; job: string }[];
    /** Files reports (research, reviews, write-ups end in the Reports tray). */
    reporter?: true;
  }[];
  agents: { id: string; name: string; role: string; reporter?: true; toolsmith?: true }[];
};

/** Teams (with what they do / how they code / members / captain) and every regular agent with its role. */
export function castCatalogue(store: Store): CastCatalogue {
  const agents = store.agents.list().filter((a) => a.kind === 'agent');
  const byId = new Map(agents.map((a) => [a.id, a]));
  const reporterRole = (roleId: string | null) => !!roleId && !!store.roles.get(roleId)?.reporter;
  const toolsmithRole = (roleId: string | null) => !!roleId && !!store.roles.get(roleId)?.toolsmith;
  return {
    teams: store.teams.list().map((t) => ({
      id: t.id,
      name: t.name,
      blurb: clip(t.blurb, 200),
      does: clip(t.instr, 400),
      codes: clip(t.code, 400),
      captain: t.captainId,
      members: t.members.map((m) => ({
        id: m.agentId,
        name: byId.get(m.agentId)?.name ?? m.agentId,
        role: byId.get(m.agentId)?.role ?? '',
        job: clip(m.instr, 200),
      })),
      ...(t.reporter ? { reporter: true as const } : {}),
    })),
    agents: agents.map((a) => ({
      id: a.id,
      name: a.name,
      role: a.role,
      ...(reporterRole(a.roleId) ? { reporter: true as const } : {}),
      /* quality / test people who keep their own checks — natural reviewers for collaboration gates */
      ...(toolsmithRole(a.roleId) ? { toolsmith: true as const } : {}),
    })),
  };
}

/** The crew member's own brain + the studio's framing (big picture, JSON only, no tools). */
export function crewSystemPrompt(
  agent: Pick<Agent, 'name' | 'role' | 'prompt'>,
  altitude: string,
  /** AGENT MCP: this call has studio tools (the creator's create_* / call_agent). */
  tools = false,
): string {
  return [
    `# ${agent.name}`,
    `You are ${agent.name} (${agent.role}) in AI Studio.\n\n${agent.prompt.trim()}`,
    `## Your altitude\n\n${altitude}`,
    [
      '## How you answer',
      '',
      tools
        ? 'The studio calls you, not a person at a terminal. You have only the studio tools named in the message — no files, no shell.'
        : 'The studio calls you, not a person at a terminal. You have no tools: everything you need is in the message.',
      'Answer with exactly ONE JSON object that follows the contract in the message — no prose around it, no code fences.',
      'Write every text field in plain, friendly words for the user (short sentences, no jargon).',
    ].join('\n'),
  ].join('\n\n');
}

export const ORCHESTRATOR_ALTITUDE = `Big picture only: goals, which teams carry the work, progress. Teams and their captains own the details — you never micromanage, never write code, never pick captains for existing teams. You own the outcome: work that reaches a step limit carries on by itself in a fresh session, so never report it as failed or ask the user to restart it. Only an item that stopped as stuck (no new commits after fresh starts) needs a decision — continue it with a sharper brief, split it, or tell the user plainly why. ${ORCHESTRATOR_ROOM}`;
export const CREATOR_ALTITUDE =
  'You design agents and teams for the Cast. Each agent is a shared definition every project can reuse (each project runs its own copy, with no shared memory), so make them general for their role, not tied to one project.';

export const json = (v: unknown) => JSON.stringify(v);

/** How the orchestrator designs the collaboration (setup chat + the project's redesign call). */
export const COLLABORATION_RULE =
  'Design how the people work together in "collaboration": "orchestratorTalksTo" is "captains" (you brief teams through their captains — the default) or "everyone". "gates" are review handoffs: after work by "after" (a team id, an agent id, or "*" for any work) is done, "reviewer" (a team member or specialist on this project — never the same person) checks it and approves or sends it back with notes. Kinds: "quality" (a quality manager / QA checks the code is correct, modular and simple), "user-test" (someone uses it like a user — good after designers or front-end work), "crash-test" (tries to break it — optional), "security" (later, for risky work), "review" (general). Keep it lean: one or two gates, chosen from people already staffed — gates cost time. For agents the Agent Creator hasn’t designed yet use "new-agent:0", "new-team:0" (their index in newAgents / newTeams). "maxSendBacks" (0–3, default 2) bounds the back-and-forth.';
export const COLLABORATION_EXAMPLE = {
  orchestratorTalksTo: 'captains',
  gates: [
    {
      after: '<team id, agent id or "*">',
      reviewer: '<agent id on the project>',
      kind: 'quality',
      why: 'why this check earns its place',
    },
  ],
  maxSendBacks: 2,
  summary: 'How they work together, in one sentence.',
};
