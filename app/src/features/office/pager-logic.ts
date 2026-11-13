/* The pager's logic, pure (tested) — prototype office-pager.js + data-office wsPagerOffices (v6):
   one page per OFFICE that needs you (never teams or desks), the office you're standing in never
   pages you, and an office you visited and left without answering drops off until a NEW ask
   arrives there. The "seen" half lives on the server (POST /asks/seen on leaving, GET /asks?unseen=true). */

import type { ChecklistItem, Goal } from '../../api';
import type { Route } from '../../shell/router';
import type { StudioAsk } from './api';

export type PagerEntry = { projectId: string; projectName: string; asks: StudioAsk[] };

/** Open, unseen asks grouped per office (oldest ask first), minus the office you're in. */
export function pagerEntries(asks: StudioAsk[], here: string | null): PagerEntry[] {
  const out: PagerEntry[] = [];
  for (const a of asks) {
    if (a.status !== 'open' || a.seen || a.projectId === here) continue;
    let e = out.find((x) => x.projectId === a.projectId);
    if (!e) {
      e = { projectId: a.projectId, projectName: a.projectName, asks: [] };
      out.push(e);
    }
    e.asks.push(a);
  }
  return out;
}

const shortName = (name: string) => name.replace(/^(Sir|Dr\.?|The)\s+/i, '').split(/\s+/)[0] || name;
/** One calm line per office. */
export function pagerLine(e: PagerEntry): string {
  if (e.asks.length > 1) return `${e.asks.length} need you`;
  return `${shortName(e.asks[0]?.agentName || 'Someone')} needs you`;
}

export const askKey = (a: Pick<StudioAsk, 'projectId' | 'id'>) => `${a.projectId}:${a.id}`;
/** The first office with an ask we haven't shown before (−1 = nothing new): the pager turns there. */
export function freshIndex(entries: PagerEntry[], shown: ReadonlySet<string>): number {
  return entries.findIndex((e) => e.asks.some((a) => !shown.has(askKey(a))));
}

/** The office the user is in (null outside offices). */
export const officeOf = (r: Route): string | null => (r.name === 'office' ? r.projectId : null);
/** Leaving an office (to anywhere else, incl. another office) → the office you left. */
export function leftOffice(prev: Route | null, next: Route): string | null {
  const a = prev ? officeOf(prev) : null;
  return a && a !== officeOf(next) ? a : null;
}
/** Hidden in the setup space and while zoomed into a board (it steps aside). */
export const pagerHidden = (r: Route): boolean =>
  r.name === 'new' || (r.name === 'office' && r.sub !== 'room');

/* ---- work that stopped for you: a reviewer sent it back past the limit (no ask on the server) ---- */
const RECENT_MS = 3 * 24 * 3600 * 1000;
/** A failed item whose last review asked for changes = it was sent back past the limit and needs you. */
export const stoppedForYou = (i: ChecklistItem): boolean =>
  i.status === 'failed' && (i.sendBacks ?? 0) > 0 && i.reviews?.at(-1)?.verdict === 'changes';

/** Pager pages for work that stopped for you (recent, not seen yet), shaped like asks. */
export function stoppedAsks(
  work: { projectId: string; projectName: string; goals: Goal[] }[],
  seen: ReadonlySet<string>,
  nameOf: (agentId: string) => string,
  now = Date.now(),
): StudioAsk[] {
  const out: StudioAsk[] = [];
  for (const w of work)
    for (const g of w.goals)
      for (const i of g.items.flatMap((x) => [x, ...(x.subtasks ?? [])])) {
        const id = `stopped:${i.id}`;
        if (!stoppedForYou(i) || seen.has(id) || now - Date.parse(i.updatedAt) > RECENT_MS) continue;
        const reviewer = i.reviews?.at(-1)?.reviewer ?? i.agentId;
        out.push({
          id,
          projectId: w.projectId,
          projectName: w.projectName,
          agentId: reviewer,
          agentName: nameOf(reviewer),
          runId: i.runId ?? '',
          question: `sent “${i.text}” back ${i.sendBacks}× — your call`,
          options: null,
          status: 'open',
          since: i.updatedAt,
          seen: false,
        });
      }
  return out;
}
