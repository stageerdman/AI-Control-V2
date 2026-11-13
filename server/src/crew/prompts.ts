/* What the studio crew is told. The Cast goes in as compact JSON — the model reads it
   well and the fake brain can parse it back (src/crew/fake-brain.ts). */
import type { Agent } from '../db/agents.ts';
import type { Store } from '../db/store.ts';

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
  }[];
  agents: { id: string; name: string; role: string }[];
};

/** Teams (with what they do / how they code / members / captain) and every regular agent with its role. */
export function castCatalogue(store: Store): CastCatalogue {
  const agents = store.agents.list().filter((a) => a.kind === 'agent');
  const byId = new Map(agents.map((a) => [a.id, a]));
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
    })),
    agents: agents.map((a) => ({ id: a.id, name: a.name, role: a.role })),
  };
}

/** The crew member's own brain + the studio's framing (big picture, JSON only, no tools). */
export function crewSystemPrompt(agent: Pick<Agent, 'name' | 'role' | 'prompt'>, altitude: string): string {
  return [
    `# ${agent.name}`,
    `You are ${agent.name} (${agent.role}) in AI Studio.\n\n${agent.prompt.trim()}`,
    `## Your altitude\n\n${altitude}`,
    [
      '## How you answer',
      '',
      'The studio calls you, not a person at a terminal. You have no tools: everything you need is in the message.',
      'Answer with exactly ONE JSON object that follows the contract in the message — no prose around it, no code fences.',
      'Write every text field in plain, friendly words for the user (short sentences, no jargon).',
    ].join('\n'),
  ].join('\n\n');
}

export const ORCHESTRATOR_ALTITUDE =
  'Big picture only: goals, which teams carry the work, progress. Teams and their captains own the details — you never micromanage, never write code, never pick captains for existing teams.';
export const CREATOR_ALTITUDE =
  'You design agents and teams for the Cast. Each agent is a shared definition every project can reuse (each project runs its own copy, with no shared memory), so make them general for their role, not tied to one project.';

export const json = (v: unknown) => JSON.stringify(v);
