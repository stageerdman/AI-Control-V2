/* STUDIO LIFE: the comms log keeps every agent-to-agent message whole (calls, verdicts, answers, handoffs, reviews,
   splits) and exports it as JSON or JSONL; agents read it with comms_log. */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { scriptedCrew } from '../crew/brain.ts';
import { testApp } from '../helpers.ts';

describe('the comms log', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());

  it('records a call whole — the ask, the verdict, the request, the answer — and what dispatch says in events', async () => {
    const texts: string[] = [];
    const s = scriptedCrew(
      {
        'allow-call': [{ allow: true, reply: 'Yes — go ahead.' }],
        help: [{ answer: 'Two sources: A and B.', say: 'two sources' }],
      },
      () => [
        {
          tool: 'call_agent',
          args: {
            agent: 'Professor Prompt',
            request: 'Find two sources on checkout UX.',
            why: 'find sources',
          },
        },
        { tool: 'comms_log', args: { limit: 10 } },
        { result: 'ok' },
      ],
    );
    h = testApp({ seed: true, runner: s.runner });
    const start = s.runner.start.bind(s.runner);
    s.runner.start = (spec, io) =>
      start(spec, { ...io, emit: (e) => (e.kind === 'text' && texts.push(e.text), io.emit(e)) });
    mkdirSync(join(h.config.sandbox, 'aurora'));
    h.store.projects.update('aurora', { folder: 'aurora' });
    const run = (await h.call('POST', '/projects/aurora/runs', { agentId: 'a-pete', task: 'go' })).body;
    await h.runtime.settled(run.id);
    await h.call('POST', '/projects/aurora/events', {
      type: 'handoff',
      payload: {
        itemId: 'i1',
        goalId: 'g1',
        from: 'a-pete',
        to: 'a-lint',
        kind: 'review',
        note: 'Please check the cart.',
      },
    });

    const { comms } = (await h.call('GET', '/projects/aurora/comms')).body;
    expect(comms.map((c: { kind: string; from: string; to: string }) => [c.kind, c.from, c.to])).toEqual([
      ['allow', 'a-pete', 'a-semic'],
      ['allow', 'a-semic', 'a-pete'],
      ['call', 'a-pete', 'a-prof'],
      ['answer', 'a-prof', 'a-pete'],
      ['handoff', 'a-pete', 'a-lint'],
    ]);
    expect(comms[2].text).toBe('Find two sources on checkout UX.');
    expect(comms[3].text).toBe('Two sources: A and B.');
    expect(comms[4].text).toBe('review: Please check the cart.');

    // the agent read the log with comms_log (names, not ids)
    const read = texts.find((t) => t.includes('"kind":"answer"'));
    expect(read).toContain('"from":"Professor Prompt"');

    const res = await h.app.inject({ method: 'GET', url: '/comms?format=jsonl' });
    expect(res.headers['content-type']).toMatch(/ndjson/);
    const lines = res.body
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));
    expect(lines).toHaveLength(5);
    expect(lines[0]).toMatchObject({ scope: 'project', scopeId: 'aurora', kind: 'allow' });
  });
});
