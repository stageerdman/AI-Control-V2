/* Agent performance for one office: read its spans, pick the window, tally (the sheet's one request), plus
   where the tokens went (tokens.ts) for the sheet's token view. */
import type { Db } from '../db/connection.ts';
import { firstStart, readSpans } from './spans.ts';
import { type Performance, tally } from './tally.ts';
import { type TokenUse, tokenUse } from './tokens.ts';
import { type RangeName, windowOf } from './window.ts';

export function performanceOf(
  db: Db,
  projectId: string,
  q: { range: RangeName; tz: number },
  at: Date = new Date(),
): Performance & { tokenUse: TokenUse } {
  const spans = readSpans(db, projectId);
  const nowMs = at.getTime();
  const w = windowOf(q.range, q.tz, nowMs, firstStart(spans));
  return { ...tally(spans, w, nowMs), tokenUse: tokenUse(spans, w) };
}
