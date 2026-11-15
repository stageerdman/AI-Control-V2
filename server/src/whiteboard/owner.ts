/* Who a whiteboard task goes to: the director names someone (name, nickname or id) and this finds the
   owner the dispatch rules allow — a team's captain (with the team), a specialist, or in "everyone" mode
   any team member. Pure: the roster comes in, an owner or a plain-words refusal goes out. */
import { invalid } from '../errors.ts';

export type RosterPerson = { id: string; name: string; nick?: string | null };
export type RosterTeam = { id: string; name: string; captainId: string | null; memberIds: string[] };
export type Roster = {
  people: RosterPerson[];
  teams: RosterTeam[];
  specialists: ReadonlySet<string>;
  /** The director may brief team members directly (collaboration.orchestratorTalksTo = 'everyone'). */
  everyone: boolean;
};
export type Owner = { agentId: string; teamId: string | null };

const key = (s: string) => s.trim().toLowerCase();

function find(r: Roster, who: string): RosterPerson | null {
  const k = key(who);
  return (
    r.people.find((p) => p.id === who.trim()) ??
    r.people.find((p) => key(p.name) === k || (!!p.nick && key(p.nick) === k)) ??
    null
  );
}

const nameOf = (r: Roster, id: string | null) => r.people.find((p) => p.id === id)?.name ?? id ?? 'nobody';

/** Everyone a task can go to, for the refusal message. */
function onIt(r: Roster): string {
  const leads = r.teams.filter((t) => t.captainId).map((t) => `${nameOf(r, t.captainId)} (captain of ${t.name})`);
  const members = r.everyone
    ? r.teams.flatMap((t) => t.memberIds.map((m) => `${nameOf(r, m)} (${t.name})`))
    : [];
  const solo = [...r.specialists].map((id) => `${nameOf(r, id)} (specialist)`);
  return [...new Set([...leads, ...members, ...solo])].join(', ') || 'nobody yet';
}

/** `team` (name or id) picks one of several teams the person is on. */
export function resolveOwner(r: Roster, who: string, team?: string): Owner {
  const p = find(r, who);
  if (!p) throw invalid(`Nobody called '${who}' works on this project. On it: ${onIt(r)}.`);
  const wanted = team
    ? r.teams.find((t) => t.id === team.trim() || key(t.name) === key(team))
    : undefined;
  if (team && !wanted) throw invalid(`There is no team called '${team}' on this project.`);
  const led = r.teams.filter((t) => t.captainId === p.id && (!wanted || t.id === wanted.id));
  const seats = r.teams.filter((t) => t.memberIds.includes(p.id) && (!wanted || t.id === wanted.id));
  const pick = (list: RosterTeam[]): Owner => {
    if (list.length > 1)
      throw invalid(`${p.name} is on ${list.map((t) => t.name).join(' and ')} — say which team ("team").`);
    return { agentId: p.id, teamId: (list[0] as RosterTeam).id };
  };
  if (led.length) return pick(led);
  if (r.everyone && seats.length) return pick(seats);
  if (!wanted && r.specialists.has(p.id)) return { agentId: p.id, teamId: null };
  const seat = seats[0] ?? r.teams.find((t) => t.memberIds.includes(p.id));
  if (seat)
    throw invalid(
      seat.captainId
        ? `${p.name} is on ${seat.name} — brief it through its captain ${nameOf(r, seat.captainId)}.`
        : `${p.name} is on ${seat.name}, which has no captain — give the task to a specialist or a captain.`,
    );
  throw invalid(`${p.name} is not on ${wanted ? wanted.name : 'this project'}. On it: ${onIt(r)}.`);
}
