/* Readings + now → how much is left, how fast it goes, when it runs out and when it resets (pure).
   Per window, only the readings of its current period (same resetsAt) count. Burn rate: the slope over the last
   hour of readings when it rose at least 2 points (utilization comes in 1% steps — a shorter rise is noise), else
   the average since the window opened. The line shows the binding window: limited first, then the one that runs
   out soonest, else the fullest. */
import type { StoredReading } from './store.ts';

const HOUR = 3_600_000;
/** Plan windows by name; anything else (overage, a new name) is listed but never binds. */
const LENGTH_MS: Record<string, number> = {
  five_hour: 5 * HOUR,
  seven_day: 7 * 24 * HOUR,
  seven_day_opus: 7 * 24 * HOUR,
  seven_day_sonnet: 7 * 24 * HOUR,
};
const SLOPE_SPAN_MS = HOUR;
const MIN_RISE = 0.02;
/** Past this the reading's age is worth saying out loud. */
export const STALE_MS = 15 * 60_000;

/** limited: blocked until reset; hits: runs out before reset at this pace; lasts: reaches reset first;
    fresh: the window reset since its last reading (nothing known about the new one yet). */
export type Verdict = 'limited' | 'hits' | 'lasts' | 'fresh';
export type WindowForecast = {
  name: string;
  used: number;
  left: number;
  /** null once fresh: the new period's reset comes with its first reading. */
  resetsAt: string | null;
  /** When the current period opened; null once fresh or for a window of unknown length. */
  opensAt: string | null;
  /** Share of the window per hour (0.1 = 10 points an hour); null when unknown. */
  ratePerHour: number | null;
  hitsAt: string | null;
  verdict: Verdict;
  readingAgeMs: number;
};
export type CreditsState = 'none' | 'ok' | 'warning' | 'limited' | 'stale';
export type Forecast = {
  state: CreditsState;
  /** The window the line shows; null with no readings. */
  binding: string | null;
  windows: WindowForecast[];
  /** Age of the newest reading of any window; null with none. */
  readingAgeMs: number | null;
  at: string;
};

const ms = (iso: string) => Date.parse(iso);

/** Share per ms: the last hour's slope if it rose enough, else the average since the window opened. */
export function burnRate(period: readonly StoredReading[], lengthMs: number | undefined): number | null {
  const last = period.at(-1);
  if (!last) return null;
  const recent = period.filter((r) => ms(r.at) >= ms(last.at) - SLOPE_SPAN_MS);
  const first = recent[0] as StoredReading;
  const dt = ms(last.at) - ms(first.at);
  if (recent.length >= 2 && dt > 0 && last.used - first.used >= MIN_RISE)
    return (last.used - first.used) / dt;
  if (lengthMs === undefined) return null;
  const sinceOpen = ms(last.at) - (ms(last.resetsAt) - lengthMs);
  return sinceOpen > 0 ? last.used / sinceOpen : null;
}

function verdictOf(last: StoredReading, hitsAt: number | null, resetsAt: number): Verdict {
  if ((last.status === 'rejected' && !last.overage) || last.used >= 1) return 'limited';
  return hitsAt !== null && hitsAt < resetsAt ? 'hits' : 'lasts';
}

/** One window from its readings (oldest first). */
export function windowForecast(
  name: string,
  readings: readonly StoredReading[],
  now: number,
): WindowForecast {
  const last = readings.at(-1) as StoredReading;
  const readingAgeMs = Math.max(0, now - ms(last.at));
  const resetsAt = ms(last.resetsAt);
  if (resetsAt <= now)
    return {
      name,
      used: 0,
      left: 1,
      resetsAt: null,
      opensAt: null,
      ratePerHour: null,
      hitsAt: null,
      verdict: 'fresh',
      readingAgeMs,
    };
  const period = readings.filter((r) => r.resetsAt === last.resetsAt);
  const length = LENGTH_MS[name];
  const rate = burnRate(period, length);
  /* rounded: 1 − 0.85 is 0.15000000000000002 in floats, and exactly 15% left must warn */
  const left = Math.max(0, Math.round((1 - last.used) * 1e6) / 1e6);
  const hitsAt = rate && rate > 0 ? now + left / rate : null;
  const verdict = verdictOf(last, hitsAt, resetsAt);
  return {
    name,
    used: last.used,
    left: verdict === 'limited' ? 0 : left,
    resetsAt: last.resetsAt,
    opensAt: length === undefined ? null : new Date(resetsAt - length).toISOString(),
    ratePerHour: rate === null ? null : rate * HOUR,
    hitsAt: verdict === 'hits' && hitsAt !== null ? new Date(hitsAt).toISOString() : null,
    verdict,
    readingAgeMs,
  };
}

const RANK: Record<Verdict, number> = { limited: 0, hits: 1, lasts: 2, fresh: 3 };
/** Limited first, then soonest to run out, then fullest. */
function bindingOf(windows: readonly WindowForecast[]): WindowForecast | null {
  const plan = windows.filter((w) => w.name in LENGTH_MS);
  return (
    [...plan].sort(
      (a, b) =>
        RANK[a.verdict] - RANK[b.verdict] ||
        (a.hitsAt && b.hitsAt ? ms(a.hitsAt) - ms(b.hitsAt) : 0) ||
        b.used - a.used,
    )[0] ?? null
  );
}

/** At or below this share left the line warns, whatever the pace (design/credits-line.md). */
export const LOW_LEFT = 0.15;

/** Limited beats everything; a warning beats an old reading (the age is shown anyway). */
function stateOf(binding: WindowForecast | null, warned: boolean, ageMs: number): CreditsState {
  if (!binding) return 'none';
  if (binding.verdict === 'limited') return 'limited';
  if (binding.verdict === 'hits' || binding.left <= LOW_LEFT || warned) return 'warning';
  return ageMs > STALE_MS ? 'stale' : 'ok';
}

export function forecast(readings: readonly StoredReading[], now: number): Forecast {
  const byWindow = new Map<string, StoredReading[]>();
  for (const r of readings) byWindow.set(r.window, [...(byWindow.get(r.window) ?? []), r]);
  const windows = [...byWindow].map(([name, rs]) => windowForecast(name, rs, now));
  const binding = bindingOf(windows);
  const newest = readings.reduce((m, r) => Math.max(m, ms(r.at)), Number.NEGATIVE_INFINITY);
  const readingAgeMs = Number.isFinite(newest) ? Math.max(0, now - newest) : null;
  const warned =
    binding?.verdict !== 'fresh' && byWindow.get(binding?.name ?? '')?.at(-1)?.status === 'allowed_warning';
  return {
    state: stateOf(binding, warned, readingAgeMs ?? 0),
    binding: binding?.name ?? null,
    windows,
    readingAgeMs,
    at: new Date(now).toISOString(),
  };
}
