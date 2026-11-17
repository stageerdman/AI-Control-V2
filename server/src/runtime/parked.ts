/* Parked questions: a run's open ask_user outlives a studio restart. Its session, resumed later, takes the
   question over (same ask id, still on the user's screen) and starts only once it is answered — the answer
   goes into the resumed session's brief, so the agent carries on from it instead of asking again. */
import type { Ask } from '../db/runs.ts';
import { type RunHandle, type RunOutcome, ZERO_USAGE } from './runner.ts';

/** The resumed session's task: what it asked before the pause and what the user answered, then its task. */
export function answeredBrief(task: string, answered: readonly Pick<Ask, 'question' | 'answer'>[]): string {
  if (!answered.length) return task;
  const lines = answered.map(
    (a) => `You asked the user: "${a.question}"\nThe user answered: "${a.answer ?? ''}"`,
  );
  return [
    'AI Studio: the studio restarted while you were waiting for the user. Their answer is in — carry on from it; do not ask again.',
    ...lines,
    task,
  ].join('\n\n');
}

const STOPPED: RunOutcome = { status: 'cancelled', turns: 0, usage: ZERO_USAGE };

/** A run with no process yet: it waits on `answered` (the open question), then `launch`es with the answer.
    Cancel while waiting → a cancelled outcome; a withdrawn question (null) ends it the same way. */
export function parkedHandle(answered: Promise<Ask | null>, launch: (ask: Ask) => RunHandle): RunHandle {
  let stop = () => {};
  const done = new Promise<RunOutcome>((resolve, reject) => {
    stop = () => resolve(STOPPED);
    answered.then((a) => {
      if (!a || a.status !== 'answered') return resolve(STOPPED);
      try {
        const h = launch(a);
        stop = h.cancel;
        h.done.then(resolve, reject);
      } catch (e) {
        reject(e);
      }
    }, reject);
  });
  return { done, cancel: () => stop() };
}
