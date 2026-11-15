/* Team rebuilds, the plan (spec-ux-team-rebuild §2, §4): take people or whole teams off a project, split a
   team, move someone to another team or make them a solo specialist, change a captain. Names resolve only
   against the project's own lineup. Pure: it reads the store, simulates every move on a copy of the lineup,
   and returns the steps + the confirm card — nothing is written (rebuild-service.ts applies and undoes). */
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Store } from '../db/store.ts';
import { workRepo } from '../db/work.ts';
import { HUES } from '../domain/catalog.ts';
import { addMember, type Member, removeMember, TEAM_MAX } from '../domain/teams.ts';
import { AppError, invalid } from '../errors.ts';

const Name = z.string().trim().min(1).max(80);
export const HANDOVER = ['captain', 'director', 'finish-first', 'stop-now'] as const;
export type Handover = (typeof HANDOVER)[number];
const HandoverList = z.array(z.object({ agent: Name, to: z.enum(HANDOVER) })).max(40);
const CaptainList = z.array(z.object({ team: Name, agent: Name })).max(20);

export const RebuildSchema = z.object({
  remove: z.array(Name).max(40).optional(),
  removeTeams: z.array(Name).max(20).optional(),
  move: z
    .array(z.object({ agent: Name, to: Name, job: z.string().trim().max(1000).optional() }))
    .max(40)
    .optional(),
  split: z
    .array(
      z.object({
        team: Name,
        into: z
          .array(
            z.object({
              name: z.string().trim().min(2).max(60),
              captain: Name,
              members: z.array(Name).min(1).max(TEAM_MAX),
            }),
          )
          .min(2)
          .max(4),
      }),
    )
    .max(8)
    .optional(),
  captain: CaptainList.optional(),
  handover: HandoverList.optional(),
});
export type Rebuild = z.output<typeof RebuildSchema>;

/** What the confirm card lets the user change before applying. */
export const OverridesSchema = z.object({
  handover: HandoverList.optional(),
  captain: CaptainList.optional(),
  lone: z
    .array(z.object({ agent: Name, to: z.enum(['specialist', 'remove']) }))
    .max(20)
    .optional(),
});
export type Overrides = z.output<typeof OverridesSchema>;
/** A rebuild with the card's picks folded in (apply re-plans with it). */
export type RebuildInput = Rebuild & { lone?: Overrides['lone'] };

type Person_ = { id: string; name: string };
/** The confirm card (the app's rebuild/api.ts reads the same shape). */
export type RebuildCard = {
  planId: string;
  projectId: string;
  stale: boolean;
  leaves: {
    kind: 'agent' | 'team';
    id: string;
    name: string;
    openItems: { id: string; title: string; to: Handover; toName: string }[];
    running: boolean;
    members?: Person_[];
  }[];
  specialists: Person_[];
  moves: { agentId: string; name: string; fromTeam: string; toTeam: string }[];
  newTeams: { name: string; captainId: string; captainName: string; members: Person_[] }[];
  /** A team whose captain changed (left, moved, or named): who now, and who else could. `teamId` = what to send back. */
  captains: { teamId: string; teamName: string; agentId: string; name: string; choices: Person_[] }[];
  copies: { teamId: string; teamName: string; otherProjects: string[] }[];
  lone: { teamId: string; teamName: string; agentId: string; name: string; pick: 'specialist' | 'remove' }[];
};

/** What applying does, in order. `key` is a Cast team id, or `new:n` for a team this rebuild creates. */
export type RebuildStep =
  | {
      kind: 'team.create';
      key: string;
      from: string;
      name: string;
      emblem: string;
      color: string;
      captainId: string;
      members: Member[];
    }
  | { kind: 'team.update'; key: string; name: string; captainId: string | null; members: Member[] }
  | { kind: 'project.lineup'; teamKeys: string[]; agentIds: string[] }
  | {
      kind: 'item.assign';
      itemId: string;
      agentId: string;
      teamKey: string | null;
      stopRunId: string | null;
      note: string | null;
    };

export type PlanResult =
  | {
      ok: true;
      planId: string;
      steps: RebuildStep[];
      needsConfirm: boolean;
      card: RebuildCard;
      /** Who is on the project before / after (for events). */
      before: string[];
      after: string[];
    }
  | { ok: false; error: string };

/* ---------------------------------------------------------------- the world as it is */

type Person = { id: string; name: string; nick: string | null; role: string };
type OpenItem = { id: string; title: string; agentId: string; teamId: string | null; runId: string | null; running: boolean };
type TeamNow = {
  id: string;
  name: string;
  emblem: string;
  color: string;
  captainId: string | null;
  members: Member[];
  /** Names of the other projects this Cast team is on. */
  sharedWith: string[];
};
type World = {
  projectId: string;
  projectName: string;
  directorId: string;
  directorName: string;
  teams: TeamNow[];
  specialists: string[];
  people: Map<string, Person>;
  items: OpenItem[];
  castTeamNames: Set<string>;
  usedLooks: Set<string>;
};

const key = (s: string) => s.trim().toLowerCase();
const bare = (s: string) => key(s).replace(/^the\s+/, '');

function readWorld(store: Store, projectId: string): World {
  const p = store.projects.require(projectId);
  const projectName = (id: string) => store.projects.get(id)?.name ?? id;
  const teams = p.teamIds.flatMap((id) => {
    const t = store.teams.get(id);
    if (!t) return [];
    const sharedWith = t.projectIds.filter((x) => x !== p.id).map(projectName);
    const { name, emblem, color, captainId, members } = t;
    return [{ id: t.id, name, emblem, color, captainId, members, sharedWith }];
  });
  const ids = new Set([...teams.flatMap((t) => t.members.map((m) => m.agentId)), ...p.agentIds]);
  const people = new Map<string, Person>();
  for (const id of ids) {
    const a = store.agents.get(id);
    if (a) people.set(id, { id, name: a.name, nick: a.nick, role: a.role });
  }
  const work = workRepo(store.db);
  const items = [...work.projectItems(projectId, 'running'), ...work.projectItems(projectId, 'todo')].map(
    (i) => ({
      id: i.id,
      title: i.text,
      agentId: i.agentId,
      teamId: i.teamId,
      runId: i.runId,
      running: i.status === 'running',
    }),
  );
  const cast = store.teams.list();
  return {
    projectId,
    projectName: p.name,
    directorId: p.orchestratorId,
    directorName: store.agents.get(p.orchestratorId)?.name ?? 'the director',
    teams,
    specialists: p.agentIds.filter((id) => people.has(id)),
    people,
    items,
    castTeamNames: new Set(cast.map((t) => key(t.name))),
    usedLooks: new Set(cast.map((t) => `${t.emblem}:${t.color}`)),
  };
}

/** Who is on the project, for the director's prompt and the Rearrange view. */
export function projectLineup(store: Store, projectId: string) {
  const w = readWorld(store, projectId);
  const person = (id: string) => w.people.get(id) ?? { id, name: id, nick: null, role: '' };
  return {
    teams: w.teams.map((t) => ({
      id: t.id,
      name: t.name,
      captainId: t.captainId,
      members: t.members.map((m) => {
        const p = person(m.agentId);
        return { id: p.id, name: p.name, role: p.role, job: m.instr };
      }),
      sharedWith: t.sharedWith,
    })),
    specialists: w.specialists.map((id) => {
      const p = person(id);
      return { id: p.id, name: p.name, role: p.role };
    }),
  };
}
export type Lineup = ReturnType<typeof projectLineup>;

/* ---------------------------------------------------------------- the simulation */

/** A team table as the rebuild leaves it. `origin` = the project team it descends from (same, copy or split part). */
type Table = {
  key: string;
  origin: string;
  name: string;
  emblem: string;
  color: string;
  captainId: string | null;
  members: Member[];
  sharedWith: string[];
  touched: boolean;
  split: boolean;
};
type Draft = {
  tables: Table[];
  specialists: string[];
  leftTeams: Table[];
  leftPeople: string[];
  solo: string[];
  moves: { agentId: string; fromName: string; to: Table }[];
  lone: { table: Table; agentId: string; pick: 'specialist' | 'remove' }[];
  copies: { teamId: string; teamName: string; otherProjects: string[] }[];
  fresh: number;
};

const seated = (t: Table, id: string) => t.members.some((m) => m.agentId === id);

function simulator(w: World) {
  const d: Draft = {
    tables: w.teams.map((t) => ({ ...t, key: t.id, origin: t.id, touched: false, split: false })),
    specialists: [...w.specialists],
    leftTeams: [],
    leftPeople: [],
    solo: [],
    moves: [],
    lone: [],
    copies: [],
    fresh: 0,
  };
  const nameOf = (id: string) => w.people.get(id)?.name ?? id;
  const person = (n: string): string => {
    if (w.people.has(n)) return n;
    const hits = [...w.people.values()].filter(
      (p) => key(p.name) === key(n) || (p.nick && key(p.nick) === key(n)),
    );
    if (hits.length > 1) throw invalid(`two people are called "${n}" — say which`);
    if (hits[0]) return hits[0].id;
    throw invalid(`"${n}" isn't on this project`);
  };
  const table = (n: string): Table => {
    const t = d.tables.find((x) => x.key === n || key(x.name) === key(n) || bare(x.name) === bare(n));
    if (!t) throw invalid(`there's no team called "${n}" on this project`);
    return t;
  };
  const tablesOf = (id: string) => d.tables.filter((t) => seated(t, id));
  const unseat = (t: Table, id: string) => {
    const r = removeMember(t, id);
    if (!r) return;
    t.members = r.team.members;
    t.captainId = r.team.captainId;
    t.touched = true;
  };
  const newKey = () => `new:${++d.fresh}`;
  /** Same emblem, the next hue nobody wears with it yet (else the team's own). */
  const freeHue = (emblem: string, from: string) => {
    const start = Math.max(0, HUES.indexOf(from as (typeof HUES)[number]));
    const order = [...HUES.slice(start + 1), ...HUES.slice(0, start + 1)];
    const hue = order.find((h) => !w.usedLooks.has(`${emblem}:${h}`)) ?? from;
    w.usedLooks.add(`${emblem}:${hue}`);
    return hue;
  };
  const taken = (name: string, except?: Table) =>
    d.tables.some((t) => t !== except && key(t.name) === key(name)) ||
    (w.castTeamNames.has(key(name)) && !(except && key(except.name) === key(name)));
  const unique = (name: string) => {
    let n = name;
    for (let i = 2; taken(n); i++) n = `${name} ${i}`;
    return n;
  };
  /** A rule broken in one move fails the whole plan, saying which move. */
  const step = (label: string, fn: () => void) => {
    try {
      fn();
    } catch (e) {
      if (e instanceof AppError) throw invalid(`${label}: ${e.message}`);
      throw e;
    }
  };
  const drop = (t: Table) => {
    d.tables = d.tables.filter((x) => x !== t);
  };

  function removeTeams(names: string[]) {
    for (const n of names)
      step(`Removing ${n}`, () => {
        const t = table(n);
        drop(t);
        d.leftTeams.push(t);
      });
  }

  function removePeople(names: string[]) {
    for (const n of names)
      step(`Taking ${n} off the project`, () => {
        const id = person(n);
        const seats = tablesOf(id);
        if (!seats.length && !d.specialists.includes(id)) return; // already leaving with their team
        d.specialists = d.specialists.filter((x) => x !== id);
        for (const t of seats) unseat(t, id);
        if (!d.leftPeople.includes(id)) d.leftPeople.push(id);
      });
  }

  function split(s: NonNullable<Rebuild['split']>[number]) {
    step(`Splitting ${s.team}`, () => {
      const t = table(s.team);
      const seat = new Map(t.members.map((m) => [m.agentId, m]));
      const placed = new Set<string>();
      const parts = s.into.map((part) => {
        const captainId = person(part.captain);
        const ids = part.members.map(person);
        if (!ids.includes(captainId)) ids.unshift(captainId);
        for (const id of ids) {
          if (!seat.has(id)) throw invalid(`${nameOf(id)} isn't on ${t.name}`);
          if (placed.has(id)) throw invalid(`${nameOf(id)} is in two of the new teams`);
          placed.add(id);
        }
        if (ids.length > TEAM_MAX) throw invalid(`${part.name} would have ${ids.length} people — a team has at most ${TEAM_MAX}`);
        if (ids.length < 2)
          throw invalid(`${part.name} would have one person — that's a specialist, not a team`);
        return { name: part.name, captainId, members: ids.map((id) => seat.get(id) as Member) };
      });
      const missing = t.members.find((m) => !placed.has(m.agentId));
      if (missing)
        throw invalid(`${nameOf(missing.agentId)} isn't in any of the new teams — everyone keeps a seat in a split`);
      const shared = t.sharedWith.length > 0;
      if (shared) d.copies.push({ teamId: t.origin, teamName: t.name, otherProjects: t.sharedWith });
      const seen = new Set<string>();
      const made = parts.map((p, i): Table => {
        const reuse = !shared && i === 0; // a team used only here is edited directly
        if (seen.has(key(p.name)) || taken(p.name, reuse ? t : undefined) || (!reuse && key(p.name) === key(t.name)))
          throw invalid(`a team called "${p.name}" already exists`);
        seen.add(key(p.name));
        return {
          ...t,
          key: reuse ? t.key : newKey(),
          name: p.name,
          color: reuse ? t.color : freeHue(t.emblem, t.color),
          captainId: p.captainId,
          members: p.members,
          sharedWith: [],
          touched: true,
          split: true,
        };
      });
      d.tables.splice(d.tables.indexOf(t), 1, ...made);
    });
  }

  function move(m: NonNullable<Rebuild['move']>[number]) {
    step(`Moving ${m.agent} to ${m.to}`, () => {
      const id = person(m.agent);
      const from = tablesOf(id);
      if (!from.length && !d.specialists.includes(id)) throw invalid(`${nameOf(id)} is leaving this project`);
      const fromName = from[0]?.name ?? 'specialist';
      if (key(m.to) === 'specialist') {
        if (!from.length) return; // already works solo
        for (const t of from) unseat(t, id);
        d.specialists.push(id);
        d.solo.push(id);
        return;
      }
      const to = table(m.to);
      if (seated(to, id)) return;
      const job = m.job ?? from[0]?.members.find((x) => x.agentId === id)?.instr ?? '';
      const roster = addMember(to, { id, kind: 'agent' }, job);
      for (const t of from) unseat(t, id);
      d.specialists = d.specialists.filter((x) => x !== id);
      to.members = roster.members;
      to.captainId = roster.captainId;
      to.touched = true;
      d.moves.push({ agentId: id, fromName, to });
    });
  }

  function captain(c: { team: string; agent: string }) {
    step(`Making ${c.agent} captain of ${c.team}`, () => {
      const t = table(c.team);
      const id = person(c.agent);
      if (!seated(t, id)) throw invalid(`${nameOf(id)} isn't on ${t.name}`);
      if (t.captainId !== id) {
        t.captainId = id;
        t.touched = true;
      }
    });
  }

  /** A changed team left with nobody leaves the project; with one person it isn't a team (specialist by default). */
  function settleSmallTeams(lone: RebuildInput['lone']) {
    const picks = new Map((lone ?? []).map((l) => [person(l.agent), l.to]));
    for (const t of [...d.tables]) {
      if (!t.touched || t.members.length > 1) continue;
      drop(t);
      const id = t.members[0]?.agentId;
      if (!id) continue;
      const pick = picks.get(id) === 'remove' ? 'remove' : 'specialist';
      d.lone.push({ table: t, agentId: id, pick });
      if (pick === 'remove') {
        /* they leave the project: off every other table and desk too, so the card and the lineup agree */
        for (const other of tablesOf(id)) unseat(other, id);
        d.specialists = d.specialists.filter((x) => x !== id);
        if (!d.leftPeople.includes(id)) d.leftPeople.push(id);
      } else if (!tablesOf(id).length && !d.specialists.includes(id)) d.specialists.push(id);
    }
  }

  /** Rule 2.2: a changed team that also works elsewhere becomes this project's own copy. */
  function copyShared() {
    for (const t of d.tables) {
      if (!t.touched || t.split || !t.sharedWith.length) continue;
      d.copies.push({ teamId: t.origin, teamName: t.name, otherProjects: t.sharedWith });
      t.name = unique(`${t.name} · ${w.projectName}`);
      t.key = newKey();
      t.color = freeHue(t.emblem, t.color);
      t.sharedWith = [];
    }
  }

  function run(rb: RebuildInput): Draft {
    removeTeams(rb.removeTeams ?? []);
    removePeople(rb.remove ?? []);
    for (const s of rb.split ?? []) split(s);
    for (const m of rb.move ?? []) move(m);
    for (const c of rb.captain ?? []) captain(c);
    settleSmallTeams(rb.lone);
    copyShared();
    return d;
  }
  return { run, person, nameOf };
}

/* ---------------------------------------------------------------- open work: who carries it now */

type Handed = OpenItem & { to: Handover; toName: string; receiver: string };

function handOver(w: World, d: Draft, rb: RebuildInput, person: (n: string) => string, nameOf: (id: string) => string) {
  /* a pick names a leaver: a person, or a whole team leaving (its id or name) */
  const picks = new Map<string, Handover>();
  const teamPicks = new Map<string, Handover>();
  for (const h of rb.handover ?? []) {
    const team = d.leftTeams.find((t) => t.origin === h.agent || key(t.name) === key(h.agent));
    if (team) teamPicks.set(team.origin, h.to);
    else picks.set(person(h.agent), h.to);
  }
  const onTeams = new Set(d.tables.flatMap((t) => t.members.map((m) => m.agentId)));
  const kept: { item: OpenItem; table: Table | null }[] = [];
  const handed: Handed[] = [];
  for (const it of w.items) {
    /* the director already holds it (handed back by an earlier rebuild): it stays with them */
    if (it.agentId === w.directorId) {
      kept.push({ item: it, table: null });
      continue;
    }
    const heirs = it.teamId ? d.tables.filter((t) => t.origin === it.teamId) : [];
    const home = heirs.find((t) => seated(t, it.agentId)) ?? null;
    const solo = d.specialists.includes(it.agentId) && !onTeams.has(it.agentId);
    const stays = !d.leftPeople.includes(it.agentId) && (onTeams.has(it.agentId) || solo);
    if (stays && (!it.teamId || home || (!heirs.length && solo))) {
      kept.push({ item: it, table: home });
      continue;
    }
    const captainId = heirs.find((t) => t.captainId)?.captainId ?? null;
    const teamLeft = !!it.teamId && d.leftTeams.some((t) => t.origin === it.teamId);
    /* rule 2.3: a member's work goes to their captain; a whole team's or a specialist's back to the director */
    const fallback = !it.teamId || teamLeft || !captainId ? 'director' : 'captain';
    const pick = (teamLeft && it.teamId ? teamPicks.get(it.teamId) : undefined) ?? picks.get(it.agentId);
    let to: Handover;
    if (it.running) to = pick ?? 'finish-first';
    else to = pick === 'captain' || pick === 'director' ? pick : fallback;
    if (to === 'captain' && !captainId) to = 'director';
    /* finish-first: the run goes on, but the item gets its new owner now — if the run fails or comes back,
       somebody on the project holds it (never someone who left) */
    const goesTo = to === 'finish-first' || to === 'stop-now' ? fallback : to;
    const receiver = goesTo === 'captain' && captainId ? captainId : w.directorId;
    handed.push({ ...it, to, receiver, toName: nameOf(receiver) });
  }
  return { kept, handed };
}

/* ---------------------------------------------------------------- the plan */

export function planRebuild(store: Store, projectId: string, rebuild: RebuildInput, planId: string = randomUUID()): PlanResult {
  try {
    const w = readWorld(store, projectId);
    const sim = simulator(w);
    const d = sim.run(rebuild);
    const nameOf = (id: string) => (id === w.directorId ? w.directorName : sim.nameOf(id));
    const { kept, handed } = handOver(w, d, rebuild, sim.person, nameOf);
    const tableKey = (t: Table | null) => t?.key ?? null;
    const heirKey = (teamId: string | null, agentId: string) =>
      tableKey(d.tables.find((t) => t.origin === teamId && seated(t, agentId)) ?? d.tables.find((t) => t.origin === teamId) ?? null);

    const steps: RebuildStep[] = [];
    const original = new Map(w.teams.map((t) => [t.id, t]));
    for (const t of d.tables) {
      if (t.key.startsWith('new:'))
        steps.push({
          kind: 'team.create',
          key: t.key,
          from: t.origin,
          name: t.name,
          emblem: t.emblem,
          color: t.color,
          captainId: t.captainId as string,
          members: t.members,
        });
      else if (t.touched) steps.push({ kind: 'team.update', key: t.key, name: t.name, captainId: t.captainId, members: t.members });
    }
    const onTeams = new Set(d.tables.flatMap((t) => t.members.map((m) => m.agentId)));
    const agentIds = [...new Set(d.specialists)].filter((id) => !onTeams.has(id) && !d.leftPeople.includes(id));
    steps.push({ kind: 'project.lineup', teamKeys: d.tables.map((t) => t.key), agentIds });
    for (const { item, table } of kept)
      if (item.teamId && tableKey(table) !== item.teamId)
        steps.push({ kind: 'item.assign', itemId: item.id, agentId: item.agentId, teamKey: tableKey(table), stopRunId: null, note: null });
    for (const h of handed) {
      const teamKey = h.receiver === w.directorId ? null : heirKey(h.teamId, h.receiver);
      const who = nameOf(h.agentId);
      steps.push({
        kind: 'item.assign',
        itemId: h.id,
        agentId: h.receiver,
        teamKey,
        stopRunId: h.running && h.to === 'stop-now' ? h.runId : null,
        note: h.receiver === w.directorId ? `Needs a new owner — ${who} left` : `Handed over from ${who}`,
      });
    }

    const owned = (pred: (h: Handed) => boolean) => {
      const list = handed.filter(pred);
      return {
        openItems: list.map((h) => ({ id: h.id, title: h.title, to: h.to, toName: h.toName })),
        running: list.some((h) => h.running),
      };
    };
    const people = (ms: Member[]) => ms.map((m) => ({ id: m.agentId, name: nameOf(m.agentId) }));
    const card: RebuildCard = {
      planId,
      projectId,
      stale: false,
      leaves: [
        ...d.leftTeams.map((t) => ({
          kind: 'team' as const,
          id: t.origin,
          name: t.name,
          members: people(t.members),
          ...owned((h) => h.teamId === t.origin),
        })),
        ...d.leftPeople.map((id) => ({ kind: 'agent' as const, id, name: nameOf(id), ...owned((h) => h.agentId === id && !d.leftTeams.some((t) => t.origin === h.teamId)) })),
      ],
      specialists: d.solo.map((id) => ({ id, name: nameOf(id) })),
      moves: d.moves.map((m) => ({ agentId: m.agentId, name: nameOf(m.agentId), fromTeam: m.fromName, toTeam: m.to.name })),
      newTeams: d.tables
        .filter((t) => t.split)
        .map((t) => ({
          name: t.name,
          captainId: t.captainId as string,
          captainName: nameOf(t.captainId as string),
          members: people(t.members),
        })),
      captains: d.tables
        .filter((t) => !t.split && t.captainId && t.captainId !== original.get(t.origin)?.captainId)
        .map((t) => ({
          teamId: t.origin, // the captain pick resolves the team by its project id, before any copy
          teamName: t.name,
          agentId: t.captainId as string,
          name: nameOf(t.captainId as string),
          choices: people(t.members),
        })),
      copies: d.copies,
      lone: d.lone.map((l) => ({
        teamId: l.table.origin,
        teamName: l.table.name,
        agentId: l.agentId,
        name: nameOf(l.agentId),
        pick: l.pick,
      })),
    };
    const before = [...w.people.keys()];
    const after = [...onTeams, ...agentIds];
    const needsConfirm = card.leaves.length > 0 || handed.length > 0 || card.copies.length > 0 || card.lone.length > 0;
    return { ok: true, planId, steps, needsConfirm, card, before, after };
  } catch (e) {
    if (e instanceof AppError) return { ok: false, error: e.message };
    throw e;
  }
}

/** One plain line for the chat: "Done — Elon left, Humanitarian works solo, the Founders are now Design and Build." */
export function summaryOf(card: RebuildCard): string {
  const and = (xs: string[]) => (xs.length < 2 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
  const parts: string[] = [];
  const left = card.leaves.map((l) => l.name);
  if (left.length) parts.push(`${and(left)} left`);
  const solo = [...card.specialists.map((s) => s.name), ...card.lone.filter((l) => !left.includes(l.name)).map((l) => l.name)];
  if (solo.length) parts.push(`${and(solo)} ${solo.length > 1 ? 'work' : 'works'} solo`);
  if (card.newTeams.length) parts.push(`the new teams are ${and(card.newTeams.map((t) => t.name))}`);
  for (const m of card.moves) parts.push(`${m.name} joined ${m.toTeam}`);
  for (const c of card.captains) parts.push(`${c.name} captains ${c.teamName}`);
  return parts.length ? `Done — ${and(parts)}.` : 'Nothing to change — the lineup already looks like that.';
}
