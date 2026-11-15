/* RUNNING: the studio tools that let an agent see and stop its own running work — sessions (in any
   project) and the code runs under them. An agent only ever reaches its own; its current session is
   not cancellable from inside (it just finishes). */
import type { BridgeTool } from '../room/bridge.ts';
import type { Running, RunningItem } from './registry.ts';

export type Caller = { agentId: string; runId: string };

export function runningTools(
  running: Running,
  caller: Caller,
  projectName: (id: string) => string | undefined,
): BridgeTool[] {
  const mine = { agentId: caller.agentId };
  const isCurrent = (i: RunningItem) => i.kind === 'session' && i.runId === caller.runId;
  const view = (i: RunningItem) => ({
    id: i.id,
    kind: i.kind,
    project: i.projectId ? (projectName(i.projectId) ?? i.projectId) : null,
    what: i.label,
    since: i.startedAt,
    ...(i.pid ? { pid: i.pid } : {}),
    ...(i.sessionId ? { under: i.sessionId } : {}),
    ...(isCurrent(i) ? { current: true } : {}),
  });

  return [
    {
      name: 'my_runs',
      description:
        'List everything you have running right now: your sessions (in every project) and the code runs under them (servers, tests, builds you started). Your current session is marked current.',
      inputSchema: { type: 'object', properties: {} },
      run: async () => {
        const list = running.list(mine);
        return list.length ? list.map((i) => JSON.stringify(view(i))).join('\n') : 'Nothing running.';
      },
    },
    {
      name: 'cancel_run',
      description:
        'Stop one of your own running sessions or code runs by its id (from my_runs). Not your current session — finish it instead.',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'string', description: 'The id from my_runs.' } },
        required: ['id'],
      },
      run: async (a) => {
        const id = String(a.id ?? '');
        const current = running.list(mine).find((i) => i.id === id && isCurrent(i));
        if (current) throw new Error('That is your current session — finish it instead of cancelling it.');
        const stopped = running.cancel(id, mine);
        return `Stopping ${stopped.kind} ${JSON.stringify(stopped.label)}.`;
      },
    },
  ];
}
