/* AI Credits Tracker, the line's words and looks (design/credits-line.md). Pure: the server's forecast
   (server/src/credits/forecast.ts, GET /credits/events) + now → everything the line, chip and card show.
   Every sentence the user reads comes from here and nowhere else. */

export type Verdict = 'limited' | 'hits' | 'lasts' | 'fresh';
export type WindowForecast = {
  name: string;
  used: number;
  left: number;
  resetsAt: string | null;
  opensAt: string | null;
  ratePerHour: number | null;
  hitsAt: string | null;
  verdict: Verdict;
  readingAgeMs: number;
};
export type Forecast = {
  state: 'none' | 'ok' | 'warning' | 'limited' | 'stale';
  binding: string | null;
  windows: WindowForecast[];
  readingAgeMs: number | null;
  /** When the server worked it out; ages are counted on from here. */
  at: string;
};

/** The server's states plus `fresh` (the binding window reset, no reading of the new one yet). */
export type LineState = 'none' | 'ok' | 'warning' | 'limited' | 'stale' | 'fresh';
export type LineView = {
  state: LineState;
  /** Whole % left of the binding window, as shown (never 100 while anything is used). */
  leftPct: number;
  /** Fill width, 0–1. */
  fill: number;
  fillTone: 'rainbow' | 'warm' | 'none';
  thick: boolean;
  dim: boolean;
  /** Phase 5 (estimated) only; always false until then. */
  dashed: boolean;
  chip: string | null;
  aria: string;
  /** Said once, politely, on entering warning or limited; `key` tells one episode from the next. */
  announce: { key: string; text: string } | null;
  card: {
    title: string;
    window: string | null;
    rate: string | null;
    verdict: string;
    other: string | null;
    age: string | null;
    estimated: boolean;
  };
};

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const ms = (iso: string) => Date.parse(iso);

const WINDOW_NAMES: Record<string, string> = {
  five_hour: '5-hour',
  seven_day: 'Weekly',
  seven_day_opus: 'Opus weekly',
  seven_day_sonnet: 'Sonnet weekly',
};
export const windowName = (name: string): string => WINDOW_NAMES[name] ?? name.replace(/_/g, ' ');

/** Whole % left: never below 0, never 100 while anything is used. */
export function percentLeft(w: Pick<WindowForecast, 'used' | 'left'>): number {
  const pct = Math.max(0, Math.min(100, Math.round(w.left * 100)));
  return pct === 100 && w.used > 0 ? 99 : pct;
}

/** "~40 min", "~2 h 10 min", "~2 days" (the `~` left to the caller). */
export function duration(spanMs: number): string {
  const m = Math.max(1, Math.round(spanMs / MIN));
  if (m < 60) return `${m} min`;
  if (spanMs >= DAY) {
    const d = Math.round(spanMs / DAY);
    return `${d} ${d === 1 ? 'day' : 'days'}`;
  }
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}

/** The same span read aloud: "1 hour 28 minutes", "40 minutes", "2 days". */
export const spokenDuration = (spanMs: number): string =>
  duration(spanMs)
    .replace(/(\d+) h\b/, (_, n: string) => `${n} ${n === '1' ? 'hour' : 'hours'}`)
    .replace(/(\d+) min\b/, (_, n: string) => `${n} ${n === '1' ? 'minute' : 'minutes'}`);

export type Clock = { locale?: string; timeZone?: string };

const dayKey = (t: number, c: Clock) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: c.timeZone, dateStyle: 'short' }).format(t);

/** "4:30 pm" today, "Sat 9 am" on another day, in the user's locale and zone. */
export function clockTime(t: number, now: number, c: Clock = {}): string {
  const onHour = new Intl.DateTimeFormat('en', { timeZone: c.timeZone, minute: 'numeric' }).format(t) === '0';
  const time = new Intl.DateTimeFormat(c.locale, {
    timeZone: c.timeZone,
    hour: 'numeric',
    ...(onHour ? {} : { minute: '2-digit' }),
  })
    .format(t)
    .replace(/[  ]/g, ' ')
    .replace(/\b([AP])\.?M\.?/g, (_, p: string) => `${p.toLowerCase()}m`);
  if (dayKey(t, c) === dayKey(now, c)) return time;
  const day = new Intl.DateTimeFormat(c.locale, { timeZone: c.timeZone, weekday: 'short' }).format(t);
  return `${day} ${time}`;
}

function age(readingAgeMs: number): string | null {
  if (readingAgeMs <= 2 * MIN) return null;
  if (readingAgeMs < HOUR) return `Updated ${Math.floor(readingAgeMs / MIN)} min ago`;
  if (readingAgeMs < DAY) return `Updated ${Math.floor(readingAgeMs / HOUR)} h ago`;
  const d = Math.floor(readingAgeMs / DAY);
  return `Updated ${d} ${d === 1 ? 'day' : 'days'} ago`;
}

function rate(perHour: number | null): string | null {
  if (perHour === null) return null;
  const pts = perHour * 100;
  return pts < 1 ? 'Using under 1% an hour' : `Using about ${Math.round(pts)}% an hour`;
}

/** The second row: the weekly window under a 5-hour line, the 5-hour one under any weekly line. */
function otherWindow(f: Forecast, binding: WindowForecast, now: number, c: Clock): string | null {
  const name = binding.name === 'five_hour' ? 'seven_day' : 'five_hour';
  const w = f.windows.find((x) => x.name === name);
  if (!w) return null;
  const label = windowName(w.name);
  if (w.verdict === 'fresh' || !w.resetsAt) return `${label} · fresh window`;
  const back = clockTime(ms(w.resetsAt), now, c);
  if (w.verdict === 'limited') return `${label} · limit reached · back ${back}`;
  return `${label} · ${percentLeft(w)}% left · resets ${back}`;
}

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

const NONE: LineView = {
  state: 'none',
  leftPct: 0,
  fill: 0,
  fillTone: 'none',
  thick: false,
  dim: false,
  dashed: false,
  chip: null,
  aria: 'AI credits: no reading yet. Usage appears after the first run.',
  announce: null,
  card: {
    title: 'No reading yet',
    window: null,
    rate: null,
    verdict: 'Usage appears after the first run.',
    other: null,
    age: null,
    estimated: false,
  },
};

/** The forecast as the line shows it at `now` (ms). */
export function view(f: Forecast | null, now: number, c: Clock = {}): LineView {
  const binding = f?.windows.find((w) => w.name === f.binding);
  if (!f || f.state === 'none' || !binding) return NONE;
  const at = (iso: string) => clockTime(ms(iso), now, c);
  const ageMs = binding.readingAgeMs + Math.max(0, now - ms(f.at));
  const leftPct = percentLeft(binding);
  const base = {
    leftPct,
    dashed: false,
    other: otherWindow(f, binding, now, c),
    age: age(ageMs),
    window: windowName(binding.name),
  };
  const episode = `${binding.name}@${binding.resetsAt}`;

  if (binding.verdict === 'fresh') {
    const verdict = 'Fresh window. The next run brings a reading.';
    return {
      ...pick(base),
      state: 'fresh',
      leftPct: 100,
      fill: 1,
      fillTone: 'rainbow',
      thick: false,
      dim: true,
      chip: null,
      aria: `AI credits: ${lower(verdict)}`,
      announce: null,
      card: { ...card(base), title: '100% left', rate: null, verdict },
    };
  }

  const resets = binding.resetsAt as string;
  if (f.state === 'limited' || binding.verdict === 'limited') {
    const back = at(resets);
    const verdict = `Limit reached. Back at ${back} (in ${duration(ms(resets) - now)})`;
    return {
      ...pick(base),
      state: 'limited',
      leftPct: 0,
      fill: 0,
      fillTone: 'none',
      thick: true,
      dim: false,
      chip: `Limit reached · back at ${back}`,
      aria: `AI credits: limit reached, back at ${back}`,
      announce: { key: `limited:${episode}`, text: `AI credits: limit reached. Back at ${back}.` },
      card: { ...card(base), title: '0% left', rate: null, verdict },
    };
  }

  const title = `${leftPct}% left`;
  const hits = binding.verdict === 'hits' && binding.hitsAt ? ms(binding.hitsAt) : null;
  const verdict =
    hits !== null
      ? `Runs out in ~${duration(hits - now)} (≈ ${at(binding.hitsAt as string)}) · resets ${at(resets)}`
      : `Lasts until it resets at ${at(resets)}`;
  const warning = f.state === 'warning';
  const chip = !warning
    ? null
    : hits !== null
      ? `runs out ≈ ${at(binding.hitsAt as string)}`
      : `${leftPct}% left · resets ${at(resets)}`;
  const announce = !warning
    ? null
    : {
        key: `warning:${episode}`,
        text:
          hits !== null
            ? `AI credits low: runs out in about ${spokenDuration(hits - now)}.`
            : `AI credits low: ${leftPct}% left.`,
      };
  return {
    ...pick(base),
    state: warning ? 'warning' : f.state === 'stale' ? 'stale' : 'ok',
    fill: Math.max(0, Math.min(1, binding.left)),
    fillTone: warning ? 'warm' : 'rainbow',
    thick: warning,
    dim: f.state === 'stale',
    chip,
    aria:
      hits !== null
        ? `AI credits: ${title}, runs out in about ${spokenDuration(hits - now)}, at ${at(binding.hitsAt as string)}; resets at ${at(resets)}`
        : `AI credits: ${title}, ${lower(verdict)}`,
    announce,
    card: { ...card(base), title, rate: rate(binding.ratePerHour), verdict },
  };
}

type Base = { leftPct: number; dashed: boolean; other: string | null; age: string | null; window: string };
const pick = (b: Base) => ({ leftPct: b.leftPct, dashed: b.dashed });
const card = (b: Base) => ({ window: b.window, other: b.other, age: b.age, estimated: false });
