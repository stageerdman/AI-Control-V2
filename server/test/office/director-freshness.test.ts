/* G1 director chat freshness. F3 live: the orchestrator's chat resumed one CLI session forever and said "four goals"
   after being told one. Every turn now carries a fresh snapshot labelled as the truth; the session is rotated after
   ROTATE_AFTER_TURNS turns, or when a new goal follows a finished one, with a short recap of the thread. */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ROTATE_AFTER_TURNS } from '../../src/office/threads.ts';
import type { RunSpec } from '../../src/runtime/runner.ts';
import { scriptedCrew, worked } from '../crew/brain.ts';
import { testApp } from '../helpers.ts';

const CHAT = 'Studio summary right now: ';
const isChat = (s: RunSpec) => s.task.startsWith(CHAT);
const snapshot = (s: RunSpec) => JSON.parse((s.task.split('\n')[0] as string).slice(CHAT.length));
const plan = (text: string) => ({
  summary: `${text}.`,
  items: [{ text, assignee: 'a-semic', teamId: 'ship-it', brief: 'b' }],
});

describe('director chat freshness', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());
  const url = '/projects/aurora/threads/a-pixel/messages';

  function studio(opts: { slowWork?: RegExp } = {}) {
    const crew = scriptedCrew({ dispatch: [plan('Ship checkout'), plan('Add search')] }, (s) =>
      isChat(s)
        ? [{ result: chatReply(s) }]
        : opts.slowWork?.test(s.task)
          ? [{ wait: 400 }, ...worked('Done.')]
          : worked('Done.'),
    );
    h = testApp({ seed: true, runner: crew.runner });
    mkdirSync(join(h.config.sandbox, 'aurora'));
    h.store.projects.update('aurora', { folder: 'aurora' });
    return crew;
  }
  /* the stale session's habit: it keeps its own count of goals */
  const chatReply = (s: RunSpec) =>
    s.resumeSessionId
      ? 'We have four goals going: checkout, search, wishlist and reviews.'
      : 'One goal is active: Add search.';
  const say = async (text: string) => {
    const r = await h.call('POST', url, { text });
    expect(r.status).toBe(202);
    await h.runtime.settled(r.body.runId);
    return r.body.runId as string;
  };
  const goalDone = async (id: string) => {
    for (let i = 0; i < 200; i++) {
      const g = (await h.call('GET', `/projects/aurora/work/${id}`)).body;
      if (g.status !== 'running') return g;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error('goal never finished');
  };

  it('regression: "four goals" after being told one — a new goal after a finished one starts a fresh session with the truth', async () => {
    const crew = studio({ slowWork: /Add search/ });
    await say('Let’s plan the launch: checkout, search, wishlist, reviews.');
    const first = (await h.call('POST', '/projects/aurora/work', { goal: 'Ship checkout' })).body;
    await goalDone(first.id);
    const turn2 = await say('Nice. What’s next?');
    const chats = () => crew.calls.filter(isChat);
    expect(chats()[1]?.resumeSessionId).toBe(`fake-${(chats()[0] as RunSpec).runId}`); // no new goal yet: resumed

    /* the user posts ONE new goal after the first one finished */
    const second = (await h.call('POST', '/projects/aurora/work', { goal: 'Add search' })).body;
    expect(second.status).toBe('running');
    await say('How many goals are we working on?');
    const fresh = chats()[2] as RunSpec;
    expect(fresh.resumeSessionId).toBeUndefined(); // rotated: the stale session is gone
    const now = snapshot(fresh);
    expect(now.activeGoals).toBe(1);
    expect(now.whiteboard.map((g: { goal: string }) => g.goal)).toEqual(['Add search']);
    expect(now.finishedGoals).toEqual([{ goal: 'Ship checkout', status: 'done' }]);
    expect(fresh.task).toContain(
      'This summary is the truth right now: exactly 1 goal is active on the whiteboard.',
    );
    expect(fresh.task).toContain('This is a fresh session. A short recap of this chat so far');
    expect(fresh.task).toContain('- The user: Add search'); // the recap ends with the newest lines
    expect(fresh.systemPrompt).toMatch(/trust the summary and drop the older idea/);
    const t = (await h.call('GET', url)).body.messages;
    expect(t.at(-1)).toMatchObject({ from: 'a-pixel', text: 'One goal is active: Add search.' });

    /* the next turn resumes the NEW session, not the old one */
    await say('Thanks');
    expect(chats()[3]?.resumeSessionId).toBe(`fake-${fresh.runId}`);
    expect(chats()[3]?.resumeSessionId).not.toBe(`fake-${turn2}`);
    await goalDone(second.id);
  });

  it(`rotates the resumed session after ${ROTATE_AFTER_TURNS} turns, carrying a recap`, async () => {
    const crew = studio();
    for (let i = 1; i <= ROTATE_AFTER_TURNS; i++) await say(`Turn ${i}`);
    const chats = () => crew.calls.filter(isChat);
    expect(chats()[0]?.resumeSessionId).toBeUndefined();
    expect(
      chats()
        .slice(1)
        .every((s) => !!s.resumeSessionId),
    ).toBe(true); // resumed turn after turn
    await say('Turn 13');
    const rotated = chats()[ROTATE_AFTER_TURNS] as RunSpec;
    expect(rotated.resumeSessionId).toBeUndefined();
    expect(rotated.task).toContain(`- The user: Turn ${ROTATE_AFTER_TURNS}`);
    expect(rotated.task).toContain('This summary is the truth right now: no goal is active');
    await say('Turn 14');
    expect(chats().at(-1)?.resumeSessionId).toBe(`fake-${rotated.runId}`);
  });
});
