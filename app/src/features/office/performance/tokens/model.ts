/* Where the tokens go (pure): the performance read → the few lines the token view says. It only adds what the
   sheet doesn't already show — cost, working vs getting ready, fresh starts, tokens per hour of work. Totals,
   per-agent tokens and the per-day chart stay where they are. Design: design/token-view.md. Plain words only. */
import type { Performance } from '../../api';
import { type Trend, tokensText, trend } from '../model';

export type TokenLines = {
  /** Who used most: "Most of the studio's tokens went to Rivet (65%, about $3) and Blair (32%, under $1)." */
  lead: string;
  /** "About $5 in all, at API prices." null = no price known. */
  cost: string | null;
  /** Working vs getting ready; working = null while not measured. */
  ready: { working: number | null; text: string };
  /** "12 fresh starts · 2 picked up old work"; null = an older server that doesn't count them. */
  starts: { text: string } | null;
  /** Tokens per hour of agent time, and how it moved: the fair "is it getting better?". */
  perHour: { text: string; trend: Trend | null } | null;
  /** One small line under it all that says what the new words mean; null = nothing to explain. */
  hint: string | null;
};
export type TokenView = { state: 'empty'; text: string } | ({ state: 'normal' } & TokenLines);

export const EMPTY = 'Nothing measured yet. This fills in after the next run.';
export const READY_HINT = 'Getting ready is reading the rules and the task when a session starts.';
export const NOT_MEASURED = 'Getting ready isn’t measured yet.';
export const PICKED_UP_HINT =
  'Picking up old work brings the whole earlier session back, so it costs more than a fresh start.';

const H = 3_600_000;
const pct = (x: number) => Math.round(100 * x);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "about $381" · "about $3" · "under $1" */
export function money(usd: number): string {
  return usd < 1 ? 'under $1' : `about $${Math.round(usd)}`;
}

/** "Rivet and Blair" · "Rivet, Blair and Quill" */
const and = (xs: string[]) =>
  xs.length < 2 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`;

/** The few agents that used most (until three quarters are covered, three at most), biggest first. */
export function topAgents(p: Performance): { agentId: string; share: number }[] {
  const total = p.totals.tokens;
  const ranked = p.agents.filter((a) => a.tokens > 0).sort((x, y) => y.tokens - x.tokens);
  const out: { agentId: string; share: number }[] = [];
  let covered = 0;
  for (const a of ranked) {
    if (out.length === 3 || (out.length && covered >= 0.75)) break;
    out.push({ agentId: a.agentId, share: a.tokens / total });
    covered += a.tokens / total;
  }
  return out;
}

export function tokenView(p: Performance, nameOf: (id: string) => string): TokenView {
  const total = p.totals.tokens;
  if (total <= 0) return { state: 'empty', text: EMPTY };
  const u = p.tokenUse;

  const top = topAgents(p);
  const part = (t: { agentId: string; share: number }) => {
    const usd = u?.usd[t.agentId];
    return `${nameOf(t.agentId)} (${pct(t.share)}%${usd ? `, ${money(usd)}` : ''})`;
  };
  const lead =
    top.length === 1 && (top[0]?.share ?? 0) >= 0.9
      ? `Almost all of the studio’s tokens went to ${part(top[0] as (typeof top)[number])}.`
      : `Most of the studio’s tokens went to ${and(top.map(part))}.`;

  const usdAll = u ? Object.values(u.usd).reduce((s, x) => s + x, 0) : 0;
  const cost =
    usdAll > 0 ? `${money(usdAll).replace(/^./, (c) => c.toUpperCase())} in all, at API prices.` : null;

  const working = u && u.ready != null && u.readyOf > 0 ? 100 - pct(u.ready / u.readyOf) : null;
  const ready = {
    working,
    text: working == null ? NOT_MEASURED : `${working}% working · ${100 - working}% getting ready`,
  };

  const starts = u
    ? {
        text: [
          plural(u.fresh, 'fresh start'),
          u.pickedUp
            ? `${u.pickedUp} picked up old work (${pct(u.pickedUpTokens / total)}% of the tokens)`
            : 'none picked up old work',
        ].join(' · '),
      }
    : null;
  const hints = [working != null && READY_HINT, u?.pickedUp && PICKED_UP_HINT].filter(Boolean);

  const rate = (m: { ms: number; tokens: number } | null | undefined) =>
    m && m.ms > 0 ? (m.tokens * H) / m.ms : null;
  const now = rate(p.totals);
  const before = rate(p.previous);
  const perHour =
    now == null
      ? null
      : {
          text: `${tokensText(now)} per hour of work`,
          trend: before == null ? null : trend('tokens', Math.round(now), Math.round(before), p.range),
        };

  return { state: 'normal', lead, cost, ready, starts, perHour, hint: hints.length ? hints.join(' ') : null };
}
