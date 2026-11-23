/* Why a whiteboard task stopped, in everyday words. The raw note (run errors, git output) stays available
   as `details`; the user reads `message`. Rules are tried in order, so the more specific ones come first
   (a review that hit its turn cap is "the review didn't finish", not "ran out of steps"). */
import type { ItemStatus } from '../db/work.ts';

export type Problem = { message: string; details?: string };

const SAVED = 'The work is saved and can continue.';

const RULES: { test: RegExp; message: string }[] = [
  { test: /'s review didn't finish/, message: "The review didn't finish." },
  /* runtime/limits.ts: a build or report that kept hitting its step limit with no new work (older rows: "commits") */
  {
    test: /^Stopped: no new (commits|work\b.*) in its last/,
    message: `Stuck: no new work after fresh starts. ${SAVED}`,
  },
  {
    test: /^Stopped: used all \d+ fresh sessions/,
    message: `Still not done after many fresh starts. ${SAVED}`,
  },
  { test: /reached the turn cap|error_max_turns/, message: `Ran out of steps. ${SAVED}` },
  { test: /max[_ -]?budget/i, message: `Hit its size limit. ${SAVED}` },
  { test: /^Stopped by you/, message: 'You stopped this. It can continue whenever you like.' },
  { test: /^Paused: the studio closed/, message: 'Paused when the studio closed. It carries on by itself.' },
  { test: /^Skipped: an earlier item/, message: "Skipped, because an earlier step didn't finish." },
  { test: /sent it back \d+ times/, message: 'Sent back too many times. It needs your call.' },
  { test: /^Finished without filing the report/, message: 'Finished without filing its report.' },
  { test: /^Couldn't make a checkout/, message: "Couldn't set up its own copy of the project." },
  { test: /^Could not start Claude Code/, message: "Couldn't start the agent. Is Claude Code installed?" },
  { test: /^Merging .+ conflicts in/, message: 'Its changes clash with other work.' },
  { test: /^Couldn't (commit|merge) /, message: "Couldn't land the work." },
  { test: /overloaded|\b529\b/i, message: 'The AI service was busy. Try again in a bit.' },
  { test: /rate[_ ]?limit|usage limit|\b429\b/i, message: 'Hit the usage limit. Try again later.' },
  { test: /^Claude Code exited/, message: 'The agent stopped unexpectedly.' },
];

const FALLBACK: Record<'failed' | 'cancelled', string> = {
  failed: 'Something went wrong.',
  cancelled: 'Stopped.',
};

/** A failed or cancelled task's plain message (null for any other status). */
export function plainProblem(status: ItemStatus, note: string | null): Problem | null {
  if (status !== 'failed' && status !== 'cancelled') return null;
  const raw = note?.trim() ?? '';
  const known = RULES.find((r) => r.test.test(raw))?.message ?? FALLBACK[status];
  const message =
    /work kept on branch/.test(raw) && !/saved/.test(known) ? `${known} The work is saved.` : known;
  return raw ? { message, details: raw } : { message };
}
