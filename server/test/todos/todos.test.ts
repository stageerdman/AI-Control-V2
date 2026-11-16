/* Each agent's saved to-do list: order, paging once, and the agent tools. */
import { describe, expect, it } from 'vitest';
import { openDb } from '../../src/db/connection.ts';
import { migrate } from '../../src/db/migrations.ts';
import { createBus } from '../../src/events/bus.ts';
import { eventLog } from '../../src/events/log.ts';
import { todoTools } from '../../src/todos/tools.ts';
import { createTodos, type Todo } from '../../src/todos/todos.ts';

function setup() {
  const db = openDb(':memory:');
  migrate(db);
  db.prepare(
    "INSERT INTO agents (id, kind, name, look, position, created_at, updated_at) VALUES ('o', 'orchestrator', 'O', '{}', 0, '', '')",
  ).run();
  db.prepare(
    "INSERT INTO projects (id, name, status, orchestrator_id, tile, position, created_at, updated_at) VALUES ('kite', 'Kite', 'live', 'o', '{}', 0, '', '')",
  ).run();
  let tick = 0;
  const paged: Todo[] = [];
  const todos = createTodos({
    db,
    events: eventLog(db, createBus()),
    onNotify: (t) => paged.push(t),
    now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)).toISOString(),
  });
  return { todos, paged };
}

describe('to-do lists', () => {
  it('keeps open items first: scheduled by due time, then in the order they came; done last', () => {
    const { todos } = setup();
    const first = todos.add({ projectId: 'kite', agentId: 'bob', text: 'first ask' });
    todos.add({ projectId: 'kite', agentId: 'bob', text: 'second ask' });
    todos.add({ projectId: 'kite', agentId: 'bob', text: 'at nine', dueAt: '2026-01-02T09:00:00Z' });
    todos.add({ projectId: 'kite', agentId: 'ann', text: 'not mine' });
    todos.done('kite', first.id);
    expect(todos.list('kite', 'bob').map((t) => t.text)).toEqual(['at nine', 'second ask', 'first ask']);
  });

  it('pages once when a notify item is ticked off; close() never pages', () => {
    const { todos, paged } = setup();
    const t = todos.add({ projectId: 'kite', agentId: 'bob', text: 'ship it', notify: true });
    todos.done('kite', t.id);
    todos.done('kite', t.id);
    expect(paged.map((p) => p.text)).toEqual(['ship it']);
    const quiet = todos.add({ projectId: 'kite', agentId: 'bob', text: 'quiet', notify: true });
    expect(todos.close('kite', quiet.id)?.status).toBe('done');
    expect(paged).toHaveLength(1);
  });

  it('gives agents my_todos / add_todo / done_todo on their own list only', async () => {
    const { todos, paged } = setup();
    todos.add({ projectId: 'kite', agentId: 'bob', fromId: 'ann', text: 'review the login' });
    const [mine, add, done] = todoTools(todos, (id) => (id === 'ann' ? 'Ann' : id), 'kite', 'bob');
    expect(await mine?.run({})).toContain('review the login (asked by Ann)');
    await add?.run({ text: 'tell the user', notify: true });
    const id = todos.list('kite', 'bob').find((t) => t.notify)?.id;
    expect(await done?.run({ id })).toContain('paged');
    expect(paged).toHaveLength(1);
    const anns = todos.add({ projectId: 'kite', agentId: 'ann', text: 'hers' });
    await expect(done?.run({ id: anns.id })).rejects.toThrow('not on your to-do list');
    await expect(add?.run({ text: 'x', dueAt: 'soon' })).rejects.toThrow('ISO');
  });
});
