/* Where an office's context goes (pure): per agent, how its sessions began, how big their context ran, how much
   of it was re-read. Context per turn = input + cache read + cache write; re-reads are the bill (findings.md). */
import type { StartedBy } from './meter.ts';
import type { RunSession } from './sessions.ts';

export type ContextUse = {
  sessions: number;
  /** How the sessions began: everything but 'resume' starts cold. */
  starts: Record<StartedBy, number>;
  turns: number;
  /** All context sent to the model (every turn's input + cache read + cache write). */
  contextTokens: number;
  outputTokens: number;
  /** Average context per turn; null = no turns. */
  avgContext: number | null;
  peakContext: number | null;
  /** Share of the context that was cache re-reads (0–1); null = none sent. */
  reReadShare: number | null;
  costUsd: number;
};
export type AgentContext = ContextUse & { agentId: string };
export type ContextSummary = {
  total: ContextUse;
  /** Biggest context first. */
  agents: AgentContext[];
  /** The office's cost of a cold start: the median first-turn context of sessions that didn't resume. */
  coldStart: number | null;
  /** What a resume reloads: the median first-turn context of resumed sessions. */
  resumeStart: number | null;
};

const NO_STARTS = (): Record<StartedBy, number> => ({ new: 0, rework: 0, resume: 0, forget: 0, limit: 0 });

export function median(xs: readonly number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? (s[mid] as number) : Math.round(((s[mid - 1] as number) + (s[mid] as number)) / 2);
}

export function useOf(sessions: readonly RunSession[]): ContextUse {
  const starts = NO_STARTS();
  let turns = 0;
  let context = 0;
  let reRead = 0;
  let output = 0;
  let cost = 0;
  let peak: number | null = null;
  for (const s of sessions) {
    starts[s.startedBy] = (starts[s.startedBy] ?? 0) + 1;
    turns += s.turns;
    context += s.usage.input + s.usage.cacheRead + s.usage.cacheWrite;
    reRead += s.usage.cacheRead;
    output += s.usage.output;
    cost += s.costUsd ?? 0;
    if (s.peakContext !== null) peak = Math.max(peak ?? 0, s.peakContext);
  }
  return {
    sessions: sessions.length,
    starts,
    turns,
    contextTokens: context,
    outputTokens: output,
    avgContext: turns ? Math.round(context / turns) : null,
    peakContext: peak,
    reReadShare: context ? reRead / context : null,
    costUsd: cost,
  };
}

export function summarize(sessions: readonly RunSession[]): ContextSummary {
  const byAgent = new Map<string, RunSession[]>();
  for (const s of sessions) byAgent.set(s.agentId, [...(byAgent.get(s.agentId) ?? []), s]);
  const firsts = (resumed: boolean) =>
    sessions
      .filter((s) => (s.startedBy === 'resume') === resumed && s.firstContext !== null)
      .map((s) => s.firstContext as number);
  return {
    total: useOf(sessions),
    agents: [...byAgent]
      .map(([agentId, own]) => ({ agentId, ...useOf(own) }))
      .sort((a, b) => b.contextTokens - a.contextTokens),
    coldStart: median(firsts(false)),
    resumeStart: median(firsts(true)),
  };
}
