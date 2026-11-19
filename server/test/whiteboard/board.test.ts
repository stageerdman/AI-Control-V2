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

  it('a task’s thinking power reaches its run; default clears it; an unknown step is refused', async () => {
    const turns: FakeStep[][] = [];
    const builds: RunSpec[] = [];
    const crew = scriptedCrew({}, (s) => {
      if (isChat(s)) return [...(turns.shift() ?? []), { result: '{"reply":"Done."}' }];
      builds.push(s);
      return [{ wait: 10_000 }, { result: 'never' }];
    });
    h = testApp({ seed: true, runner: crew.runner });
    mkdirSync(join(h.config.sandbox, 'aurora'));
    h.store.projects.update('aurora', { folder: 'aurora' });
    const work = workRepo(h.db);
    const item = () => work.goals('aurora')[0]?.items[0];
    const turn = async (args: Record<string, unknown>, tool = 'edit_task') => {
      turns.push([{ tool, args }]);
      const r = await h.call('POST', url, { text: 'board work' });
      await h.runtime.settled(r.body.runId);
      return getChatMessages(h.db, r.body.runId).find((m) => m.role === 'assistant')?.text ?? '';
    };

    await turn(
      { text: 'Back up', tasks: [{ text: 'Back up the db', owner: 'Baron', thinking: 'deepest' }] },
      'add_goal',
    );
    await until(
      () => builds.length === 1 && !!item()?.runId,
      () => item(),
    );
    expect(item()?.thinking).toBe('deepest');
    expect(builds[0]?.effort).toBe('max');
    expect(h.runtime.get('aurora', item()?.runId as string).thinking).toBe('deepest');

    expect(await turn({ task: item()?.id, thinking: 'turbo' })).toContain('"thinking" is one of');
    expect(await turn({ task: item()?.id, thinking: 'default' })).toContain('It is running');
    expect(item()?.thinking).toBeNull();
    await turn({ tasks: [item()?.id], force: true }, 'remove_from_board');
  });

  it('shows each change live, logs who made it, and puts removals and clean-ups back', async () => {
    const turns: FakeStep[][] = [];
    const crew = scriptedCrew({}, (s) =>
      isChat(s) ? [...(turns.shift() ?? []), { result: '{"reply":"Done."}' }] : [{ result: 'Done.' }],
    );
    h = testApp({ seed: true, runner: crew.runner });
    mkdirSync(join(h.config.sandbox, 'aurora'));
    h.store.projects.update('aurora', { folder: 'aurora' });
    const work = workRepo(h.db);
    const goal = () => work.goals('aurora')[0] as Goal;
    const texts = () => goal().items.map((i) => i.text);
    let seen = 0;
    /** The office hears about the goal (no reload needed): events since the last look. */
    const announced = () => {
      const evs = h.events.after('project', 'aurora', seen);
      seen = evs.at(-1)?.id ?? seen;
      return evs
        .filter((e) => e.type === 'goal.changed')
        .map((e) => (e.payload as { goalId: string }).goalId);
    };
    const turn = async (...calls: { tool: string; args: Record<string, unknown> }[]) => {
      turns.push(calls);
      const r = await h.call('POST', url, { text: 'board work' });
      await h.runtime.settled(r.body.runId);
      return getChatMessages(h.db, r.body.runId)
        .filter((m) => m.role === 'assistant')
        .map((m) => m.text)
        .slice(0, calls.length);
    };
    const settled = () =>
      until(
        () => goal().status === 'done',
        () => texts(),
      );

    await turn({
      tool: 'add_goal',
      args: {
        text: 'Ship search',
        tasks: [
          { text: 'Index', owner: 'Baron' },
          { text: 'Query', owner: 'Baron' },
        ],
      },
    });
    const id = goal().id;
    expect(announced()).toContain(id);
    await settled();
    const [index] = goal().items.map((i) => i.id) as [string];

    await turn({ tool: 'edit_task', args: { task: index, text: 'Index docs' } });
    expect(texts()).toEqual(['Index docs', 'Query']);
    expect(announced()).toContain(id);

    const [removed] = await turn({ tool: 'remove_from_board', args: { tasks: [index] } });
    expect(removed).toContain('undo_board puts it back');
    expect(texts()).toEqual(['Query']);
    expect(announced()).toContain(id);

    const [undone, again] = await turn({ tool: 'undo_board', args: {} }, { tool: 'undo_board', args: {} });
    expect(undone).toContain("Put back: Took off 'Index docs'");
    expect(again).toContain('Nothing to undo');
    expect(goal().items.map((i) => [i.id, i.text, i.status])).toEqual([
      [index, 'Index docs', 'done'],
      [goal().items[1]?.id, 'Query', 'done'],
    ]);
    expect(announced()).toContain(id);

    const [cleaned] = await turn({ tool: 'clean_board', args: { which: 'finished' } });
    expect(cleaned).toContain('Cleaned 1 goal(s)');
    expect(work.goals('aurora')).toEqual([]);
    const [log] = await turn({ tool: 'board_history', args: {} });
    const undoId = /\[undo id: ([\w-]+)\]/.exec(log ?? '')?.[1];
    await turn({ tool: 'undo_board', args: { change: undoId } });
    expect(texts()).toEqual(['Index docs', 'Query']);
    expect(announced()).toContain(id);

    const [history] = await turn({ tool: 'board_history', args: {} });
    const lines = (history ?? '').split('\n');
    expect(lines.every((l) => /^\d{4}-\d\d-\d\dT\S+ Pixel: /.test(l))).toBe(true);
    expect(lines.map((l) => l.replace(/^\S+ Pixel: /, '').replace(/ \[undo id: .*\]/, ''))).toEqual([
      "Undid: Cleaned finished goals off: 'Ship search'",
      "Cleaned finished goals off: 'Ship search' (undone)",
      "Undid: Took off 'Index docs'",
      "Took off 'Index docs' (undone)",
      "Edited 'Index' (text)",
      "Added goal 'Ship search' with 2 task(s)",
    ]);
  });
});
