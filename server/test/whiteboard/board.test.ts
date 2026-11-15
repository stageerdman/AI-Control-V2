/* The director changes the whiteboard from its office chat with its whiteboard tools: add a goal, edit and
   reorder tasks, take running work off (only with force), revive a finished goal, clean up. */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { getChatMessages } from '../../src/db/chats.ts';
import { type Goal, workRepo } from '../../src/db/work.ts';
import type { FakeStep } from '../../src/runtime/fake.ts';
import type { RunSpec } from '../../src/runtime/runner.ts';
import { scriptedCrew } from '../crew/brain.ts';
import { testApp } from '../helpers.ts';

const isChat = (s: RunSpec) => s.task.startsWith('Studio summary right now: ');
const url = '/projects/aurora/threads/a-pixel/messages';
const SLOW = 'SLOW';

async function until(ok: () => boolean, what: () => unknown, ms = 3000) {
  const end = Date.now() + ms;
  while (!ok()) {
    if (Date.now() > end) throw new Error(`timed out waiting; now: ${JSON.stringify(what())}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}

describe('the director edits the whiteboard', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());

  it('adds, edits, guards running work, revives and cleans up', async () => {
    const turns: FakeStep[][] = [];
    const crew = scriptedCrew({}, (s) => {
      if (isChat(s)) return [...(turns.shift() ?? []), { result: '{"reply":"Done."}' }];
      return s.task.includes(SLOW) ? [{ wait: 10_000 }, { result: 'never' }] : [{ result: 'Done.' }];
    });
    h = testApp({ seed: true, runner: crew.runner });
    mkdirSync(join(h.config.sandbox, 'aurora'));
    h.store.projects.update('aurora', { folder: 'aurora' });
    const work = workRepo(h.db);
    const board = () => work.goals('aurora');
    const goal = () => board()[0] as Goal;
    const state = () =>
      board().map((g) => ({ status: g.status, items: g.items.map((i) => [i.text, i.status, i.note]) }));
    /** One director turn running these tool calls → what each tool answered. */
    const turn = async (...calls: { tool: string; args: Record<string, unknown> }[]) => {
      turns.push(calls);
      const r = await h.call('POST', url, { text: 'board work' });
      await h.runtime.settled(r.body.runId);
      return getChatMessages(h.db, r.body.runId)
        .filter((m) => m.role === 'assistant')
        .map((m) => m.text)
        .slice(0, calls.length);
    };

    const [refused, added] = await turn(
      { tool: 'add_goal', args: { text: 'Ship backups', tasks: [{ text: 'x', owner: 'Pete' }] } },
      {
        tool: 'add_goal',
        args: {
          text: 'Ship backups',
          tasks: [
            { text: `${SLOW} back up`, owner: 'Baron' },
            { text: 'Check it', owner: 'Madame M' },
          ],
        },
      },
    );
    expect(refused).toMatch(/Pixel Pete is on .* brief it through its captain/);
    expect(added).toContain('Added to the whiteboard');
    expect(board()).toHaveLength(1);
    await until(() => goal().items[0]?.status === 'running' && !!goal().items[0]?.runId, state);
    const [slow, check] = goal().items.map((i) => i.id) as [string, string];

    const [handOff, retext, move] = await turn(
      { tool: 'edit_task', args: { task: slow, owner: 'Madame M' } },
      { tool: 'edit_task', args: { task: slow, text: `${SLOW} back up nightly` } },
      { tool: 'edit_task', args: { task: check, position: 1, parallel: true } },
    );
    expect(handOff).toMatch(/Running now: .*force: true/);
    expect(retext).toContain('It is running');
    expect(move).toContain('Task updated');
    expect(goal().items.map((i) => [i.id, i.position])).toEqual([
      [check, 0],
      [slow, 1],
    ]);
    expect(work.item(slow)?.agentId).toBe('a-baron');

    const [removed] = await turn({ tool: 'remove_from_board', args: { tasks: [slow], force: true } });
    expect(removed).toMatch(/^Stopped .*back up nightly.*Took off 1 task\(s\)/);
    await until(() => goal().status === 'done', state);
    expect(goal().items.map((i) => i.id)).toEqual([check]);

    await turn({ tool: 'add_task', args: { goal: goal().id, text: 'Restore drill', owner: 'Baron' } });
    await until(() => goal().items.length === 2 && goal().status === 'done', state);

    const [unknown, cleaned] = await turn(
      { tool: 'edit_task', args: { task: 'nope', text: 'x' } },
      { tool: 'clean_board', args: { which: 'finished' } },
    );
    expect(unknown).toContain("No task 'nope' on this whiteboard");
    expect(cleaned).toContain('Cleaned 1 goal(s)');
    expect(board()).toEqual([]);
  });
});
