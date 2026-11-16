/* Each agent's to-do list (STUDIO LIFE): one saved list per agent per project, kept across sessions. Callers'
   work requests land on it in the order they came, an agent adds its own reminders (optionally scheduled with
   `dueAt`), and an item with `notify` pages the user when it is done. An item tied to a goal (`goalId`) is done
   when that goal ends — "page me when it's done" survives a restart. */
import { randomUUID } from 'node:crypto';
import type { Db } from '../db/connection.ts';
import { rows } from '../db/util.ts';
import { notFound } from '../errors.ts';
import type { EventLog } from '../events/log.ts';

export type Todo = {
  id: string;
  projectId: string;
  agentId: string;
  /** Who asked (an agent id), or null for the agent's own reminder. */
  fromId: string | null;
  text: string;
  dueAt: string | null;
  notify: boolean;
  goalId: string | null;
  status: 'open' | 'done';
  createdAt: string;
  doneAt: string | null;
};
export type NewTodo = Pick<Todo, 'projectId' | 'agentId' | 'text'> &
  Partial<Pick<Todo, 'fromId' | 'dueAt' | 'notify' | 'goalId'>>;

type Row = {
  id: string;
  project_id: string;
  agent_id: string;
  from_id: string | null;
  text: string;
  due_at: string | null;
  notify: number;
  goal_id: string | null;
  status: string;
  created_at: string;
  done_at: string | null;
};
const toTodo = (r: Row): Todo => ({
  id: r.id,
  projectId: r.project_id,
  agentId: r.agent_id,
  fromId: r.from_id,
  text: r.text,
  dueAt: r.due_at,
  notify: r.notify === 1,
  goalId: r.goal_id,
  status: r.status === 'done' ? 'done' : 'open',
  createdAt: r.created_at,
  doneAt: r.done_at,
});

/** Open first (scheduled ones by due time, then in the order they came), then done (newest first). */
export function inOrder(list: readonly Todo[]): Todo[] {
  const open = list
    .filter((t) => t.status === 'open')
    .sort(
      (a, b) =>
        (a.dueAt ?? '￿').localeCompare(b.dueAt ?? '￿') || a.createdAt.localeCompare(b.createdAt),
    );
  const done = list
    .filter((t) => t.status === 'done')
    .sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? ''));
  return [...open, ...done];
}

export function createTodos(deps: {
  db: Db;
  events: EventLog;
  /** A `notify` item was done → page the user (wired to the pager). */
  onNotify?: (t: Todo) => void;
  now?: () => string;
}) {
  const { db, events } = deps;
  const now = deps.now ?? (() => new Date().toISOString());
  const note = (t: Todo, change: 'added' | 'done') =>
    events.append('project', t.projectId, {
      type: 'todo.changed',
      payload: { agentId: t.agentId, todoId: t.id, change },
    });
  const get = (id: string): Todo | null => {
    const r = db.prepare('SELECT * FROM todos WHERE id = ?').get(id) as Row | undefined;
    return r ? toTodo(r) : null;
  };

  function add(n: NewTodo): Todo {
    const id = randomUUID();
    db.prepare(
      `INSERT INTO todos (id, project_id, agent_id, from_id, text, due_at, notify, goal_id, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
    ).run(
      id,
      n.projectId,
      n.agentId,
      n.fromId ?? null,
      n.text.trim().slice(0, 2000),
      n.dueAt ?? null,
      n.notify ? 1 : 0,
      n.goalId ?? null,
      now(),
    );
    const t = get(id) as Todo;
    note(t, 'added');
    return t;
  }

  /** Tick it off (once) → it, or null when it was already done. */
  function close(projectId: string, id: string): Todo | null {
    const t = get(id);
    if (!t || t.projectId !== projectId) throw notFound('To-do', id);
    if (t.status === 'done') return null;
    db.prepare("UPDATE todos SET status = 'done', done_at = ? WHERE id = ?").run(now(), id);
    const ticked = get(id) as Todo;
    note(ticked, 'done');
    return ticked;
  }

  /** The owner ticks it off; a `notify` item pages the user. */
  function done(projectId: string, id: string): Todo {
    const ticked = close(projectId, id);
    if (ticked?.notify) deps.onNotify?.(ticked);
    return ticked ?? (get(id) as Todo);
  }

  function list(projectId: string, agentId: string): Todo[] {
    return inOrder(
      rows<Row>(
        db.prepare('SELECT * FROM todos WHERE project_id = ? AND agent_id = ?').all(projectId, agentId),
      ).map(toTodo),
    );
  }

  /** Open items tied to a goal (done when it ends). */
  const forGoal = (projectId: string, goalId: string): Todo[] =>
    rows<Row>(
      db
        .prepare("SELECT * FROM todos WHERE project_id = ? AND goal_id = ? AND status = 'open'")
        .all(projectId, goalId),
    ).map(toTodo);

  return { add, done, close, list, forGoal, get };
}
export type Todos = ReturnType<typeof createTodos>;
