/* The director stops work from the office chat (the voice path) with `stop_work`: it sees `runningNow` in its
   summary, the tool stops those people — or everything — at once and says what it stopped, during the turn,
   so the reply can say it. Its own turn is never stopped. */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { getChatMessages } from '../../src/db/chats.ts';
import type { FakeStep } from '../../src/runtime/fake.ts';
import type { RunSpec } from '../../src/runtime/runner.ts';
import { scriptedCrew } from '../crew/brain.ts';
import { testApp } from '../helpers.ts';

const isChat = (s: RunSpec) => s.task.startsWith('Studio summary right now: ');
const url = '/projects/aurora/threads/a-pixel/messages';

describe('the director stops work', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());

  it('"stop Pete" stops only Pete; "stop everything" stops the rest, never the director’s own turn', async () => {
    const turns: FakeStep[][] = [];
    const summaries: string[] = [];
    const crew = scriptedCrew({}, (s) => {
      if (!isChat(s)) return [{ wait: 10_000 }, { result: 'never' }];
      summaries.push(s.task);
      return [...(turns.shift() ?? []), { result: '{"reply":"Done."}' }];
    });
    h = testApp({ seed: true, runner: crew.runner });
    mkdirSync(join(h.config.sandbox, 'aurora'));
    h.store.projects.update('aurora', { folder: 'aurora' });
    const pete = h.store.agents.require('a-pete').name;
    const run = async (agentId: string) =>
      (await h.call('POST', '/projects/aurora/runs', { agentId, task: 'long' })).body.id as string;
    const peteRun = await run('a-pete');
    const scarRun = await run('a-scar');
    /** One director turn calling stop_work with `args` → what the tool answered, and how the turn ended. */
    const stop = async (text: string, args: Record<string, unknown>) => {
      turns.push([{ tool: 'stop_work', args }]);
      const r = await h.call('POST', url, { text });
      const turn = await h.runtime.settled(r.body.runId);
      const said = getChatMessages(h.db, r.body.runId).find((m) => m.role === 'assistant')?.text;
      return { said, status: turn.status };
    };

    const one = await stop(`stop ${pete}`, { agents: [pete, 'Nobody', 'Pixel'] });
    expect(summaries[0]).toMatch(/"runningNow":\[\{"who":"[^"]+","kind":"session","what":"long"\}/);
    expect(one.said).toBe(
      [
        `Stopped ${pete}: 1 session.`,
        'Couldn’t stop Nobody: nobody by that name is in the studio.',
        'That’s you — you can’t stop your own turn.',
      ].join('\n'),
    );
    expect((await h.runtime.settled(peteRun)).status).toBe('cancelled');
    expect(h.runtime.get('aurora', scarRun).status).toBe('running');

    const all = await stop('stop everything', { everyone: true });
    expect(all).toEqual({ said: 'Stopped everything: 1 session.', status: 'succeeded' });
    expect((await h.runtime.settled(scarRun)).status).toBe('cancelled');
    expect((await h.call('GET', '/projects/aurora/running')).body).toEqual([]);
    // the reply is the director's own words, after it saw the result
    const lines = ((await h.call('GET', url)).body.messages as { from: string; text: string }[])
      .filter((m) => m.from === 'a-pixel')
      .map((m) => m.text);
    expect(lines).toEqual(['Done.', 'Done.']);
  });
});
