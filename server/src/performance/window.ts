/* The time window a performance read covers: whole local days ending with today, and the window before it (for
   trends). `tz` is the browser's getTimezoneOffset() in minutes (UTC − local), fixed for the whole window. */

export const RANGES = ['7d', '30d', 'all'] as const;
export type RangeName = (typeof RANGES)[number];

const DAY = 86_400_000;
const LENGTH: Record<Exclude<RangeName, 'all'>, number> = { '7d': 7, '30d': 30 };

export type Window = {
  range: RangeName;
  tz: number;
  from: number;
  to: number;
  /** The same length just before; null for all time. */
  previous: { from: number; to: number } | null;
};

/** The UTC instant the local day holding `ms` starts. */
export function dayStart(ms: number, tz: number): number {
  const shift = tz * 60_000;
  return Math.floor((ms - shift) / DAY) * DAY + shift;
}

/** The local date (YYYY-MM-DD) of a local day's start. */
export function dayLabel(start: number, tz: number): string {
  return new Date(start - tz * 60_000).toISOString().slice(0, 10);
}

/** Today and the days before it; all time starts on the day of the first work (`since`), or today. */
export function windowOf(range: RangeName, tz: number, nowMs: number, since: string | null): Window {
  const to = dayStart(nowMs, tz) + DAY;
  if (range === 'all') {
    const first = since ? Date.parse(since) : nowMs;
    return { range, tz, from: dayStart(Math.min(first, nowMs), tz), to, previous: null };
  }
  const length = LENGTH[range] * DAY;
  const from = to - length;
  return { range, tz, from, to, previous: { from: from - length, to: from } };
}

/** The start of every local day in the window, oldest first. */
export function daysOf(w: Window): number[] {
  const days: number[] = [];
  for (let d = w.from; d < w.to; d += DAY) days.push(d);
  return days;
}
