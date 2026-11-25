/* Rebuild cards as the chat saved them (thread_messages.rebuild): how each one ended. Plans live in memory
   (rebuild-service.ts), so without this a card the user answered — or one whose plan ran out — came back as
   open after every restart and blocked "New chat". A card closes as applied, kept (the user dismissed it) or
   expired (its plan is out of date, already holds, timed out or was lost to a restart); an expired card waits
   with `told: false` until the director hears about it on its next turn. */
import type { Db } from '../db/connection.ts';
import { rows } from '../db/util.ts';
import { summaryOf } from './rebuild.ts';
import type { Offer } from './rebuild-service.ts';

export type CardEnd = 'applied' | 'kept' | 'expired';
type Saved = { id: string; offer: Offer };

/** Still waiting for the user's yes or no. */
export const isWaiting = (o: Offer) => o.needsConfirm && !o.undoToken && !o.closed;

export function rebuildCards(db: Db) {
  const select = (where: string, ...args: string[]): Saved[] =>
    rows<{ id: string; rebuild: string }>(
      db
        .prepare(`SELECT id, rebuild FROM thread_messages WHERE rebuild IS NOT NULL AND ${where}`)
        .all(...args),
    ).map((r) => ({ id: r.id, offer: JSON.parse(r.rebuild) as Offer }));
  const save = ({ id, offer }: Saved) =>
    db.prepare('UPDATE thread_messages SET rebuild = ? WHERE id = ?').run(JSON.stringify(offer), id);
  const end = (s: Saved, closed: CardEnd, why: { reason?: string; summary?: string }): Saved => ({
    id: s.id,
    offer: { ...s.offer, closed, ...why, ...(closed === 'expired' ? { told: false } : {}) },
  });

  /** Close this plan's card if it still waits. */
  function close(planId: string, closed: CardEnd, why: { reason?: string; summary?: string } = {}) {
    for (const s of select("json_extract(rebuild, '$.planId') = ?", planId))
      if (isWaiting(s.offer)) save(end(s, closed, why));
  }

  /** Expire every waiting card (of one project, or all) whose plan isn't `live`. */
  function expireWaiting(reason: string, live: (planId: string) => boolean, projectId?: string) {
    const found = projectId ? select('project_id = ?', projectId) : select('1 = 1');
    for (const s of found)
      if (isWaiting(s.offer) && !live(s.offer.planId)) save(end(s, 'expired', { reason }));
  }

  /** The expired cards of a project the director hasn't heard about: one note for its turn (marks them told). */
  function untoldNote(projectId: string): string | null {
    const untold = select('project_id = ?', projectId).filter(
      (s) => s.offer.closed === 'expired' && s.offer.told === false,
    );
    if (!untold.length) return null;
    for (const s of untold) save({ id: s.id, offer: { ...s.offer, told: true } });
    const lines = untold.map(
      (s) =>
        `- ${summaryOf(s.offer.card).replace(/^Done\s*[—-]\s*/, '')} (${s.offer.reason ?? 'it ran out'})`,
    );
    return [
      'Your earlier rebuild card(s) ran out without being applied — nothing changed from them, and the card is closed:',
      ...lines,
      'Trust the summary’s people for who is on the project now. Only call rebuild_teams again if the change is still wanted and not already true.',
    ].join('\n');
  }

  return { close, expireWaiting, untoldNote };
}
export type RebuildCards = ReturnType<typeof rebuildCards>;
