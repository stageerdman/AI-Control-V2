/* A review loop that can't pass (pure rules; src/crew/dispatch.ts applies them).
   A reviewer who sends the same note back a second time to the same builder is telling us the rework didn't
   reach the problem — the fix lies outside the builder's reach (a tool, access, a file they can't touch).
   A third round would only repeat it, so the item goes back to the orchestrator with both notes instead.
   Different notes are progress — unless the builder adds no commit between them: two such empty tries in a row
   also send the item back to the orchestrator. Otherwise the loop goes on (still bounded by maxSendBacks). */
import type { ChecklistItem, ItemReview } from '../db/work.ts';
import type { ItemGate } from '../domain/workflows.ts';

/** How alike two notes must be (shared words over all words) to count as the same note. */
const SAME_ENOUGH = 0.8;

const words = (note: string): Set<string> =>
  new Set(
    note
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean),
  );

/** The same note, or nearly: reworded punctuation, case or a word or two don't make it a new one. */
export function sameNote(a: string, b: string): boolean {
  const [x, y] = [words(a), words(b)];
  if (!x.size || !y.size) return x.size === y.size;
  const shared = [...x].filter((w) => y.has(w)).length;
  return shared / (x.size + y.size - shared) >= SAME_ENOUGH;
}

/** This gate's last send-back to the current builder, when `notes` repeats it → that earlier note, else null.
    Only send-backs since the builder took the item count (a handover resets sendBacks, not the review history). */
export function repeatedNote(
  it: Pick<ChecklistItem, 'sendBacks' | 'reviews'>,
  gate: Pick<ItemGate, 'kind' | 'reviewer'>,
  notes: string,
): string | null {
  if (it.sendBacks < 1) return null;
  const last = it.reviews.findLast((r: ItemReview) => r.gate === gate.kind && r.reviewer === gate.reviewer);
  return last?.verdict === 'changes' && sameNote(last.notes, notes) ? last.notes : null;
}

/** Send-backs in a row, up to the latest, that found the branch where the one before left it: the rework added
    no commit (Sea GPS: "HEAD is 1bb2479 with no new commits", sent back five times). Only the current builder's
    send-backs count (`sendBacks`, the latest included); reviews without a head never match. */
export function emptyTries(reviews: readonly ItemReview[], sendBacks: number): number {
  if (sendBacks < 2) return 0;
  const heads = reviews
    .filter((r) => r.verdict === 'changes')
    .slice(-sendBacks)
    .map((r) => r.head ?? null);
  let n = 0;
  for (let i = heads.length - 1; i > 0 && heads[i] && heads[i] === heads[i - 1]; i--) n++;
  return n;
}
/** This many empty tries stop the loop: the item goes back to the orchestrator. */
export const MAX_EMPTY_TRIES = 2;

/** The item's note when empty tries stop the loop. */
export const emptyTriesText = (reviewer: string, builder: string, tries: number, last: string): string =>
  `${reviewer} sent ${builder}'s work back again, and the last ${tries} reworks added no new commits on the branch — retrying won't help; it needs a new plan, a fresh restart or another owner. Last notes: ${last}`;

/** The item's note when the loop stops: what the orchestrator reads on the whiteboard, with both notes. */
export const repeatedNoteText = (reviewer: string, builder: string, first: string, second: string): string =>
  `${reviewer} sent ${builder}'s work back twice with the same note — likely outside ${builder}'s reach (a tool, access or files they can't touch). First: ${first} Second: ${second}`;
