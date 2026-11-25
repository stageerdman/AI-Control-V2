/* Where the tokens go (pure, read-only): an office's spans in a window → what the sheet's token view adds to
   the tally — cost per agent, how many sessions started clean or picked up old work, and how much went to
   getting ready (each session's first step). Totals, per-agent tokens and trends already live in tally.ts. */
import { type Span, spanTokens } from './spans.ts';

export type TokenUse = {
  /** About what each agent's runs would cost at API prices (USD); crew calls carry no price. */
  usd: Record<string, number>;
  /** Sessions that started with a clean slate (new runs, crew calls). */
  fresh: number;
  /** Runs that carried an earlier session on (rework, carry-on, a chat thread), and their tokens. */
  pickedUp: number;
  pickedUpTokens: number;
  /** Tokens of the first step of each session (rules, tools, brief); null = not measured yet. */
  ready: number | null;
  /** All tokens of the spans whose first step was measured: `ready`'s whole, for a fair share. */
  readyOf: number;
};

export function tokenUse(spans: readonly Span[], w: { from: number; to: number }): TokenUse {
  const out: TokenUse = { usd: {}, fresh: 0, pickedUp: 0, pickedUpTokens: 0, ready: null, readyOf: 0 };
  for (const s of spans) {
    const at = Date.parse(s.start);
    if (!(at >= w.from && at < w.to)) continue;
    if (s.costUsd) out.usd[s.agentId] = (out.usd[s.agentId] ?? 0) + s.costUsd;
    if (s.resumed) {
      out.pickedUp++;
      out.pickedUpTokens += spanTokens(s);
    } else out.fresh++;
    if (s.firstContext != null && s.tokens) {
      out.ready = (out.ready ?? 0) + s.firstContext;
      out.readyOf += spanTokens(s);
    }
  }
  return out;
}
