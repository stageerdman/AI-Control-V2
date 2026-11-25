/* When work comes back to its builder: reopen the old session (--resume) or start fresh from a handoff (pure).
   A resume reloads the whole old transcript on every turn (median 54 k vs 20 k fresh), and past the prompt
   cache's lifetime it is written to the cache again at full price. So resume only a small, warm session. */

/** A transcript past this many tokens costs more to carry than a fresh start (≈ 12 k) plus a handoff. */
export const RESUME_MAX_CONTEXT = 40_000;
/** The prompt cache's lifetime: past it, a resume pays to write the whole transcript again. */
export const CACHE_WARM_MS = 5 * 60_000;

export type LastSession = { lastContext: number | null; endedAt: string };
export type ResumeChoice = { resume: true } | { resume: false; why: string };

const k = (n: number) => `${Math.round(n / 1000)} k`;

export function resumeOrFresh(last: LastSession | null, nowMs: number): ResumeChoice {
  if (!last || last.lastContext === null) return { resume: false, why: 'its last session was not measured' };
  if (last.lastContext >= RESUME_MAX_CONTEXT)
    return { resume: false, why: `its last session ended at ${k(last.lastContext)} tokens of context` };
  const gap = nowMs - Date.parse(last.endedAt);
  if (!(gap < CACHE_WARM_MS))
    return {
      resume: false,
      why: `its last session ended ${Math.round(gap / 60_000)} min ago (cache expired)`,
    };
  return { resume: true };
}
