/* The director's whiteboard tools: thin adapters from MCP arguments to the board (src/whiteboard/board.ts). */
import { invalid } from '../errors.ts';
import type { BridgeTool } from '../room/bridge.ts';
import type { Board, CleanWhich, TaskInput } from './board.ts';

type Args = Record<string, unknown>;
const str = (a: Args, k: string) => (typeof a[k] === 'string' ? (a[k] as string) : undefined);
const num = (a: Args, k: string) => (typeof a[k] === 'number' ? (a[k] as number) : undefined);
const bool = (a: Args, k: string) => (typeof a[k] === 'boolean' ? (a[k] as boolean) : undefined);
const ids = (a: Args, k: string) => (Array.isArray(a[k]) ? (a[k] as unknown[]).map(String) : undefined);
function need(a: Args, k: string): string {
  const v = str(a, k)?.trim();
  if (!v) throw invalid(`"${k}" is required.`);
  return v;
}
function oneOf<T extends string>(a: Args, k: string, allowed: readonly T[]): T | undefined {
  const v = str(a, k);
  if (v === undefined) return undefined;
  if (!allowed.includes(v as T)) throw invalid(`"${k}" is one of: ${allowed.join(', ')}.`);
  return v as T;
}
const task = (a: Args): TaskInput => ({
  text: str(a, 'text') ?? '',
  owner: str(a, 'owner') ?? '',
  ...(str(a, 'team') ? { team: str(a, 'team') } : {}),
  ...(str(a, 'brief') ? { brief: str(a, 'brief') } : {}),
  parallel: bool(a, 'parallel') === true,
});

const TASK_PROPS = {
  text: { type: 'string', description: 'The short whiteboard line.' },
  owner: {
    type: 'string',
    description: 'Who does it: a team captain or a specialist (name, nickname or id).',
  },
  team: { type: 'string', description: 'The team, when the owner is on more than one.' },
  brief: { type: 'string', description: 'What to do and what done looks like.' },
  parallel: { type: 'boolean', description: 'May run alongside the task before it.' },
};
const FORCE = {
  type: 'boolean',
  description: 'Stop running work first. Without it, a change that touches running work is refused.',
};

export function whiteboardTools(board: Board, projectId: string): BridgeTool[] {
  return [
    {
      name: 'whiteboard',
      description: 'See the whiteboard: every goal and task with its id, place, owner and status.',
      inputSchema: { type: 'object', properties: {} },
      run: async () => board.view(projectId),
    },
    {
      name: 'add_goal',
      description:
        'Put a new goal on the whiteboard with 1–8 tasks, in the order they should happen. The work starts right away.',
      inputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'The goal, as the user would say it.' },
          summary: { type: 'string', description: 'The plan in one sentence.' },
          tasks: {
            type: 'array',
            items: { type: 'object', properties: TASK_PROPS, required: ['text', 'owner'] },
          },
        },
        required: ['text', 'tasks'],
      },
      run: async (a) =>
        board.addGoal(projectId, {
          text: need(a, 'text'),
          ...(str(a, 'summary') ? { summary: str(a, 'summary') } : {}),
          tasks: Array.isArray(a.tasks) ? (a.tasks as Args[]).map(task) : [],
        }),
    },
    {
      name: 'add_task',
      description: 'Add a task to a goal (at the end, or at "position"). A finished goal runs again.',
      inputSchema: {
        type: 'object',
        properties: {
          goal: { type: 'string', description: 'The goal id.' },
          ...TASK_PROPS,
          position: { type: 'number', description: '1 = first.' },
        },
        required: ['goal', 'text', 'owner'],
      },
      run: async (a) => {
        const position = num(a, 'position');
        return board.addTask(projectId, {
          goal: need(a, 'goal'),
          ...task(a),
          ...(position ? { position } : {}),
        });
      },
    },
    {
      name: 'edit_goal',
      description:
        'Change a goal: its text or plan, or its status (running = continue its unfinished tasks; done or cancelled = stop what is left).',
      inputSchema: {
        type: 'object',
        properties: {
          goal: { type: 'string', description: 'The goal id.' },
          text: { type: 'string' },
          summary: { type: 'string' },
          status: { type: 'string', enum: ['running', 'done', 'cancelled'] },
          force: FORCE,
        },
        required: ['goal'],
      },
      run: async (a) => {
        const status = oneOf(a, 'status', ['running', 'done', 'cancelled'] as const);
        return board.editGoal(projectId, need(a, 'goal'), {
          ...(str(a, 'text') ? { text: str(a, 'text') } : {}),
          ...(str(a, 'summary') ? { summary: str(a, 'summary') } : {}),
          ...(status ? { status } : {}),
          force: bool(a, 'force') === true,
        });
      },
    },
    {
      name: 'edit_task',
      description:
        'Change a task: text, brief, owner, place, parallel, or status (todo = do it again, done, cancelled).',
      inputSchema: {
        type: 'object',
        properties: {
          task: { type: 'string', description: 'The task id.' },
          ...TASK_PROPS,
          position: { type: 'number', description: '1 = first.' },
          status: { type: 'string', enum: ['todo', 'done', 'cancelled'] },
          force: FORCE,
        },
        required: ['task'],
      },
      run: async (a) => {
        const status = oneOf(a, 'status', ['todo', 'done', 'cancelled'] as const);
        const position = num(a, 'position');
        const parallel = bool(a, 'parallel');
        return board.editTask(projectId, need(a, 'task'), {
          ...(str(a, 'text') ? { text: str(a, 'text') } : {}),
          ...(str(a, 'brief') ? { brief: str(a, 'brief') } : {}),
          ...(str(a, 'owner') ? { owner: str(a, 'owner') } : {}),
          ...(str(a, 'team') ? { team: str(a, 'team') } : {}),
          ...(position ? { position } : {}),
          ...(parallel !== undefined ? { parallel } : {}),
          ...(status ? { status } : {}),
          force: bool(a, 'force') === true,
        });
      },
    },
    {
      name: 'remove_from_board',
      description: 'Take goals and/or tasks off the whiteboard for good.',
      inputSchema: {
        type: 'object',
        properties: {
          goals: { type: 'array', items: { type: 'string' }, description: 'Goal ids.' },
          tasks: { type: 'array', items: { type: 'string' }, description: 'Task ids.' },
          force: FORCE,
        },
      },
      run: async (a) =>
        board.remove(projectId, {
          ...(ids(a, 'goals') ? { goals: ids(a, 'goals') } : {}),
          ...(ids(a, 'tasks') ? { tasks: ids(a, 'tasks') } : {}),
          force: bool(a, 'force') === true,
        }),
    },
    {
      name: 'clean_board',
      description:
        'Clear old goals off the whiteboard: finished (done), stopped (failed or cancelled), or all.',
      inputSchema: {
        type: 'object',
        properties: {
          which: { type: 'string', enum: ['finished', 'stopped', 'all'] },
          olderThanDays: {
            type: 'number',
            description: 'Only goals last touched more than this many days ago.',
          },
          force: FORCE,
        },
        required: ['which'],
      },
      run: async (a) => {
        const which = oneOf(a, 'which', ['finished', 'stopped', 'all'] as const) as CleanWhich | undefined;
        if (!which) throw invalid('"which" is required: finished, stopped or all.');
        const olderThanDays = num(a, 'olderThanDays');
        return board.clean(projectId, {
          which,
          ...(olderThanDays ? { olderThanDays } : {}),
          force: bool(a, 'force') === true,
        });
      },
    },
  ];
}
