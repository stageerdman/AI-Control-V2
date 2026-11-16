/* The to-do tools every agent run (and the director) gets: read my list, add to it, tick an item off. */
import { invalid } from '../errors.ts';
import type { CapableTool } from '../room/bridge.ts';
import type { Todo, Todos } from './todos.ts';

export type NameOf = (agentId: string) => string;

const line = (nameOf: NameOf) => (t: Todo, i: number) =>
  `${i + 1}. ${t.text}` +
  (t.dueAt ? ` (due ${t.dueAt})` : '') +
  (t.notify ? ' (pages the user when done)' : '') +
  (t.fromId ? ` (asked by ${nameOf(t.fromId)})` : '') +
  ` — id ${t.id}`;

/** The open items as plain lines (for the run prompt and `my_todos`); '' when the list is empty. */
export function openTodosText(todos: Todos, projectId: string, agentId: string, nameOf: NameOf): string {
  const open = todos.list(projectId, agentId).filter((t) => t.status === 'open');
  return open.map(line(nameOf)).join('\n');
}

const text = (a: Record<string, unknown>, k: string) => {
  const v = typeof a[k] === 'string' ? (a[k] as string).trim() : '';
  if (!v) throw invalid(`"${k}" is required.`);
  return v;
};

export function todoTools(todos: Todos, nameOf: NameOf, projectId: string, agentId: string): CapableTool[] {
  return [
    {
      name: 'my_todos',
      can: 'read my saved to-do list (requests from others, my own reminders)',
      description:
        'Your to-do list, kept across sessions: work others asked of you, in the order it came, and your own reminders. Check it before you finish.',
      inputSchema: { type: 'object', properties: {} },
      run: async () => openTodosText(todos, projectId, agentId, nameOf) || 'Your to-do list is empty.',
    },
    {
      name: 'add_todo',
      can: 'add an item to my to-do list (optionally due at a time, or paging the user when done)',
      description:
        'Add an item to your own to-do list. `dueAt` (ISO time) schedules it; `notify: true` pages the user when you tick it off ("page me when it’s done").',
      inputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'What to do, in one line.' },
          dueAt: { type: 'string', description: 'Optional ISO date-time.' },
          notify: { type: 'boolean', description: 'Page the user when it is done.' },
        },
        required: ['text'],
      },
      run: async (a) => {
        const dueAt = typeof a.dueAt === 'string' && a.dueAt.trim() ? a.dueAt.trim() : undefined;
        if (dueAt && Number.isNaN(Date.parse(dueAt))) throw invalid('"dueAt" must be an ISO date-time.');
        const t = todos.add({ projectId, agentId, text: text(a, 'text'), dueAt, notify: a.notify === true });
        return `Added (id ${t.id}).`;
      },
    },
    {
      name: 'done_todo',
      can: 'tick an item off my to-do list',
      description: 'Tick an item off your to-do list by its id (from my_todos). A notify item pages the user.',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'string', description: 'The item id.' } },
        required: ['id'],
      },
      run: async (a) => {
        const t = todos.get(text(a, 'id'));
        if (!t || t.agentId !== agentId) throw invalid('That is not on your to-do list.');
        todos.done(projectId, t.id);
        return t.notify ? 'Done — the user was paged.' : 'Done.';
      },
    },
  ];
}
