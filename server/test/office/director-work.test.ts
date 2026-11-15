/* OFFICE: one Send. Each director chat turn decides whether the message is work: a clear ask makes the goal
   exactly as POST /work would, linked to the thread by goalId; a question or a maybe gets a reply (that asks)
   and never starts work. */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { fakeDirector } from '../../src/crew/fake-brain.ts';
import { parseDirectorReply } from '../../src/office/director-reply.ts';
import type { RunSpec } from '../../src/runtime/runner.ts';
import { scriptedCrew } from '../crew/brain.ts';
import { testApp } from '../helpers.ts';

const CHAT = 'Studio summary right now: ';
const isChat = (s: RunSpec) => s.task.startsWith(CHAT);
const url = '/projects/aurora/threads/a-pixel/messages';
const plan = {
  summary: 'Dark mode in Settings.',
  items: [{ text: 'Dark mode toggle', assignee: 'a-semic', teamId: 'ship-it', brief: 'b' }],
};

function studio(chat: (s: RunSpec) => string, dispatch: object[] = [plan]) {
  const crew = scriptedCrew({ dispatch }, (s) => (isChat(s) ? [{ result: chat(s) }] : [{ result: 'Done.' }]));
  const h = testApp({ seed: true, runner: crew.runner });
  mkdirSync(join(h.config.sandbox, 'aurora'));
  h.store.projects.update('aurora', { folder: 'aurora' });
  return { h, crew };
}
type Msg = { from: string; kind: string; text: string; goalId: string | null; reportId: string | null };

describe('the director decides: one Send', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());

  const say = async (body: object) => {
    const r = await h.call('POST', url, body);
    expect(r.status).toBe(202);
    await h.runtime.settled(r.body.runId);
  };
  const messages = async () => (await h.call('GET', url)).body.messages as Msg[];
  const goals = async () =>
    (await h.call('GET', '/projects/aurora/work')).body as { id: string; text: string }[];
  const until = async (fn: () => Promise<boolean>) => {
    for (let i = 0; i < 200; i++) {
      if (await fn()) return;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error('never happened');
  };

  it('a work request → the goal (as POST /work), the turn linked by goalId, then the plan reply', async () => {
    const s = studio(() =>
      JSON.stringify({
        reply: 'On it — I’ll brief the Ship-It Squad.',
        work: { goal: 'Add a dark mode toggle in Settings' },
      }),
    );
    h = s.h;
    await say({ text: 'Add dark mode please' });
    await until(async () => (await messages()).length === 3);
    const [g] = await goals();
    expect(g?.text).toBe('Add a dark mode toggle in Settings');
    /* one dispatch; the step may already be done, so the director's report-in can follow (a race, not a bug) */
    const contracts = s.crew.crewCalls().map((c) => c.task.split('\n')[0]);
    expect(contracts.filter((c) => c !== 'AI Studio contract: report-in')).toEqual([
      'AI Studio contract: dispatch',
    ]);
    const m = await messages();
    expect(m.map((x) => [x.from, x.text, x.goalId])).toEqual([
      ['user', 'Add dark mode please', g?.id],
      ['a-pixel', 'On it — I’ll brief the Ship-It Squad.', g?.id],
      [
        'a-pixel',
        'Dark mode in Settings.\n\nOn the whiteboard:\n• Dark mode toggle — Captain Semicolon',
        g?.id,
      ],
    ]);
    // the director was told how to answer, every turn
    expect(s.crew.calls.find(isChat)?.task).toMatch(/Never start work on a question[\s\S]*ONE JSON object/);
  });

  it('a question or a maybe → a reply that asks, no goal; plain words and broken answers never start work', async () => {
    const answers = [
      JSON.stringify({ reply: 'Could be nice — want it on the whiteboard?', work: null }),
      'Plain words, no JSON.',
      JSON.stringify({ reply: 'Half an answer', work: { goal: '' } }),
    ];
    const s = studio(() => answers.shift() as string);
    h = s.h;
    await say({ text: 'maybe we could add dark mode?' });
    await say({ text: 'How are we doing?' });
    await say({ text: 'Hmm' });
    await new Promise((r) => setTimeout(r, 50));
    expect(await goals()).toEqual([]);
    expect(s.crew.crewCalls()).toEqual([]);
    expect((await messages()).filter((x) => x.from === 'a-pixel').map((x) => [x.text, x.goalId])).toEqual([
      ['Could be nice — want it on the whiteboard?', null],
      ['Plain words, no JSON.', null],
      ['Half an answer', null],
    ]);
  });

  it('a follow-up about a report keeps its reportId (and is just a reply)', async () => {
    const s = studio(() => JSON.stringify({ reply: 'Stripe — it has the best docs.', work: null }));
    h = s.h;
    h.db
      .prepare(
        `INSERT INTO reports (id, project_id, kind, title, summary, body, author, created_at)
         VALUES ('rep_1', 'aurora', 'research', 'Payment providers', 'Stripe wins.', 'Body', ?, '2026-11-14T00:00:00Z')`,
      )
      .run(JSON.stringify({ agentId: 'a-prof', name: 'Professor Prompt', teamId: null, teamName: null }));
    await say({ text: 'Which would you pick?', reportId: 'rep_1' });
    const m = await messages();
    expect(m[0]).toMatchObject({ from: 'user', reportId: 'rep_1', goalId: null });
    expect(m[1]).toMatchObject({ from: 'a-pixel', text: 'Stripe — it has the best docs.' });
    expect(s.crew.calls.find(isChat)?.task).toContain('Title: "Payment providers"');
    expect(await goals()).toEqual([]);
  });

  it('work that can’t be planned → a calm error line in the thread', async () => {
    const s = studio(() => JSON.stringify({ reply: 'On it.', work: { goal: 'Build search' } }), []);
    h = s.h;
    await say({ text: 'Build search' });
    await until(async () => (await messages()).length === 3);
    const last = (await messages()).at(-1);
    expect(last).toMatchObject({ from: 'a-pixel', kind: 'error' });
    expect(last?.text).toMatch(/^I couldn’t plan that: /);
    expect(await goals()).toEqual([]);
  });

  it('the free fake brain: a clear ask is work, a maybe asks, a question just replies', async () => {
    expect(fakeDirector('Build a tags filter').work).toEqual({ goal: 'Build a tags filter' });
    expect(fakeDirector('please add dark mode').work).toEqual({ goal: 'please add dark mode' });
    const maybe = fakeDirector('maybe we could add dark mode?');
    expect(maybe.work).toBeNull();
    expect(maybe.reply).toMatch(/want me to put “maybe we could add dark mode” on the whiteboard/);
    expect(fakeDirector('Can you build the checkout?').work).toBeNull();
    expect(fakeDirector('How are we doing?').work).toBeNull();
    // and end to end on the fake runner (the default in tests)
    h = testApp({ seed: true });
    mkdirSync(join(h.config.sandbox, 'aurora'));
    h.store.projects.update('aurora', { folder: 'aurora' });
    await say({ text: 'Build a tags filter' });
    await until(async () => (await goals()).length === 1 && (await messages()).length === 3);
    expect((await goals())[0]?.text).toBe('Build a tags filter');
  });

  it('parseDirectorReply: fenced JSON is fine; work only from a valid answer', () => {
    expect(parseDirectorReply('```json\n{"reply":"Sure.","work":{"goal":"Add search"}}\n```')).toEqual({
      reply: 'Sure.',
      goal: 'Add search',
    });
    expect(parseDirectorReply('{"reply":"Hi"}')).toEqual({ reply: 'Hi', goal: null });
    expect(parseDirectorReply('{"work":{"goal":"x"}}').goal).toBeNull();
  });
});
