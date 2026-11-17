/* What the workflow editor draws on top of a workflow's gates (Phase 5b, shape agreed with Jony). Pure.
   - Nodes are the agents and teams a workflow names: gate ends (not "*"), step ends, the lead and the crew.
   - `steps`: hand-offs that aren't reviews (A hands work to B, and why). Review arrows ARE the gates, so
     sign-offs keep one source of truth.
   - `first`: who starts (agent or team). `final`: who signs last (an agent; one of the reviewers if any).
   - `layout`: where each node sits on the editor's canvas — no meaning anywhere else. */
import { z } from 'zod';
import { BranchLabel, type Gate } from './gates.ts';

export const MAX_STEPS = 12;
const ref = z.string().trim().min(1).max(80);

export const StepSchema = z.strictObject({
  from: ref,
  to: ref,
  why: z.string().trim().min(1).max(300),
  when: BranchLabel.optional(),
});
export type Step = z.output<typeof StepSchema>;

export const CANVAS = { width: 1000, height: 600 };
export type Point = { x: number; y: number };
export type Layout = Record<string, Point>;

const clamp = (n: number, max: number) => Math.min(max, Math.max(0, Math.round(n)));
const isNumber = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/** Pure: positions are cosmetic, so a layout never fails a save — odd points are rounded onto the canvas and
    unreadable ones dropped (tidyLayout later drops positions of anything that isn't a node). */
export function cleanLayout(raw: Record<string, unknown>): Layout {
  const points = Object.entries(raw).flatMap(([id, p]): [string, Point][] => {
    const { x, y } = (p ?? {}) as Record<string, unknown>;
    if (!id.trim() || !isNumber(x) || !isNumber(y)) return [];
    return [[id, { x: clamp(x, CANVAS.width), y: clamp(y, CANVAS.height) }]];
  });
  return Object.fromEntries(points);
}
export const LayoutSchema = z.record(z.string(), z.unknown()).transform(cleanLayout);

/** The editor's fields, spread into the workflow schema. */
export const drawingShape = {
  first: ref.optional(),
  final: ref.optional(),
  layout: LayoutSchema.optional(),
  steps: z.array(StepSchema).max(MAX_STEPS).optional(),
};

export type Drawn = {
  gates: readonly Gate[];
  steps?: readonly Step[];
  lead?: string;
  crew?: readonly string[];
  first?: string;
  final?: string;
  layout?: Layout;
};

/** Who may stand on a node, as the place the workflow lives sees it (a project, or one team). */
export type Who = {
  isAgent: (id: string) => boolean;
  isTeam: (id: string) => boolean;
  name: (id: string) => string;
  /** "on this project" / "on this team" */
  where: string;
};

/** Pure: every agent or team the workflow's arrows and command name. */
export const nodesOf = (w: Drawn): Set<string> =>
  new Set([
    ...w.gates.flatMap((g) => (g.after === '*' ? [g.reviewer] : [g.after, g.reviewer])),
    ...(w.steps ?? []).flatMap((s) => [s.from, s.to]),
    ...(w.lead ? [w.lead] : []),
    ...(w.crew ?? []),
  ]);

function stepIssues(steps: readonly Step[], who: Who, at: string): string[] {
  const seen = new Set<string>();
  return steps.flatMap((s, i) => {
    const here = `${at}.steps.${i}`;
    const out = (['from', 'to'] as const)
      .filter((end) => !who.isAgent(s[end]) && !who.isTeam(s[end]))
      .map((end) => `${here}.${end}: '${s[end]}' is not an agent or team ${who.where}`);
    if (s.from === s.to) out.push(`${here}.to: ${who.name(s.from)} can't hand work to themselves`);
    const pair = `${s.from}\u0000${s.to}`;
    if (seen.has(pair)) out.push(`${here}: ${who.name(s.from)} → ${who.name(s.to)} is listed twice`);
    seen.add(pair);
    return out;
  });
}

function firstIssues(first: string, nodes: Set<string>, who: Who, at: string): string[] {
  if (first === '*') return [`${at}.first: name who starts — '*' is any work, not someone`];
  if (!who.isAgent(first) && !who.isTeam(first))
    return [`${at}.first: '${first}' is not an agent or team ${who.where}`];
  return nodes.has(first) ? [] : [`${at}.first: ${who.name(first)} has no arrow in this workflow`];
}

function finalIssues(w: Drawn & { final: string }, nodes: Set<string>, who: Who, at: string): string[] {
  const { final } = w;
  if (!who.isAgent(final)) return [`${at}.final: '${final}' is not an agent ${who.where}`];
  if (!nodes.has(final)) return [`${at}.final: ${who.name(final)} has no arrow in this workflow`];
  return w.gates.length && !w.gates.some((g) => g.reviewer === final)
    ? [`${at}.final: ${who.name(final)} signs nothing off here — who signs last must be one of the reviewers`]
    : [];
}

/** Pure: every problem with the drawn fields, each starting with its path (`workflows.0.steps.2.to: …`). */
export function drawingIssues(w: Drawn, who: Who, at: string): string[] {
  const nodes = nodesOf(w);
  return [
    ...stepIssues(w.steps ?? [], who, at),
    ...(w.first !== undefined ? firstIssues(w.first, nodes, who, at) : []),
    ...(w.final !== undefined ? finalIssues({ ...w, final: w.final }, nodes, who, at) : []),
  ];
}

const onlyWhen = (when?: string) => (when ? ` (only ${when})` : '');

/** Pure: the drawing as the planner and builders read it — soft guidance, not an engine (the gates still run
    the sign-offs). null = nothing drawn beyond the gates. */
export function drawingInWords(w: Drawn, name: (id: string) => string): string | null {
  const said = [
    ...(w.first ? [`${name(w.first)} starts.`] : []),
    ...(w.steps ?? []).map((s) => `${name(s.from)} hands to ${name(s.to)}${onlyWhen(s.when)}: ${s.why}`),
    ...w.gates
      .filter((g) => g.when)
      .map(
        (g) =>
          `${name(g.reviewer)} checks ${g.after === '*' ? 'all work' : name(g.after)}${onlyWhen(g.when)}.`,
      ),
    ...(w.final ? [`${name(w.final)} signs last.`] : []),
  ];
  return said.length ? said.join(' ') : null;
}

const DRAWN_KEYS = ['first', 'final', 'steps', 'layout'] as const;

/** Pure: `next` keeps what `prev` drew wherever `next` draws nothing — a change that only knows the gates (the
    director's set_workflow) must not erase the editor's drawing. */
export function keepDrawing<W extends Drawn>(next: W, prev: Drawn): W {
  const kept = Object.fromEntries(
    DRAWN_KEYS.filter((k) => next[k] === undefined && prev[k] !== undefined).map((k) => [k, prev[k]]),
  );
  return { ...next, ...kept };
}

/** Pure: the layout keeps only positions of nodes (a removed arrow's node just drops out; no error). */
export function tidyLayout<W extends Drawn>(w: W): W {
  if (!w.layout) return w;
  const nodes = nodesOf(w);
  const kept = Object.fromEntries(Object.entries(w.layout).filter(([id]) => nodes.has(id)));
  const { layout: _all, ...rest } = w;
  return (Object.keys(kept).length ? { ...rest, layout: kept } : rest) as W;
}
