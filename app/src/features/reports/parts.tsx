/* Small shared bits: the author's portrait (live look when the agent still exists, else a
   neutral robot under the snapshot name), the author line, and the reporter check for empties. */
import { type Agent, studio, type Team, useQuery } from '../../api';
import { Emblem, Hero, type HeroAgent } from '../../characters';
import type { ReportAuthor } from './api';

const NEUTRAL: HeroAgent['look'] = {
  hat: 'none',
  tool: 'none',
  body: 'hero',
  antenna: 'bob',
  face: 'none',
  hue: 'grape',
};

export function useCast() {
  const agents = useQuery('agents', studio.agents.list);
  const teams = useQuery('teams', studio.teams.list);
  return { agents: agents.data ?? [], teams: teams.data ?? [] };
}

export function Portrait({ author, agents }: { author: ReportAuthor; agents: Agent[] }) {
  const a = agents.find((x) => x.id === author.agentId);
  return (
    <span className="rp-face" aria-hidden="true">
      <Hero agent={a ?? { name: author.name, look: NEUTRAL }} size={28} pose="idle" facing="front" />
    </span>
  );
}

/** 🤖 Scout · ◆ Research Crew [· Aurora] — names from the live Cast when they still exist. */
export function AuthorLine({
  author,
  agents,
  teams,
  tail,
}: {
  author: ReportAuthor;
  agents: Agent[];
  teams: Team[];
  tail?: React.ReactNode;
}) {
  const a = agents.find((x) => x.id === author.agentId);
  const t = author.teamId ? teams.find((x) => x.id === author.teamId) : undefined;
  const teamName = t?.name ?? author.teamName;
  return (
    <>
      <Portrait author={author} agents={agents} />
      <span>{a?.name ?? author.name}</span>
      {teamName && (
        <>
          <span className="rp-sep" aria-hidden="true">
            ·
          </span>
          {t && <Emblem team={t} size={16} decorative />}
          <span>{teamName}</span>
        </>
      )}
      {tail}
    </>
  );
}

const flag = (x: unknown) => (x as { reporter?: boolean }).reporter === true;

/** Does anyone file reports on this project? undefined = still loading. */
export function useHasReporter(projectId: string): boolean | undefined {
  const roles = useQuery('roles', studio.roles.list);
  const { agents, teams } = useCast();
  const project = useQuery(`project:${projectId}`, () => studio.projects.get(projectId));
  if (!roles.data || !agents.length) return undefined;
  const reporterRoles = new Set(roles.data.filter(flag).map((r) => r.id));
  const p = project.data;
  if (!p) return undefined;
  const pTeams = teams.filter((t) => p.teamIds.includes(t.id));
  if (pTeams.some(flag)) return true;
  const staff = new Set([...p.agentIds, ...pTeams.flatMap((t) => t.members.map((m) => m.agentId))]);
  return agents.some((a) => staff.has(a.id) && a.roleId !== null && reporterRoles.has(a.roleId));
}
