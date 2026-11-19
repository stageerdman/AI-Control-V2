/* Times and estimates (pure): the timesheet read → the small tags on task cards and feature rows, and the
   team sheet's "How long work takes". Design: design/time-estimates.md. No React, no I/O. */
import type { Estimate, Timesheet, WorkTimes } from './api';
import { worked } from './time';

/** What a tag shows, what a screen reader hears, the tooltip; `over` = past the top of the usual range. */
export type TimeTag = { text: string; spoken: string; title: string; over: boolean };

const MIN = 60_000;

/** A guess, rounded so it doesn't pretend: 5-minute steps under an hour, 15 above. "~1h 15m", never "~1h 13m". */
export function about(ms: number): string {
  const m = Math.max(0, ms) / MIN;
  if (m < 1) return worked(ms);
  const step = m < 60 ? 5 : 15;
  return worked(Math.max(1, Math.round(m / step) * step) * MIN);
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/** "Usually 40m–2h, from 6 finished tasks by Pete" (whose: only when the guess is the assignee's own). */
export function basisLine(e: Estimate, what: 'task' | 'goal' | 'feature', whose?: string): string {
  const n = what === 'feature' ? plural(e.basis, 'shipped feature') : plural(e.basis, `finished ${what}`);
  const by = e.from === 'agent' && whose ? ` by ${whose}` : '';
  return `Usually ${about(e.ms.low)}–${about(e.ms.high)}, from ${n}${by}`;
}

/** One piece of work's tag. `open` = still to do or running; `guess` = what this kind of work usually takes. */
export function timeTag(
  time: WorkTimes | undefined,
  open: boolean,
  guess: Estimate | null | undefined,
  what: 'task' | 'goal' | 'feature' = 'task',
  whose?: string,
): TimeTag | null {
  const spent = time?.activeMs ?? 0;
  const did = worked(spent);
  if (!open) {
    if (!spent) return null;
    const wall = time?.wallMs ?? 0;
    return {
      text: did,
      spoken: `took ${did}`,
      title: wall ? `${did} of agent time, ${worked(wall)} start to finish` : `${did} of agent time`,
      over: false,
    };
  }
  if (!guess) {
    if (!spent) return null;
    return { text: did, spoken: `${did} so far`, title: `${did} of agent time so far`, over: false };
  }
  const usual = about(guess.ms.typical);
  const basis = basisLine(guess, what, whose);
  if (!spent) return { text: `~${usual}`, spoken: `usually about ${usual}`, title: basis, over: false };
  const over = spent > guess.ms.high;
  return {
    text: `${did} of ~${usual}`,
    spoken: `${did} so far, usually about ${usual}${over ? ', running long' : ''}`,
    title: `${did} so far. ${basis}`,
    over,
  };
}

const OPEN_TASK = new Set(['todo', 'running']);

/** Tag per top-level task id: its own guess (the assignee's past, else the office's). */
export function taskTags(sheet: Timesheet | undefined, nameOf: (id: string) => string): Map<string, TimeTag> {
  const out = new Map<string, TimeTag>();
  for (const t of sheet?.tasks ?? []) {
    const open = OPEN_TASK.has(t.status);
    const guess = open ? (t.estimate !== undefined ? t.estimate : sheet?.estimates.task) : null;
    const tag = timeTag(t.time, open, guess, 'task', nameOf(t.agentId));
    if (tag) out.set(t.itemId, tag);
  }
  return out;
}

/** Tag per feature id: shipped = what it took; in progress = so far; planned = the guess for a feature. */
export function featureTags(sheet: Timesheet | undefined): Map<string, TimeTag> {
  const out = new Map<string, TimeTag>();
  for (const f of sheet?.features ?? []) {
    const tag = timeTag(f.time, f.status !== 'shipped', sheet?.estimates.feature, 'feature');
    if (tag) out.set(f.featureId, tag);
  }
  return out;
}

/* ---------- the team sheet's "How long work takes" */

export type GuessRow = { id: 'task' | 'goal' | 'feature'; label: string; usual: string; range: string; basis: number };
const LABELS = { task: 'A task', goal: 'A goal', feature: 'A feature' } as const;

/** One line per kind of work that has a guess, smallest first. */
export function guessRows(sheet: Timesheet | undefined): GuessRow[] {
  if (!sheet) return [];
  return (['task', 'goal', 'feature'] as const).flatMap((id) => {
    const e = sheet.estimates[id];
    return e
      ? [{ id, label: LABELS[id], usual: about(e.ms.typical), range: `${about(e.ms.low)}–${about(e.ms.high)}`, basis: e.basis }]
      : [];
  });
}

/** The most recently finished tasks that have recorded time, newest first. */
export function latestDone(sheet: Timesheet | undefined, n = 5): Timesheet['tasks'] {
  return (sheet?.tasks ?? [])
    .filter((t) => t.status === 'done' && t.time.endedAt && t.time.activeMs > 0)
    .sort((a, b) => (b.time.endedAt ?? '').localeCompare(a.time.endedAt ?? ''))
    .slice(0, n);
}

/** Anything running right now (read again every 30 s while so). */
export const anyLive = (sheet: Timesheet | undefined) => (sheet?.tasks ?? []).some((t) => t.time.live > 0);
