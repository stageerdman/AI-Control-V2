/* What the Agent Creator may design (v5): an agent (name, role — new or existing —,
   prompt, a look from the studio's slots) or a whole team (name, blurb, what it does,
   how it codes, emblem, colour, members incl. new agents, captain ∈ members, ≤ 7).
   Pure: shapes (zod) + rules that need the Cast. Persisting runs the B1 rules again. */
import { z } from 'zod';
import { AGENT_HATS, AGENT_TOOLS, ANTENNAS, BODIES, EMBLEM_IDS, FACES, HUES } from './catalog.ts';
import { ROLE_NAME_MAX } from './roles.ts';
import { TEAM_MAX } from './teams.ts';

/** New agents in one designed team (the rest are existing Cast members). */
export const NEW_PER_TEAM = 4;

export const LookDefSchema = z.strictObject({
  hat: z.enum(AGENT_HATS),
  tool: z.enum(AGENT_TOOLS),
  body: z.enum(BODIES),
  antenna: z.enum(ANTENNAS),
  face: z.enum(FACES),
  hue: z.enum(HUES),
});

export const AgentDefSchema = z.strictObject({
  name: z.string().trim().min(2).max(40),
  nick: z.string().trim().min(1).max(30).optional(),
  role: z.string().trim().min(1).max(ROLE_NAME_MAX),
  prompt: z.string().trim().min(40).max(4000),
  look: LookDefSchema,
});
export type AgentDef = z.output<typeof AgentDefSchema>;

const job = z.string().trim().min(1).max(1000);
export const TeamMemberDefSchema = z.union([
  z.strictObject({ agentId: z.string().trim().min(1).max(80), job }),
  z.strictObject({ newAgent: AgentDefSchema, job }),
]);
export type TeamMemberDef = z.output<typeof TeamMemberDefSchema>;

export const TeamDefSchema = z.strictObject({
  name: z.string().trim().min(2).max(60),
  blurb: z.string().trim().min(1).max(200),
  /** What the team does. */
  instr: z.string().trim().min(1).max(2000),
  /** How the team codes. */
  code: z.string().trim().min(1).max(2000),
  emblem: z.enum(EMBLEM_IDS),
  color: z.enum(HUES),
  members: z.array(TeamMemberDefSchema).min(2).max(TEAM_MAX),
  /** An existing member's agentId, or the name of one of the new agents. */
  captain: z.string().trim().min(1).max(80),
});
export type TeamDef = z.output<typeof TeamDefSchema>;

export type MintContext = {
  /** Names in use — the Cast plus anything designed earlier in the same accept. */
  agentNames: readonly string[];
  teamNames: readonly string[];
  agent(id: string): { name: string; kind: string } | null;
  /** Agents the plan already uses as specialists (a new team must not swallow them). */
  specialists?: readonly string[];
};

const key = (s: string) => s.trim().toLowerCase();

export function agentDefIssues(def: AgentDef, ctx: MintContext): string[] {
  return ctx.agentNames.some((n) => key(n) === key(def.name))
    ? [`name: '${def.name}' is already in the Cast — pick another name`]
    : [];
}

export function teamDefIssues(def: TeamDef, ctx: MintContext): string[] {
  const out: string[] = [];
  if (ctx.teamNames.some((n) => key(n) === key(def.name)))
    out.push(`name: a team called '${def.name}' already exists — pick another name`);
  const fresh = def.members.flatMap((m) => ('newAgent' in m ? [m.newAgent] : []));
  if (fresh.length > NEW_PER_TEAM)
    out.push(`members: at most ${NEW_PER_TEAM} new agents per team — reuse Cast agents for the rest`);
  const seen = new Set<string>();
  def.members.forEach((m, i) => {
    if ('agentId' in m) {
      const a = ctx.agent(m.agentId);
      if (!a) out.push(`members.${i}.agentId: no agent '${m.agentId}' in the Cast`);
      else if (a.kind !== 'agent')
        out.push(`members.${i}.agentId: ${a.name} is studio crew and can't join teams`);
      else if (ctx.specialists?.includes(m.agentId))
        out.push(`members.${i}.agentId: ${a.name} is already on the plan as a specialist`);
      if (seen.has(m.agentId)) out.push(`members.${i}.agentId: '${m.agentId}' is listed twice`);
      seen.add(m.agentId);
    } else {
      const k = `new:${key(m.newAgent.name)}`;
      if (seen.has(k)) out.push(`members.${i}.newAgent.name: '${m.newAgent.name}' is listed twice`);
      seen.add(k);
      out.push(...agentDefIssues(m.newAgent, ctx).map((x) => `members.${i}.newAgent.${x}`));
    }
  });
  const captains = def.members.filter((m) =>
    'agentId' in m ? m.agentId === def.captain : key(m.newAgent.name) === key(def.captain),
  );
  if (captains.length !== 1)
    out.push(
      `captain: must be one of the team's members (an agentId from members, or a new agent's name) — '${def.captain}' isn't`,
    );
  return out;
}
