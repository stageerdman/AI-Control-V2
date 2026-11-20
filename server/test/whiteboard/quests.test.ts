/* Main quests & side quests: the director sets a goal's quest; main quests come first, and a side quest runs
   only when it holds up no main quest. */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { getChatMessages } from '../../src/db/chats.ts';
import { workRepo } from '../../src/db/work.ts';
import type { FakeStep } from '../../src/runtime/fake.ts';
import type { RunSpec } from '../../src/runtime/runner.ts';
import { scriptedCrew, worked } from '../crew/brain.ts';
import { testApp } from '../helpers.ts';

const isChat = (s: RunSpec) => s.task.startsWith('Studio summary right now: ');
const url = '/projects/aurora/threads/a-pixel/messages';
const HOLD = 'HOLD';
const TASKS = ['First', 'Second', 'Side fix', 'Madame part', 'Baron part'];

async function until(ok: () => boolean, what: () => unknown, ms = 3000) {
  const end = Date.now() + ms;
  while (!ok()) {
    if (Date.now() > end) throw new Error(`timed out waiting; now: ${JSON.stringify(what())}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}

const goal = (text: string, owner: string, quest?: string) => ({
  tool: 'add_goal',
  args: { text, tasks: [{ text: `${HOLD} ${text}`, owner }], ...(quest ? { quest } : {}) },
});

describe('main quests and side quests', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());

  /** A seeded office whose director runs these tool calls; work tasks with HOLD take a moment. */
  function office() {
    const turns: FakeStep[][] = [];
    const started: string[] = [];
    const crew = scriptedCrew({}, (s) => {
      if (isChat(s)) return [...(turns.shift() ?? []), { result: '{"reply":"Done."}' }];
      /* a brief also lists earlier tasks: only its own item line names the task */
      const own = /Your checklist item: (.*)/.exec(s.task)?.[1] ?? s.task.slice(0, 40);
      started.push(TASKS.find((t) => own === `${HOLD} ${t}`) ?? own);
      return [{ wait: 300 }, ...worked('Done.')];
    });
    h = testApp({ seed: true, runner: crew.runner });
    mkdirSync(join(h.config.sandbox, 'aurora'));
    h.store.projects.update('aurora', { folder: 'aurora' });
    const work = workRepo(h.db);
    const turn = async (...calls: { tool: string; args: Record<string, unknown> }[]) => {
      turns.push(calls);
      const r = await h.call('POST', url, { text: 'board work' });
      await h.runtime.settled(r.body.runId);
      return getChatMessages(h.db, r.body.runId)
        .filter((m) => m.role === 'assistant')
        .map((m) => m.text)
        .slice(0, calls.length);
    };
    const allDone = () =>
      until(
        () => work.goals('aurora').every((g) => g.status === 'done'),
        () => started,
        5000,
      );
    return { work, turn, started, allDone };
  }

  it('runs an agent’s main quests before its side quest, even an older one', async () => {
    const { turn, started, allDone } = office();
    const [, side] = await turn(
      goal('First', 'Baron'),
      goal('Side fix', 'Baron', 'side'),
      goal('Second', 'Baron'),
    );
    expect(side).toContain('Added as a side quest');
    await allDone();
    expect(started).toEqual(['First', 'Second', 'Side fix']);
  });

  it('lets a side quest run while the agent’s main work waits on someone else', async () => {
    const { turn, started, allDone } = office();
    await turn(
      {
        tool: 'add_goal',
        args: {
          text: 'Ship it',
          tasks: [
            { text: `${HOLD} Madame part`, owner: 'Madame M' },
            { text: `${HOLD} Baron part`, owner: 'Baron' },
          ],
        },
      },
      goal('Side fix', 'Baron', 'side'),
    );
    await allDone();
    expect(started).toEqual(['Madame part', 'Side fix', 'Baron part']);
  });

  it('saves the quest, sends it to the office, and keeps side quests off features', async () => {
    const { work, turn, allDone } = office();
    let seen = 0;
    const [refused] = await turn({
      tool: 'add_goal',
      args: { text: 'Odd', quest: 'side', feature: 'f-any', tasks: [{ text: 'x', owner: 'Baron' }] },
    });
    expect(refused).toContain('A side quest never serves a feature');
    expect(work.goals('aurora')).toEqual([]);
    seen = h.events.after('project', 'aurora', 0).at(-1)?.id ?? 0;

    await turn(goal('Main one', 'Baron'), goal('Side one', 'Madame M', 'side'));
    const quests = () => Object.fromEntries(work.goals('aurora').map((g) => [g.text, g.quest]));
    expect(quests()).toEqual({ 'Main one': 'main', 'Side one': 'side' });

    const listed = await h.call('GET', '/projects/aurora/work');
    const sent = (listed.body as { text: string; quest: string }[]).map((g) => [g.text, g.quest]);
    expect(Object.fromEntries(sent)).toEqual({ 'Main one': 'main', 'Side one': 'side' });

    const side = work.goals('aurora').find((g) => g.quest === 'side');
    const announced = h.events
      .after('project', 'aurora', seen)
      .filter((e) => e.type === 'goal.changed')
      .map((e) => e.payload as { goalId: string; quest?: string });
    expect(announced.some((p) => p.goalId === side?.id && p.quest === 'side')).toBe(true);
    await allDone();
  });
});
