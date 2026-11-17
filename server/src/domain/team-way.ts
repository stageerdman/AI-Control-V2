/* A team's way of working (updates/2026-11-17 WORKFLOWS, v2 S2–S4). Pure.
   - `defaultTeamWay`: the way a team works when nobody drew one — a picture of what already happens at run time
     (the captain splits, members build, the captain pulls it together). Hand-offs only, no gates: no extra
     review runs. Two shapes: `captain` (everyone works for the captain) and `chain` (pass it along).
   - `chainOrder`: when a way is one closed chain of hand-offs, the order work passes in (the split follows it).
   - `pruneWay`: a team's own way after members left — every arrow touching them gone, still a valid way. */
import type { Step } from './workflow-drawing.ts';
import { DEFAULT_MAX_SEND_BACKS, type Workflow } from './workflows.ts';

export const WAY_SHAPES = ['captain', 'chain'] as const;
export type WayShape = (typeof WAY_SHAPES)[number];

export type Crew = { captainId: string | null; members: readonly string[] };

const CAPTAIN_AT = { x: 150, y: 300 };
const MEMBERS_X = 650;
const TOP = 80;
const BOTTOM = 520;
const LEFT = 100;
const RIGHT = 900;

/** Evenly spread n points over [from, to]; one point sits in the middle. */
const spread = (n: number, from: number, to: number): number[] =>
  Array.from({ length: n }, (_, i) => (n === 1 ? (from + to) / 2 : from + (i * (to - from)) / (n - 1)));

/** The captain first, then the others in crew order (no captain: the first member leads). */
export function captainFirst(crew: Crew): string[] {
  const lead = crew.captainId && crew.members.includes(crew.captainId) ? crew.captainId : crew.members[0];
  return lead ? [lead, ...crew.members.filter((m) => m !== lead)] : [];
}

function captainShape(lead: string, others: readonly string[]): Pick<Workflow, 'steps' | 'layout'> {
  const ys = spread(others.length, TOP, BOTTOM);
  return {
    steps: others.flatMap((m): Step[] => [
      { from: lead, to: m, why: 'Their part of the work' },
      { from: m, to: lead, why: 'Brings it back to be pulled together' },
    ]),
    layout: {
      [lead]: CAPTAIN_AT,
      ...Object.fromEntries(others.map((m, i) => [m, { x: MEMBERS_X, y: Math.round(ys[i] as number) }])),
    },
  };
}

function chainShape(lead: string, others: readonly string[]): Pick<Workflow, 'steps' | 'layout'> {
  const line = [lead, ...others];
  const xs = spread(line.length, LEFT, RIGHT);
  return {
    steps: line.map((from, i) => {
      const to = line[i + 1] ?? lead;
      return { from, to, why: to === lead ? 'Brings it back to be pulled together' : 'Passes the work on' };
    }),
    layout: Object.fromEntries(line.map((m, i) => [m, { x: Math.round(xs[i] as number), y: CAPTAIN_AT.y }])),
  };
}

const SHAPED = {
  captain: {
    name: 'Captain checks all',
    summary: 'The captain splits the work; each member builds their part and brings it back to be pulled together.',
    draw: captainShape,
  },
  chain: {
    name: 'Pass it along',
    summary: 'The work passes from member to member in order, then back to the captain to pull it together.',
    draw: chainShape,
  },
} as const;

/** The way a team works when it has none of its own. null: fewer than 2 members (nothing to hand on). */
export function defaultTeamWay(crew: Crew, shape: WayShape): Workflow | null {
  const [lead, ...others] = captainFirst(crew);
  if (!lead || !others.length) return null;
  const { name, summary, draw } = SHAPED[shape];
  return {
    id: 'team',
    name,
    when: 'everything',
    orchestratorTalksTo: 'captains',
    gates: [],
    maxSendBacks: DEFAULT_MAX_SEND_BACKS,
    summary,
    first: lead,
    final: lead,
    ...draw(lead, others),
  };
}

/** The order work passes in when the way's hand-offs form one closed chain (each one hands to exactly one,
    no branch labels), starting at who starts. null: any other drawing (it stays soft guidance). */
export function chainOrder(w: Pick<Workflow, 'steps' | 'first'>): string[] | null {
  const steps = w.steps ?? [];
  if (steps.length < 2 || steps.some((s) => s.when)) return null;
  const next = new Map<string, string>();
  for (const s of steps) {
    if (next.has(s.from)) return null;
    next.set(s.from, s.to);
  }
  const start = w.first && next.has(w.first) ? w.first : (steps[0] as Step).from;
  const order = [start];
  for (let at = next.get(start); at !== start; at = next.get(at)) {
    if (at === undefined || order.includes(at)) return null;
    order.push(at);
  }
  return order.length === steps.length ? order : null;
}

/** A team's own way after `gone` left: their arrows, start, sign-last and position dropped. Who signs last
    falls to the captain when that still reads. null: no arrow left (the team is back on its default). */
export function pruneWay(w: Workflow, gone: ReadonlySet<string>, captainId: string | null): Workflow | null {
  const gates = w.gates.filter((g) => !gone.has(g.after) && !gone.has(g.reviewer));
  const steps = (w.steps ?? []).filter((s) => !gone.has(s.from) && !gone.has(s.to));
  if (!gates.length && !steps.length) return null;
  const { first, final, layout, steps: _steps, ...rest } = w;
  const touches = (id: string) =>
    !gone.has(id) &&
    (steps.some((s) => s.from === id || s.to === id) || gates.some((g) => g.after === id || g.reviewer === id));
  const canSignLast = (id: string | null): id is string =>
    !!id && touches(id) && (!gates.length || gates.some((g) => g.reviewer === id));
  /* a start or sign-last whose arrows all went with the leavers would no longer read: let it go too */
  const nextFinal = canSignLast(final ?? null) ? final : canSignLast(captainId) ? captainId : undefined;
  const kept = layout && Object.fromEntries(Object.entries(layout).filter(([id]) => !gone.has(id)));
  return {
    ...rest,
    gates,
    ...(steps.length ? { steps } : {}),
    ...(first && touches(first) ? { first } : {}),
    ...(nextFinal ? { final: nextFinal } : {}),
    ...(kept && Object.keys(kept).length ? { layout: kept } : {}),
  };
}
