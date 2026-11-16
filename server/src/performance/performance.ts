/* Agent performance for one office: read its spans, pick the window, tally (the sheet's one request). */
import type { Db } from '../db/connection.ts';
import { firstStart, readSpans } from './spans.ts';
import { type Performance, tally } from './tally.ts';
import { type RangeName, windowOf } from './window.ts';

export function performanceOf(
  db: Db,
  projectId: string,
  q: { range: RangeName; tz: number },
  at: Date = new Date(),
): Performance {
  const spans = readSpans(db, projectId);
  const nowMs = at.getTime();
  return tally(spans, windowOf(q.range, q.tz, nowMs, firstStart(spans)), nowMs);
}
