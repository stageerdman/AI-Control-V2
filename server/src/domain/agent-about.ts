/* Who an agent is, in one line, for every agent list an AI reads (director summary, room, staffing, planning).
   Name + role alone made orchestrators pick the wrong person. Derived from the agent's own brain — the prompt
   stays the one source of truth — and clipped hard so a long list doesn't bloat a prompt. */

export const ABOUT_MAX = 140;
export const JOB_MAX = 140;

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim();

/** The first sentence of the prompt (markdown headings skipped), on one line, at most ABOUT_MAX chars. */
export function aboutOf(prompt: string): string {
  const body = oneLine(
    prompt
      .split('\n')
      .filter((l) => !/^\s*#/.test(l))
      .join(' '),
  );
  /* a sentence ends before a capital (or the end); "Robert C. Martin" and "e.g. this" don't end one */
  const first = body.match(/^.*?(?<!\b[A-Z])[.!?](?=\s+["“'‘(]?[A-Z]|$)/)?.[0] ?? body;
  return clip(first, ABOUT_MAX);
}

/** The `{ about, job }` fields to spread into a list entry; empty ones are left out. `job`: their team seat's
    instructions on this project, when they sit on a team there. */
export function describe(
  agent: { prompt: string } | null | undefined,
  job?: string,
): { about?: string; job?: string } {
  const about = agent ? aboutOf(agent.prompt) : '';
  const work = job ? clip(oneLine(job), JOB_MAX) : '';
  return { ...(about ? { about } : {}), ...(work ? { job: work } : {}) };
}

/** An agent's job on the first of these teams that seats them (their seat's instructions), or undefined. */
export function jobOn(
  teams: readonly { members: readonly { agentId: string; instr: string }[] }[],
  agentId: string,
): string | undefined {
  for (const t of teams) {
    const seat = t.members.find((m) => m.agentId === agentId);
    if (seat?.instr.trim()) return seat.instr;
  }
  return undefined;
}
