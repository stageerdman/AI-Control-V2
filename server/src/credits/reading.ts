/* The plan's usage, as Anthropic's own limiter reports it: Claude Code's `rate_limit_event` stream line (pure).
   The event is undocumented, so every field is optional: a fraction or a percent, epoch seconds or milliseconds;
   anything unrecognised is dropped. A shape we can't read gives no reading — never a wrong number.
   See updates/2026-11-24 AI CREDITS TRACKER - OPEN/update v1.md. */

export type WindowReading = {
  /** five_hour, seven_day, seven_day_opus… as the CLI names it. */
  name: string;
  /** Share of the window used, 0–1. */
  used: number;
  resetsAt: string;
  /** allowed, allowed_warning, rejected (or a new value, kept as given). */
  status: string | null;
};
export type LimitReading = {
  at: string;
  windows: WindowReading[];
  /** Paying past the plan (extra usage): a `rejected` window then doesn't stop work. */
  overage: boolean;
};

type Raw = Record<string, unknown>;
const isObject = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);

/** 0–1 from a fraction or a percent; null when it isn't a usable number. */
function fraction(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return null;
  const f = v > 1 ? v / 100 : v;
  return f > 1 ? null : f;
}

/** ISO time from epoch seconds or milliseconds (or an ISO string); null otherwise. */
function instant(v: unknown): string | null {
  const ms =
    typeof v === 'number' && Number.isFinite(v) && v > 0
      ? v < 1e12
        ? v * 1000
        : v
      : typeof v === 'string'
        ? Date.parse(v)
        : Number.NaN;
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function windowOf(name: string, w: unknown): WindowReading | null {
  if (!isObject(w)) return null;
  const used = fraction(w.utilization);
  const resetsAt = instant(w.resetsAt);
  if (used === null || resetsAt === null) return null;
  return { name, used, resetsAt, status: typeof w.status === 'string' ? w.status : null };
}

/** One stream line → the reading it carries, or null (not a limit line, or nothing we can trust in it). */
export function parseRateLimit(line: string, at: Date): LimitReading | null {
  if (!line.includes('rate_limit_event')) return null; // every stream line passes here: skip the parse
  let m: unknown;
  try {
    m = JSON.parse(line);
  } catch {
    return null;
  }
  if (!isObject(m) || m.type !== 'rate_limit_event' || !isObject(m.rate_limit_info)) return null;
  const info = m.rate_limit_info;
  const unified = isObject(info.unifiedWindows) ? info.unifiedWindows : {};
  const windows = Object.entries(unified)
    .map(([name, w]) => windowOf(name, w))
    .filter((w): w is WindowReading => w !== null);
  if (!windows.length) return null;
  return { at: at.toISOString(), windows, overage: info.isUsingOverage === true };
}
