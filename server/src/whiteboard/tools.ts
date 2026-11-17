/* The director's whiteboard tools: thin adapters from MCP arguments to the board (src/whiteboard/board.ts). */
import { QUESTS } from '../domain/quests.ts';
import { GATE_KINDS, TempAskSchema, type WorkflowAsk } from '../domain/workflows.ts';
import { invalid, parse } from '../errors.ts';
import type { CapableTool } from '../room/bridge.ts';
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
  ...(ids(a, 'branches') ? { branches: ids(a, 'branches') } : {}),
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
  branches: {
    type: 'array',
    items: { type: 'string' },
    description:
      'Only when the workflow has sign-offs on a branch ("when", see workflows): the labels that hold for this task, word for word ([] = none). Left out, every branched sign-off applies.',
  },
};
const WORKFLOW_PROP = {
  description:
    'The id of the project workflow the goal runs under (see workflows): pick the one whose "when" fits, or when the user names one ("use the quick-fix way"). Leave it out for the usual (first) one. When the user puts someone in command for this goal only ("Elon, take command and use Bob"), give an object instead: {lead, crew, why?, gates?} — the lead hands the crew work that stays on this goal, can stop or steer them, and signs off each of their tasks; it ends with the goal. The lead’s sign-off is automatic: don’t add a review task for it.',
  oneOf: [
    { type: 'string' },
    {
      type: 'object',
      properties: {
        lead: { type: 'string', description: 'Who leads (name).' },
        crew: { type: 'array', items: { type: 'string' }, description: 'Who they lead (1–4 names).' },
        why: { type: 'string', description: 'One line on why.' },
        gates: {
          type: 'array',
          description:
            'Extra sign-offs for this goal. The lead’s sign-off of each crew task is automatic: don’t add a review task or gate for it.',
          items: {
            type: 'object',
            properties: {
              after: { type: 'string' },
              reviewer: { type: 'string' },
              kind: { type: 'string', enum: GATE_KINDS },
              why: { type: 'string' },
            },
            required: ['after', 'reviewer', 'kind', 'why'],
          },
        },
      },
      required: ['lead', 'crew'],
    },
  ],
};

/** A goal's workflow as the tool got it: a stable id, or a temporary lead + crew (names resolve on the board). */
function workflowAsk(a: Args): WorkflowAsk | undefined {
  const w = a.workflow;
  if (typeof w === 'string') return w.trim() || undefined;
  if (w === undefined || w === null) return undefined;
  return parse(TempAskSchema, w);
}
const FORCE = {
  type: 'boolean',
  description:
    'Stop running work first — only when the user clearly wants it stopped; then say whose work you stopped. Without it, a change that touches running work is refused.',
};

export function whiteboardTools(board: Board, projectId: string, by: string): CapableTool[] {
  return [
    {
      name: 'whiteboard',
      can: 'look at the whiteboard — every goal and task with its id; look first to get ids',
      description: 'See the whiteboard: every goal and task with its id, place, owner and status.',
      inputSchema: { type: 'object', properties: {} },
      run: async () => board.view(projectId),
    },
    {
      name: 'add_goal',
      can: 'put new work the user wants on the whiteboard as one goal with 1–8 tasks you choose, in order, each for a team captain or specialist; name the feature it builds so the feature ships when the goal is done; a quick fix or short research job goes on as a side quest (quest: side)',
      description:
        'Put a new goal on the whiteboard with 1–8 tasks, in the order they should happen. The work starts right away. "feature" links it to a feature from the features list (Planned moves to Now; it ships when the goal is done).',
      inputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'The goal, as the user would say it.' },
          summary: { type: 'string', description: 'The plan in one sentence.' },
          tasks: {
            type: 'array',
            items: { type: 'object', properties: TASK_PROPS, required: ['text', 'owner'] },
          },
          feature: { type: 'string', description: 'The id of the feature this goal builds (optional).' },
          ships: {
            type: 'boolean',
            description:
              'false = the goal is only one step of the feature, so finishing it does not ship it.',
          },
          quest: {
            type: 'string',
            enum: QUESTS,
            description:
              'main (default) = the big feature the team is building now. side = a quick fix or a short research job, often one task for one person; it never serves a feature and runs only when it holds up no main quest.',
          },
          workflow: WORKFLOW_PROP,
        },
        required: ['text', 'tasks'],
      },
      run: async (a) => {
        const feature = str(a, 'feature')?.trim();
        const quest = oneOf(a, 'quest', QUESTS);
        const workflow = workflowAsk(a);
        return board.addGoal(projectId, by, {
          text: need(a, 'text'),
          ...(str(a, 'summary') ? { summary: str(a, 'summary') } : {}),
          tasks: Array.isArray(a.tasks) ? (a.tasks as Args[]).map(task) : [],
          ...(feature ? { feature: { id: feature, ships: bool(a, 'ships') !== false } } : {}),
          ...(quest ? { quest } : {}),
          ...(workflow ? { workflow } : {}),
        });
      },
    },
    {
      name: 'add_task',
      can: 'add a step missing from a goal',
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
        return board.addTask(projectId, by, {
          goal: need(a, 'goal'),
          ...task(a),
          ...(position ? { position } : {}),
        });
      },
    },
    {
      name: 'edit_goal',
      can: 'change a goal’s wording, plan or workflow, continue it (running) or stop it (cancelled)',
      description:
        'Change a goal: its text or plan, its workflow (tasks not started yet take the new checks; started ones keep theirs), or its status (running = continue its unfinished tasks; done or cancelled = stop what is left).',
      inputSchema: {
        type: 'object',
        properties: {
          goal: { type: 'string', description: 'The goal id.' },
          text: { type: 'string' },
          summary: { type: 'string' },
          status: { type: 'string', enum: ['running', 'done', 'cancelled'] },
          workflow: WORKFLOW_PROP,
          force: FORCE,
        },
        required: ['goal'],
      },
      run: async (a) => {
        const status = oneOf(a, 'status', ['running', 'done', 'cancelled'] as const);
        const workflow = workflowAsk(a);
        return board.editGoal(projectId, by, need(a, 'goal'), {
          ...(str(a, 'text') ? { text: str(a, 'text') } : {}),
          ...(str(a, 'summary') ? { summary: str(a, 'summary') } : {}),
          ...(status ? { status } : {}),
          ...(workflow ? { workflow } : {}),
          force: bool(a, 'force') === true,
        });
      },
    },
    {
      name: 'edit_task',
      can: 'change a task’s wording, brief, owner, order or parallel, or its status — todo tries a failed task again',
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
        return board.editTask(projectId, by, need(a, 'task'), {
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
      can: 'take goals or tasks that are wrong, duplicate or no longer wanted off the whiteboard',
      description:
        'Take goals and/or tasks off the whiteboard (wrong, duplicate or no longer wanted). undo_board puts them back within a day.',
      inputSchema: {
        type: 'object',
        properties: {
          goals: { type: 'array', items: { type: 'string' }, description: 'Goal ids.' },
          tasks: { type: 'array', items: { type: 'string' }, description: 'Task ids.' },
          force: FORCE,
        },
      },
      run: async (a) =>
        board.remove(projectId, by, {
          ...(ids(a, 'goals') ? { goals: ids(a, 'goals') } : {}),
          ...(ids(a, 'tasks') ? { tasks: ids(a, 'tasks') } : {}),
          force: bool(a, 'force') === true,
        }),
    },
    {
      name: 'clean_board',
      can: 'tidy the whiteboard after a goal ships, or when finished or stopped goals crowd it (all only when the user asks for a fresh board)',
      description:
        'Clear old goals off the whiteboard: finished (done), stopped (failed or cancelled), or all. undo_board puts them back within a day.',
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
        return board.clean(projectId, by, {
          which,
          ...(olderThanDays ? { olderThanDays } : {}),
          force: bool(a, 'force') === true,
        });
      },
    },
    {
      name: 'board_history',
      can: 'see who changed what on the whiteboard, and when',
      description:
        'The latest whiteboard changes, newest first: when, who, what — with the undo id of removals that can still be put back.',
      inputSchema: { type: 'object', properties: {} },
      run: async () => board.history(projectId),
    },
    {
      name: 'undo_board',
      can: 'put back what was taken off the whiteboard by mistake (within a day)',
      description:
        'Put back what remove_from_board or clean_board took off (the latest, or "change" from board_history). Works for a day.',
      inputSchema: {
        type: 'object',
        properties: { change: { type: 'string', description: 'The undo id; leave out for the latest.' } },
      },
      run: async (a) => board.undo(projectId, by, str(a, 'change')?.trim() || undefined),
    },
  ];
}
