/* The director staffs a project from chat (after setup): a new team made of existing Cast agents, whole Cast teams,
   or specialists — by name, never inventing anyone (new agents are designed with Tinker). Applied before any work
   from the same message; everyone added joins the room (`room.joined` by the director) and the office reloads
   (`staff.changed`). */
import { z } from 'zod';
import type { Agent } from '../db/agents.ts';
import type { Store } from '../db/store.ts';
import { EMBLEM_IDS, HUES } from '../domain/catalog.ts';
import { TEAM_MAX } from '../domain/teams.ts';
import { invalid } from '../errors.ts';
import type { EventLog } from '../events/log.ts';

const Name = z.string().trim().min(1).max(80);
export const StaffSchema = z.object({
  team: z
    .object({
      name: z.string().trim().min(2).max(60),
      blurb: z.string().trim().max(200).optional(),
      captain: Name,
      members: z
        .array(z.object({ agent: Name, job: z.string().trim().max(1000).optional() }))
        .min(2)
        .max(TEAM_MAX),
    })
    .optional(),
  teams: z.array(Name).max(4).optional(),
  specialists: z.array(Name).max(8).optional(),
});
export type Staff = z.output<typeof StaffSchema>;

/** Who the director may add: Cast agents and teams not on the project yet (names, for its prompt). */
export function castAvailable(store: Store, projectId: string) {
  const p = store.projects.require(projectId);
  const onTeam = new Set(p.teamIds.flatMap((t) => store.teams.get(t)?.members.map((m) => m.agentId) ?? []));
  const here = (id: string) => onTeam.has(id) || p.agentIds.includes(id);
  return {
    agents: store.agents
      .list()
      .filter((a) => a.kind === 'agent' && !here(a.id))
      .map((a) => ({ name: a.name, role: a.role })),
    teams: store.teams
      .list()
      .filter((t) => !p.teamIds.includes(t.id))
      .map((t) => ({
        name: t.name,
        members: t.members.map((m) => store.agents.get(m.agentId)?.name ?? m.agentId),
      })),
  };
}

export function createStaffing(deps: { store: Store; events: EventLog }) {
  const { store, events } = deps;
  const key = (s: string) => s.trim().toLowerCase();
  const agentNamed = (n: string): Agent => {
    const a = store.agents
      .list()
      .find((x) => x.kind === 'agent' && (key(x.name) === key(n) || (x.nick && key(x.nick) === key(n))));
    if (!a)
      throw invalid(`There's nobody called "${n}" in the Cast — new agents are designed with Tinker first`);
    return a;
  };

  /** Apply it all or nothing → who was added (for the reply line). */
  function apply(
    projectId: string,
    staff: Staff,
    directorId: string,
  ): { added: Agent[]; teamNames: string[] } {
    const p = store.projects.require(projectId);
    const added = new Map<string, Agent>();
    const teamNames: string[] = [];
    const { teamIds, agentIds } = store.tx(() => {
      const teamIds = [...p.teamIds];
      let agentIds = [...p.agentIds];
      const used = new Set(store.teams.list().map((t) => `${t.emblem}:${t.color}`));
      if (staff.team) {
        const t = staff.team;
        if (store.teams.list().some((x) => key(x.name) === key(t.name)))
          throw invalid(`A team called "${t.name}" already exists — add it by name instead`);
        const members = t.members.map((m) => ({ a: agentNamed(m.agent), job: m.job ?? '' }));
        const captain = agentNamed(t.captain);
        if (!members.some((m) => m.a.id === captain.id))
          members.unshift({ a: captain, job: 'Captain: split the work and keep the team’s principles.' });
        const emblem = EMBLEM_IDS.find((e) => !HUES.every((h) => used.has(`${e}:${h}`))) ?? EMBLEM_IDS[0];
        const color = HUES.find((h) => !used.has(`${emblem}:${h}`)) ?? 'grape';
        const team = store.teams.create({
          name: t.name,
          blurb: t.blurb ?? '',
          emblem,
          color,
          members: members.map((m) => ({ agentId: m.a.id, instr: m.job })),
          captainId: captain.id,
        });
        teamIds.push(team.id);
        teamNames.push(team.name);
        for (const m of members) added.set(m.a.id, m.a);
      }
      for (const n of staff.teams ?? []) {
        const team = store.teams
          .list()
          .find((x) => key(x.name) === key(n) || key(x.name.replace(/^the\s+/i, '')) === key(n));
        if (!team) throw invalid(`There's no team called "${n}" in the Cast`);
        if (teamIds.includes(team.id)) continue;
        teamIds.push(team.id);
        teamNames.push(team.name);
        for (const m of team.members) {
          const a = store.agents.get(m.agentId);
          if (a) added.set(a.id, a);
        }
      }
      /* teams stay whole: anyone now on a team is no longer a separate specialist */
      const onTeam = new Set(teamIds.flatMap((t) => store.teams.get(t)?.members.map((m) => m.agentId) ?? []));
      agentIds = agentIds.filter((id) => !onTeam.has(id));
      for (const n of staff.specialists ?? []) {
        const a = agentNamed(n);
        if (onTeam.has(a.id) || agentIds.includes(a.id)) continue;
        agentIds.push(a.id);
        added.set(a.id, a);
      }
      store.projects.update(projectId, { teamIds, agentIds });
      store.guests.list(projectId).forEach((g) => {
        if (onTeam.has(g.agentId) || agentIds.includes(g.agentId)) store.guests.remove(projectId, g.agentId); // now staff
      });
      return { teamIds, agentIds };
    });
    const fresh = [...added.values()].filter(
      (a) =>
        !p.agentIds.includes(a.id) &&
        !p.teamIds.some((t) => store.teams.get(t)?.members.some((m) => m.agentId === a.id)),
    );
    for (const a of fresh)
      events.append('project', projectId, {
        type: 'room.joined',
        payload: { agentId: a.id, by: directorId },
      });
    events.append('project', projectId, {
      type: 'staff.changed',
      payload: { teamIds, agentIds, added: fresh.map((a) => a.id) },
    });
    return { added: fresh, teamNames };
  }
  return { apply };
}
export type Staffing = ReturnType<typeof createStaffing>;
