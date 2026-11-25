/* The brief for work that comes back to its builder in a fresh session: what to do now, what was done before
   (commits, diff stat, its last words and desk note) and the original brief, instead of the old transcript. */
import type { Db } from '../db/connection.ts';
import type { DeskNoteBody } from '../office/desk.ts';

export type Handoff = {
  /** What to do now (the reviewer's findings, the merge to fix…). */
  ask: string;
  /** The item's brief as it was first given. */
  original: string;
  /** `git log --oneline` + `git diff --stat` of the work so far; null = none or no checkout. */
  work: string | null;
  /** The builder's final words last time. */
  lastWords: string | null;
  note: DeskNoteBody | null;
};

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function handoffBrief(h: Handoff): string {
  const note = h.note
    ? [
        'Your last desk note:',
        `Where I was: ${h.note.where}`,
        `What I was doing: ${h.note.doing}`,
        `Next step: ${h.note.next}`,
        ...(h.note.notes ? [`Notes: ${h.note.notes}`] : []),
      ].join('\n')
    : '';
  return [
    h.ask,
    'You start this round with a fresh memory: your earlier session is not reloaded, to save context. What you did before is below and in the checkout — check the files and `git log` rather than redoing the work.',
    h.work ? `Your work so far:\n${h.work}` : '',
    h.lastWords ? `Your summary last time: ${clip(h.lastWords, 1500)}` : '',
    note,
    `Your original brief, for reference:\n${h.original}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

/** A run's final words and the last desk note it left (null when it left none). */
export function lastWordsOf(db: Db, runId: string): Pick<Handoff, 'lastWords' | 'note'> {
  const run = db.prepare('SELECT result FROM runs WHERE id = ?').get(runId) as
    | { result: string | null }
    | undefined;
  const desk = db
    .prepare('SELECT body FROM desk_notes WHERE run_id = ? ORDER BY at DESC, rowid DESC LIMIT 1')
    .get(runId) as { body: string } | undefined;
  return {
    lastWords: run?.result ?? null,
    note: desk ? (JSON.parse(desk.body) as DeskNoteBody) : null,
  };
}
