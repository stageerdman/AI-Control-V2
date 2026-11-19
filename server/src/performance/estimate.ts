/* Time estimates (pure): from what finished work really took, a guess for new work — the median of past
   samples, with the middle half (25th–75th percentile) as the range. Medians, so one run that hung for hours
   doesn't double every guess. Too few samples → null: no guess beats a bad one. */
import type { Timesheet, WorkTimes } from './rollup.ts';

/** Fewer finished samples than this → no estimate. */
export const MIN_SAMPLES = 3;

export type Range = { typical: number; low: number; high: number };
export type Estimate = {
  /** Active (agent) time, ms. */
  ms: Range;
  tokens: Range;
  /** How many finished pieces of work it rests on. */
  basis: number;
  /** Whose past it is: the assignee's own tasks, or the whole office's. */
  from: 'agent' | 'office';
};
export type Estimates = { task: Estimate | null; goal: Estimate | null; feature: Estimate | null };

/** The q-quantile of sorted numbers, interpolated between neighbours. */
export function quantile(sorted: readonly number[], q: number): number {
  if (!sorted.length) return 0;
  const at = (sorted.length - 1) * q;
  const lo = Math.floor(at);
  const hi = Math.ceil(at);
  return Math.round((sorted[lo] as number) + ((sorted[hi] as number) - (sorted[lo] as number)) * (at - lo));
}

function rangeOf(values: readonly number[]): Range {
  const sorted = [...values].sort((a, b) => a - b);
  return { typical: quantile(sorted, 0.5), low: quantile(sorted, 0.25), high: quantile(sorted, 0.75) };
}

/** An estimate from finished samples; null under MIN_SAMPLES. */
export function estimateFrom(samples: readonly WorkTimes[], from: Estimate['from']): Estimate | null {
  if (samples.length < MIN_SAMPLES) return null;
  return {
    ms: rangeOf(samples.map((s) => s.activeMs)),
    tokens: rangeOf(samples.map((s) => s.tokens)),
    basis: samples.length,
    from,
  };
}

/** A sample = work that finished well (done / shipped) and has recorded time. */
const sample = (t: WorkTimes) => t.endedAt !== null && t.runs > 0;

/** Guesses for a new task (for `agentId` when given: their own past if there's enough), goal and feature. */
export function estimatesOf(sheet: Timesheet, agentId?: string): Estimates {
  const tasks = sheet.tasks.filter((t) => t.status === 'done' && sample(t.time));
  const own = agentId ? tasks.filter((t) => t.agentId === agentId) : [];
  return {
    task:
      estimateFrom(
        own.map((t) => t.time),
        'agent',
      ) ??
      estimateFrom(
        tasks.map((t) => t.time),
        'office',
      ),
    goal: estimateFrom(
      sheet.goals.filter((g) => g.status === 'done' && sample(g.time)).map((g) => g.time),
      'office',
    ),
    feature: estimateFrom(
      sheet.features.filter((f) => f.status === 'shipped' && sample(f.time)).map((f) => f.time),
      'office',
    ),
  };
}
