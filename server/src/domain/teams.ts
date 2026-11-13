/* Team rules (spec-teams §3.1, v6): ≤ 7 members, no duplicates, no system agents,
   captain ∈ members. First member becomes captain; removing the captain promotes
   the next member in line. Pure — functions return a new team, never mutate. */
import { conflict } from '../errors.ts';
import { type AgentKind, assertNotSystem } from './cast.ts';

export const TEAM_MAX = 7;

export type Member = { agentId: string; instr: string };
export type Roster = { captainId: string | null; members: Member[] };
type AgentRef = { id: string; kind: AgentKind };

const has = (t: Roster, agentId: string) => t.members.some((m) => m.agentId === agentId);

export function addMember(team: Roster, agent: AgentRef, instr = '', at?: number): Roster {
  assertNotSystem(agent);
  if (has(team, agent.id)) throw conflict(`'${agent.id}' is already on this team`, { agentId: agent.id });
  if (team.members.length >= TEAM_MAX)
    throw conflict(`A team has at most ${TEAM_MAX} members`, { max: TEAM_MAX });
  const members = [...team.members];
  members.splice(at ?? members.length, 0, { agentId: agent.id, instr });
  return { members, captainId: team.captainId ?? agent.id };
}

export type Removal = { team: Roster; index: number; member: Member; wasCaptain: boolean };

/** Returns null when the agent isn't on the team. */
export function removeMember(team: Roster, agentId: string): Removal | null {
  const index = team.members.findIndex((m) => m.agentId === agentId);
  if (index < 0) return null;
  const members = team.members.filter((_, i) => i !== index);
  const wasCaptain = team.captainId === agentId;
  const captainId = wasCaptain ? (members[0]?.agentId ?? null) : team.captainId;
  return { team: { members, captainId }, index, member: team.members[index] as Member, wasCaptain };
}

export function setCaptain(team: Roster, agentId: string): Roster {
  if (!has(team, agentId))
    throw conflict(`The captain must be a member of the team ('${agentId}' isn't)`, { agentId });
  return { ...team, captainId: agentId };
}

/** Build a whole roster at once (team create): every rule applied, captain defaults to the first member. */
export function buildRoster(
  members: readonly { agent: AgentRef; instr?: string }[],
  captainId?: string | null,
): Roster {
  let team: Roster = { captainId: null, members: [] };
  for (const m of members) team = addMember(team, m.agent, m.instr ?? '');
  return captainId ? setCaptain(team, captainId) : team;
}
