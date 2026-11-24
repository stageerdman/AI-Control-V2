/* Who in the studio burned the binding window: tokens per agent across every project, from the Agent Performance
   spans (performance/spans.ts — no recording of our own). A span counts in full if it started in the window. Only
   the studio's share: the user's own Claude sessions draw from the same window and are invisible here. */
import { type Span, spanTokens } from '../performance/spans.ts';

export type AgentShare = { agentId: string; tokens: number; share: number };

/** Most first; share of the studio's tokens in the window (0–1). */
export function shareOf(spans: readonly Span[], fromMs: number): AgentShare[] {
  const byAgent = new Map<string, number>();
  for (const s of spans) {
    const t = spanTokens(s);
    if (t > 0 && Date.parse(s.start) >= fromMs) byAgent.set(s.agentId, (byAgent.get(s.agentId) ?? 0) + t);
  }
  const total = [...byAgent.values()].reduce((a, b) => a + b, 0);
  return [...byAgent]
    .map(([agentId, tokens]) => ({ agentId, tokens, share: tokens / total }))
    .sort((a, b) => b.tokens - a.tokens);
}
