/* Work from the director's chat: a clear ask puts ONE goal on the whiteboard with `add_goal` during the turn, and
   the user's message and the reply are linked to it by goalId; a question or a maybe gets a plain reply and never
   starts work. */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { fakeBrain, fakeDirector } from '../../src/crew/fake-brain.ts';
import { contractOf } from '../../src/crew/structured.ts';
import { getChatMessages } from '../../src/db/chats.ts';
import { replyText } from '../../src/office/director-reply.ts';
import { type FakeStep, fakeRunner } from '../../src/runtime/fake.ts';
import type { RunSpec } from '../../src/runtime/runner.ts';
import { testApp } from '../helpers.ts';

const isChat = (s: RunSpec) => s.task.startsWith('Studio summary right now: ');
const url = '/projects/aurora/threads/a-pixel/messages';
type Msg = { from: string; kind: string; text: string; goalId: string | null; reportId: string | null };

/** A studio where each director turn plays the next script (tool calls, then its reply). */
function studio(scripts: FakeStep[][]) {
  const calls: RunSpec[] = [];
  const h = testApp({
    seed: true,
    runner: fakeRunner((spec): FakeStep[] => {
      calls.push(spec);
      if (isChat(spec)) return scripts.shift() ?? [{ result: 'Hm.' }];
      if (contractOf(spec.task)) return fakeBrain(spec);
      return [{ result: 'Built.' }];
    }),
  });
  mkdirSync(join(h.config.sandbox, 'aurora'));
  h.store.projects.update('aurora', { folder: 'aurora' });
  return { h, calls };
}
const addGoal = (text: string, owner = 'a-semic'): FakeStep => ({
  tool: 'add_goal',
  args: { text, tasks: [{ text: 'Dark mode toggle', owner }] },
});

describe('work from the director’s chat', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());

  const say = async (body: object) => {
    const r = await h.call('POST', url, body);
    expect(r.status).toBe(202);
    await h.runtime.settled(r.body.runId);
    return r.body.runId as string;
  };
  const messages = async () => (await h.call('GET', url)).body.messages as Msg[];
  const goals = async () =>
    (await h.call('GET', '/projects/aurora/work')).body as { id: string; text: string }[];
  /** What the director's turn read back from its tools. */
  const toolSaid = (runId: string) =>
    getChatMessages(h.db, runId)
      .filter((m) => m.role === 'assistant')
      .map((m) => m.text);

  it('a work request → add_goal in the turn, the user’s line and the reply linked by goalId', async () => {
    const s = studio([[addGoal('Add a dark mode toggle in Settings'), { result: 'On it — Semic has it.' }]]);
    h = s.h;
    await say({ text: 'Add dark mode please' });
    const [g] = await goals();
    expect(g?.text).toBe('Add a dark mode toggle in Settings');
    expect((await messages()).map((x) => [x.from, x.text, x.goalId])).toEqual([
      ['user', 'Add dark mode please', g?.id],
      ['a-pixel', 'On it — Semic has it.', g?.id],
    ]);
    // no second planning turn: the director planned it itself
    expect(s.calls.some((c) => contractOf(c.task)?.name === 'dispatch')).toBe(false);
  });

  it('a goal it can’t add is refused in the turn, so the reply can say so; nothing is linked', async () => {
    const s = studio([[addGoal('Build search', 'Nobody At All'), { result: 'I couldn’t: nobody fits.' }]]);
    h = s.h;
    const runId = await say({ text: 'Build search' });
    expect(toolSaid(runId)[0]).toMatch(/^add_goal refused: /);
    expect(await goals()).toEqual([]);
    expect((await messages()).map((x) => x.goalId)).toEqual([null, null]);
  });

  it('a question or a maybe → a plain reply, no goal; an old {"reply"} wrapper is unwrapped', async () => {
    const s = studio([
      [{ result: 'Could be nice — want it on the whiteboard?' }],
      [{ result: '{"reply":"We are on track."}' }],
    ]);
    h = s.h;
    await say({ text: 'maybe we could add dark mode?' });
    await say({ text: 'How are we doing?' });
    expect(await goals()).toEqual([]);
    expect((await messages()).filter((x) => x.from === 'a-pixel').map((x) => [x.text, x.goalId])).toEqual([
      ['Could be nice — want it on the whiteboard?', null],
      ['We are on track.', null],
    ]);
  });

  it('a follow-up about a report keeps its reportId (and is just a reply)', async () => {
    const s = studio([[{ result: 'Stripe — it has the best docs.' }]]);
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
    expect(s.calls.find(isChat)?.task).toContain('Title: "Payment providers"');
    expect(await goals()).toEqual([]);
  });

  it('the free fake brain: a clear ask is a goal, a maybe asks, a question just replies', async () => {
    expect(fakeDirector('Build a tags filter').goal).toBe('Build a tags filter');
    expect(fakeDirector('please add dark mode').goal).toBe('please add dark mode');
    const maybe = fakeDirector('maybe we could add dark mode?');
    expect(maybe.goal).toBeNull();
    expect(maybe.reply).toMatch(/want me to put “maybe we could add dark mode” on the whiteboard/);
    expect(fakeDirector('Can you build the checkout?').goal).toBeNull();
    expect(fakeDirector('How are we doing?').goal).toBeNull();
    // and end to end on the fake runner (the default in tests): add_goal through the real tool
    h = testApp({ seed: true });
    mkdirSync(join(h.config.sandbox, 'aurora'));
    h.store.projects.update('aurora', { folder: 'aurora' });
    await say({ text: 'Build a tags filter' });
    const [g] = await goals();
    expect(g?.text).toBe('Build a tags filter');
    expect((await messages()).map((x) => x.goalId)).toEqual([g?.id, g?.id]);
  });

  it('replyText: plain words stay; a {"reply"} object is unwrapped; other JSON stays as written', () => {
    expect(replyText('  Sure.  ')).toBe('Sure.');
    expect(replyText('{"reply":"Hi","work":null}')).toBe('Hi');
    expect(replyText('{"other":1}')).toBe('{"other":1}');
    expect(replyText('{not json')).toBe('{not json');
  });
});
