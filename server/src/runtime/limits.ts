/* When a run hits a limit (its turn cap, or its size budget), the runtime carries the SAME run on in a fresh
   session — no failed row, no one has to notice. It gives up only when the agent is stuck: no new commits for
   MAX_STALLS sessions in a row, or MAX_SESSIONS sessions in all (a loop guard). Pure: no I/O here. */

import type { DeskNoteBody } from '../office/desk.ts';

/** Sessions in a row without a new commit before the run stops as stuck. */
export const MAX_STALLS = 2;
/** Fresh sessions one run may use after limits (a loop guard). */
export const MAX_SESSIONS = 10;

const LIMIT = /reached the turn cap|error_max_turns|error_max_budget/;

/** The CLI runner's own words when it stops a run at its cap. */
export const turnCapError = (cap: number) => `Stopped: reached the turn cap (${cap})`;

export const isLimit = (error: string | undefined): boolean => !!error && LIMIT.test(error);

/** Where a limited run stands after one more session ended at a limit. */
export type LimitState = { sessions: number; stalls: number };
export type LimitVerdict = { carryOn: true; state: LimitState } | { carryOn: false; error: string };

/** Carry on, or stop because it is stuck / used every session. `progressed`: a new commit since the session began. */
export function afterLimit(prev: LimitState, progressed: boolean, cap: number): LimitVerdict {
  const state = { sessions: prev.sessions + 1, stalls: progressed ? 0 : prev.stalls + 1 };
  if (state.stalls >= MAX_STALLS)
    return {
      carryOn: false,
      error: `Stopped: no new commits in its last ${MAX_STALLS} sessions of ${cap} steps. It may be stuck.`,
    };
  if (state.sessions > MAX_SESSIONS)
    return { carryOn: false, error: `Stopped: used all ${MAX_SESSIONS} fresh sessions of ${cap} steps.` };
  return { carryOn: true, state };
}

/** What the agent reads in its fresh session: why it was restarted, its latest desk note, the original brief. */
export function limitBrief(task: string, cap: number, note: DeskNoteBody | null): string {
  return [
    `You reached the step limit of a session (${cap} steps). The studio carries you on in a fresh session: same task, same files, fresh memory.`,
    ...(note
      ? [
          '',
          'Your latest note on your desk:',
          `Where I am: ${note.where}`,
          `What I'm doing: ${note.doing}`,
          `Next step: ${note.next}`,
          ...(note.notes ? [`Notes: ${note.notes}`] : []),
        ]
      : []),
    '',
    'Your original brief, for reference:',
    task,
    '',
    'Check where you are (`git status`, `git log`) rather than trusting memory, commit what is done, then carry on and finish. Commit as you go: a session that ends without a new commit counts as stuck.',
  ].join('\n');
}
