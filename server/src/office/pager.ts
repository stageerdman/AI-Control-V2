/* Paging the user (DIRECTOR POWERS): any agent may page the user (`page_user`, comms kind 'page' → the pager,
   office/pages.ts); the director may also ask to be told when a goal ends (`page_when_done`): a `notify` item on
   its to-do list tied to the goal, ticked off (and paged) when the goal is done, stopped or cancelled. The list is
   saved, so the watch survives a restart. Any other `notify` item pages when its owner ticks it off. */
import type { Comms } from '../comms/comms.ts';
import type { Goal } from '../db/work.ts';
import { invalid } from '../errors.ts';
import type { EventLog } from '../events/log.ts';
import type { CapableTool } from '../room/bridge.ts';
import type { Todo, Todos } from '../todos/todos.ts';

const ENDED: Record<string, string> = {
  done: 'is done',
  failed: 'stopped partway',
  cancelled: 'was cancelled',
};
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function createPager(deps: {
  comms: Comms;
  events: EventLog;
  /** The project's goals, newest last (work.goals). */
  goals: (projectId: string) => Goal[];
  /** The to-do lists (built after the pager: read only when a goal ends or a watch is set). */
  todos: () => Todos;
}) {
  function page(projectId: string, fromId: string, text: string, refs: Record<string, unknown> = {}): void {
    deps.comms.record({
      scope: 'project',
      scopeId: projectId,
      kind: 'page',
      from: fromId,
      to: 'user',
      text,
      refs,
    });
  }
  const goalOf = (projectId: string, goalId: string) => deps.goals(projectId).find((x) => x.id === goalId);
  const goalText = (g: Goal | undefined) => g?.summary || g?.text || 'the goal';

  /** Its owner ticked off a `notify` item → the page. */
  const notify = (t: Todo): void => page(t.projectId, t.agentId, `Done: ${t.text}`, { todoId: t.id });

  /** A goal ended: its watches are ticked off (once each) and each pages how it ended. */
  const stop = deps.events.bus.subscribeAll((e) => {
    if (e.scope !== 'project' || e.type !== 'goal.changed') return;
    const p = e.payload as { goalId: string; status: string };
    if (!ENDED[p.status]) return;
    const todos = deps.todos();
    const what = clip(goalText(goalOf(e.scopeId, p.goalId)), 120);
    for (const t of todos.forGoal(e.scopeId, p.goalId))
      if (todos.close(e.scopeId, t.id))
        page(e.scopeId, t.agentId, `${t.text} — “${what}” ${ENDED[p.status]}.`, {
          todoId: t.id,
          goalId: p.goalId,
        });
  });

  /** Page when goal `n` (1 = newest running) ends → what the tool says. */
  function whenDone(projectId: string, fromId: string, which: number | undefined, text: string): string {
    const running = deps.goals(projectId).filter((g) => g.status === 'running');
    const g = running[running.length - (which ?? 1)];
    if (!g)
      return running.length
        ? `No running goal ${which} — ${running.length} are running.`
        : 'Nothing is running to watch.';
    deps.todos().add({ projectId, agentId: fromId, text, notify: true, goalId: g.id });
    return `On my to-do list: I’ll page the user when “${clip(goalText(g), 120)}” ends.`;
  }

  return { page, notify, whenDone, stop };
}
export type Pager = ReturnType<typeof createPager>;

const need = (a: Record<string, unknown>, k: string) => {
  const v = typeof a[k] === 'string' ? (a[k] as string).trim() : '';
  if (!v) throw invalid(`"${k}" is required.`);
  return clip(v, 1000);
};

/** `page_user` for any agent run. */
export function pageTool(pager: Pager, projectId: string, agentId: string): CapableTool {
  return {
    name: 'page_user',
    can: 'page the user (their pager shows it until they open this office) — for something they must see soon',
    description:
      'Page the user: a short message that waits on their pager until they open this office. Only for what they must see soon (done, blocked, a decision); everything else goes in your reply or report.',
    inputSchema: {
      type: 'object',
      properties: { message: { type: 'string', description: 'One or two plain sentences.' } },
      required: ['message'],
    },
    run: async (a) => {
      pager.page(projectId, agentId, need(a, 'message'));
      return 'Paged.';
    },
  };
}

/** The director's paging tools: `page_user` and `page_when_done`. */
export function pagerTools(pager: Pager, projectId: string, directorId: string): CapableTool[] {
  const watch: CapableTool = {
    name: 'page_when_done',
    can: 'page the user when a running goal ends ("page me when it’s done")',
    description:
      'Watch a running goal and page the user once when it is done, stopped or cancelled. `goal` is 1 for the newest running goal, 2 for the one before, and so on.',
    inputSchema: {
      type: 'object',
      properties: {
        goal: { type: 'number', description: '1 = the newest running goal (default).' },
        message: {
          type: 'string',
          description: 'What the page says, e.g. "The login page you asked about".',
        },
      },
      required: ['message'],
    },
    run: async (a) =>
      pager.whenDone(
        projectId,
        directorId,
        typeof a.goal === 'number' ? a.goal : undefined,
        need(a, 'message'),
      ),
  };
  return [pageTool(pager, projectId, directorId), watch];
}
