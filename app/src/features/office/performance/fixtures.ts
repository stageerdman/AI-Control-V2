/* Test data for How the team works: an office with a director and two teams, a week of work (tests only). */
import type { Agent } from '../../../api';
import type { AgentPerformance, Measures, Performance } from '../api';
import type { Crew } from './model';

const H = 3_600_000;
const M = 60_000;
export const NOW = Date.parse('2026-11-16T12:00:00.000Z');

const look = (hue: string) => ({ hat: 'none', tool: 'none', body: 'hero', antenna: 'none', face: 'none', hue });
export const agents = {
  'a-pixel': { id: 'a-pixel', name: 'Pixel', role: 'Orchestrator', look: look('grape') },
  'a-blair': { id: 'a-blair', name: 'Blair', role: 'Studio Design', look: look('rose') },
  'a-quill': { id: 'a-quill', name: 'Quill', role: 'Writer', look: look('sky') },
  'a-rivet': { id: 'a-rivet', name: 'Rivet', role: 'Engineering', look: look('mint') },
} as unknown as Record<string, Agent>;

export const crew: Crew = {
  director: 'a-pixel',
  teams: [
    { id: 't-design', name: 'Design', captain: 'a-blair', members: ['a-blair', 'a-quill'] },
    { id: 't-eng', name: 'Engineering', captain: 'a-rivet', members: ['a-rivet'] },
  ],
  solo: [],
};

const kinds = (k: Partial<AgentPerformance['kinds']> = {}): AgentPerformance['kinds'] => ({
  thinking: 0,
  building: 0,
  reviewing: 0,
  research: 0,
  setup: 0,
  ...k,
});
export const agentPerf = (id: string, p: Partial<AgentPerformance> = {}): AgentPerformance => ({
  agentId: id,
  ms: 0,
  tokens: 0,
  requests: 0,
  turns: 0,
  split: { fresh: 0, reread: 0 },
  asked: { task: 0, call: 0, chat: 0 },
  stopped: 0,
  lastAskedAt: '',
  live: false,
  previous: { ms: 0, tokens: 0, requests: 0 },
  kinds: kinds(),
  ...p,
});

const blair = agentPerf('a-blair', {
  ms: 3 * H,
  tokens: 1_200_000,
  requests: 6,
  turns: 140,
  split: { fresh: 300_000, reread: 900_000 },
  asked: { task: 4, call: 1, chat: 1 },
  lastAskedAt: new Date(NOW - 2 * H).toISOString(),
  live: true,
  previous: { ms: 2 * H, tokens: 1_000_000, requests: 6 },
  kinds: kinds({ building: 2 * H, reviewing: H }),
});
const rivet = agentPerf('a-rivet', {
  ms: H,
  tokens: 2_400_000,
  requests: 4,
  turns: 30,
  split: { fresh: 400_000, reread: 2_000_000 },
  asked: { task: 4, call: 0, chat: 0 },
  stopped: 2,
  lastAskedAt: new Date(NOW - 26 * H).toISOString(),
  previous: { ms: H, tokens: 1_900_000, requests: 3 },
  kinds: kinds({ building: H }),
});
const pixel = agentPerf('a-pixel', {
  ms: 30 * M,
  tokens: 100_000,
  requests: 2,
  turns: 8,
  split: { fresh: 100_000, reread: 0 },
  asked: { task: 1, call: 0, chat: 1 },
  lastAskedAt: new Date(NOW - 5 * H).toISOString(),
  previous: { ms: 50 * M, tokens: 100_000, requests: 1 },
  kinds: kinds({ thinking: 30 * M }),
});
const gone = agentPerf('a-gone', {
  ms: 20 * M,
  requests: 1,
  asked: { task: 1, call: 0, chat: 0 },
  lastAskedAt: new Date(NOW - 50 * H).toISOString(),
  kinds: kinds({ setup: 20 * M }),
});
const quill = agentPerf('a-quill', { lastAskedAt: '2026-10-01T10:00:00.000Z' });

const m = (ms: number, tokens: number, requests: number): Measures => ({ ms, tokens, requests });
const day = (d: string, byAgent: Record<string, Measures> = {}) => {
  const all = Object.values(byAgent).reduce(
    (a, x) => m(a.ms + x.ms, a.tokens + x.tokens, a.requests + x.requests),
    m(0, 0, 0),
  );
  return { day: d, ...all, byAgent };
};

export const week: Performance = {
  range: '7d',
  from: '2026-11-09T23:00:00.000Z',
  to: '2026-11-16T23:00:00.000Z',
  since: '2026-10-01T10:00:00.000Z',
  live: 1,
  totals: m(4 * H + 50 * M, 3_700_000, 13),
  previous: m(4 * H, 3_000_000, 10),
  unmeasured: 1,
  agents: [blair, rivet, pixel, gone, quill],
  days: [
    day('2026-11-10'),
    day('2026-11-11', { 'a-rivet': m(H, 2_400_000, 4) }),
    day('2026-11-12', { 'a-pixel': m(30 * M, 100_000, 2), 'a-gone': m(20 * M, 0, 1) }),
    day('2026-11-13'),
    day('2026-11-14', { 'a-blair': m(H, 500_000, 2) }),
    day('2026-11-15'),
    day('2026-11-16', { 'a-blair': m(2 * H, 700_000, 4) }),
  ],
};

/** Work happened, but not in this range. */
export const quiet: Performance = {
  ...week,
  live: 0,
  totals: m(0, 0, 0),
  previous: m(H, 1000, 2),
  unmeasured: 0,
  agents: [agentPerf('a-blair', { previous: m(H, 1000, 2), lastAskedAt: '2026-11-05T10:00:00.000Z' })],
  days: week.days.map((d) => day(d.day)),
};

/** No work ever. */
export const none: Performance = {
  ...quiet,
  since: null,
  previous: m(0, 0, 0),
  agents: [],
};
