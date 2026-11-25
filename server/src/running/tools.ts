/* RUNNING: the studio tools that let an agent see and stop its own running work in this project — sessions
   and the code runs under them. An agent only ever reaches its own, here: the same agent's work in another
   project is someone else's as far as these tools go. Its current session is not cancellable from inside. */
import type { BridgeTool } from '../room/bridge.ts';
import type { Running, RunningItem } from './registry.ts';

export type Caller = { projectId: string; agentId: string; runId: string };

export function runningTools(running: Running, caller: Caller): BridgeTool[] {
  const mine = { projectId: caller.projectId, agentId: caller.agentId };
  const isCurrent = (i: RunningItem) => i.kind === 'session' && i.runId === caller.runId;
  const view = (i: RunningItem) => ({
    id: i.id,
    kind: i.kind,
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
        'List everything you have running right now in this project: your sessions and the code runs under them (servers, tests, builds you started). Your current session is marked current.',
      inputSchema: { type: 'object', properties: {} },
      run: async () => {
        const list = running.list(mine);
        return list.length ? list.map((i) => JSON.stringify(view(i))).join('\n') : 'Nothing running.';
      },
    },
    {
      name: 'cancel_run',
      description:
        'Stop one of your own running sessions or code runs in this project by its id (from my_runs). Not your current session — finish it instead.',
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
