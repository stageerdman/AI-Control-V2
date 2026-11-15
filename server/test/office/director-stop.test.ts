/* The director stops work from the office chat (the voice path): it sees `runningNow` in its summary, and a
   `stop` answer stops those people — or everything — at once, with one line saying what was stopped. */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseDirectorReply } from '../../src/office/director-reply.ts';
import type { RunSpec } from '../../src/runtime/runner.ts';
import { scriptedCrew } from '../crew/brain.ts';
import { testApp } from '../helpers.ts';

const isChat = (s: RunSpec) => s.task.startsWith('Studio summary right now: ');
const url = '/projects/aurora/threads/a-pixel/messages';

it('parses stop: everyone wins over names; an empty stop is none', () => {
  expect(parseDirectorReply('{"reply":"Ok.","stop":{"everyone":true,"agents":["Jony"]}}').stop).toEqual({
    everyone: true,
  });
  expect(parseDirectorReply('{"reply":"Ok.","stop":{"agents":["Jony"]}}').stop).toEqual({ agents: ['Jony'] });
  expect(parseDirectorReply('{"reply":"Ok.","stop":{"agents":[]}}').stop).toBeUndefined();
});

describe('the director stops work', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());

  it('"stop Pete" stops only Pete; "stop everything" stops the rest — each said in one line', async () => {
    const answers: string[] = [];
    const summaries: string[] = [];
    const crew = scriptedCrew({}, (s) => {
      if (!isChat(s)) return [{ wait: 10_000 }, { result: 'never' }];
      summaries.push(s.task);
      return [{ result: answers.shift() as string }];
    });
    h = testApp({ seed: true, runner: crew.runner });
    mkdirSync(join(h.config.sandbox, 'aurora'));
    h.store.projects.update('aurora', { folder: 'aurora' });
    const pete = h.store.agents.require('a-pete').name;
    const run = async (agentId: string) =>
      (await h.call('POST', '/projects/aurora/runs', { agentId, task: 'long' })).body.id as string;
    const peteRun = await run('a-pete');
    const scarRun = await run('a-scar');
    const say = async (text: string, answer: object) => {
      answers.push(JSON.stringify(answer));
      const r = await h.call('POST', url, { text });
      await h.runtime.settled(r.body.runId);
    };
    const lines = async () =>
      ((await h.call('GET', url)).body.messages as { from: string; text: string }[])
        .filter((m) => m.from === 'a-pixel')
        .map((m) => m.text);

    await say(`stop ${pete}`, { reply: `Stopping ${pete}.`, stop: { agents: [pete, 'Nobody'] } });
    expect(summaries[0]).toMatch(/"runningNow":\[\{"who":"[^"]+","kind":"session","what":"long"\}/);
    expect((await h.runtime.settled(peteRun)).status).toBe('cancelled');
    expect(h.runtime.get('aurora', scarRun).status).toBe('running');
    expect(await lines()).toEqual([
      `Stopping ${pete}.`,
      `Stopped ${pete}: 1 session.`,
      'I couldn’t stop Nobody: nobody by that name is in the studio.',
    ]);

    await say('stop everything', { reply: 'Stopping everyone.', stop: { everyone: true } });
    expect((await h.runtime.settled(scarRun)).status).toBe('cancelled');
    expect((await lines()).slice(-2)).toEqual(['Stopping everyone.', 'Stopped everything: 1 session.']);
    expect((await h.call('GET', '/projects/aurora/running')).body).toEqual([]);
  });
});
