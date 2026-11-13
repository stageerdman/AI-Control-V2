/* The real streams of the B6 live smoke test ("Smoke Six", 2026-11-13) replayed through the parser
   and the contracts — so the formats the model actually produced stay accepted (or refused) as they were. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DispatchSchema, dispatchIssues } from '../../src/crew/dispatch.ts';
import { SetupReplySchema } from '../../src/crew/setup-chat.ts';
import { extractJson } from '../../src/crew/structured.ts';
import { castView } from '../../src/db/drafts.ts';
import { AgentDefSchema, agentDefIssues } from '../../src/domain/creator.ts';
import { planIssues } from '../../src/domain/plan.ts';
import { createStreamParser } from '../../src/runtime/stream.ts';
import { testApp } from '../helpers.ts';

const replay = (name: string) => {
  const p = createStreamParser();
  for (const line of readFileSync(join(import.meta.dirname, '../fixtures', `${name}.jsonl`), 'utf8').split(
    '\n',
  ))
    if (line.trim()) p.feed(line);
  return p.outcome();
};

describe('B6 live streams', () => {
  let h: ReturnType<typeof testApp>;
  beforeEach(() => {
    h = testApp({ seed: true });
  });
  afterEach(() => h.close());
  const issuesOf = (name: string) =>
    planIssues(
      SetupReplySchema.parse(extractJson(replay(name).result ?? '')).plan,
      castView(h.store.agents, h.store.teams),
    ).map((i) => i.message);

  it('setup chat: the opening proposal and the repaired answer pass; the first answer (refused under the old cap) is valid now', () => {
    const open = replay('live-b6-setup-chat-open');
    expect(open).toMatchObject({ status: 'succeeded', turns: 1 });
    expect(issuesOf('live-b6-setup-chat-open')).toEqual([]);
    // refused live under the old ≤ 2-individuals cap; since "Orchestrator decides freely" it is a valid plan
    expect(issuesOf('live-b6-setup-chat-rule-broken')).toEqual([]);
    expect(issuesOf('live-b6-setup-chat-repaired')).toEqual([]);
    // the repair resumed the same scratch session
    expect(replay('live-b6-setup-chat-repaired').sessionId).toBe(
      replay('live-b6-setup-chat-rule-broken').sessionId,
    );
  });

  it('Agent Creator: the minted agent follows the contract (studio look slots, new role)', () => {
    const def = AgentDefSchema.parse(extractJson(replay('live-b6-mint-agent').result ?? ''));
    expect(def).toMatchObject({ name: 'Ally Alt-Text', role: 'Accessibility' });
    const view = castView(h.store.agents, h.store.teams);
    expect(
      agentDefIssues(def, {
        agentNames: h.store.agents.records().map((a) => a.name),
        teamNames: [],
        agent: view.agent,
      }),
    ).toEqual([]);
  });

  it('dispatch: every item went to the captain (with its team) or a specialist', () => {
    const plan = DispatchSchema.parse(extractJson(replay('live-b6-dispatch').result ?? ''));
    expect(plan.items).toHaveLength(4);
    const crewing = {
      captains: new Map([['a-semic', [{ teamId: 'ship-it', teamName: 'The Ship-It Squad' }]]]),
      specialists: new Set(['a-twinkle', 'a-ally-alt-text']),
      name: (id: string) => id,
    };
    expect(dispatchIssues(plan, crewing)).toEqual([]);
  });

  it('a run stopped at the turn cap (no result line) still reports what it used', () => {
    const o = replay('live-b6-agent-turn-cap');
    expect(o.status).toBe('failed');
    expect(o.turns).toBe(9);
    expect(o.usage.cacheRead).toBeGreaterThan(100_000);
    expect(o.usage.cacheWrite).toBeGreaterThan(9_000);
  });
});
