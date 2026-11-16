/* A leader sees what is running and stops it from chat (voice path for RUNNING's stop): `runningNow` goes into
   the director's summary; `apply` stops people or everything and says, in one line per target, what was
   stopped (the `stop_work` tool's answer). A stop may carry a message, left on each stopped agent's desk so
   they (and the office) read why. A captain's stop is scoped to their team (`team`). */
import type { Store } from '../db/store.ts';
import type { Running, RunningItem } from '../running/registry.ts';
import type { Stopper } from '../running/stop.ts';
import { agentByName } from './people.ts';

/** Stop work now: everything in the project (or the team), or these people (names). */
export type DirectorStop = { everyone: true } | { agents: string[] };
/** `message`: why — left on the desk of everyone stopped. `team`: the only agent ids this leader may stop. */
export type StopOptions = { message?: string; team?: readonly string[] };
/** Leave the stop's message where the agent sees it next (their desk). */
export type LeaveNote = (projectId: string, agentId: string, fromId: string, message: string) => void;

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;
/** "1 session and 2 code runs" — what a stop hit, in words. */
export function describeStopped(items: readonly RunningItem[]): string {
  const sessions = items.filter((i) => i.kind === 'session').length;
  const code = items.filter((i) => i.kind === 'code').length;
  return [sessions ? plural(sessions, 'session') : '', code ? plural(code, 'code run') : '']
    .filter(Boolean)
    .join(' and ');
}

export function createDirectorStop(deps: {
  store: Store;
  running: Running;
  stopper: Stopper;
  leaveNote?: LeaveNote;
}) {
  const { store } = deps;
  const name = (id: string | null) => (id ? (store.agents.get(id)?.name ?? id) : 'the app');

  /** Stop one agent → its line; the message goes on its desk when something stopped. */
  function stopOne(projectId: string, byId: string, agentId: string, message?: string): string {
    const what = describeStopped(deps.stopper.agent(projectId, agentId).stopped);
    if (what && message) deps.leaveNote?.(projectId, agentId, byId, message);
    const told = what && message ? ' Your message is on their desk.' : '';
    return what ? `Stopped ${name(agentId)}: ${what}.${told}` : `${name(agentId)} had nothing running.`;
  }

  function stopEveryone(projectId: string, byId: string, message?: string): string {
    const items = deps.stopper.project(projectId, byId).stopped;
    const what = describeStopped(items);
    const hit = [...new Set(items.map((i) => i.agentId).filter((id): id is string => !!id && id !== byId))];
    if (message) for (const id of hit) deps.leaveNote?.(projectId, id, byId, message);
    const told = message && hit.length ? ' Your message is on their desks.' : '';
    return what ? `Stopped everything: ${what}.${told}` : 'Nothing was running — all quiet.';
  }

  return {
    /** Who is working on what in the project right now (sessions, code runs, the app). */
    runningNow: (projectId: string) =>
      deps.running.list({ projectId }).map((i) => ({ who: name(i.agentId), kind: i.kind, what: i.label })),

    /** Stop as `byId` asks, from inside its own turn: its own run is never stopped. */
    apply(projectId: string, byId: string, stop: DirectorStop, opts: StopOptions = {}): string[] {
      const message = opts.message?.trim() || undefined;
      const { team } = opts;
      if ('everyone' in stop) {
        if (!team) return [stopEveryone(projectId, byId, message)];
        const lines = team.filter((id) => id !== byId).map((id) => stopOne(projectId, byId, id, message));
        return lines.length ? lines : ['Your team has nobody else to stop.'];
      }
      return [...new Set(stop.agents)].map((said) => {
        const a = agentByName(store, said);
        if (!a) return `Couldn’t stop ${said}: nobody by that name is in the studio.`;
        if (a.id === byId) return 'That’s you — you can’t stop your own turn.';
        if (team && !team.includes(a.id)) return `Couldn’t stop ${a.name}: they aren’t on your team.`;
        return stopOne(projectId, byId, a.id, message);
      });
    },
  };
}
export type DirectorStopper = ReturnType<typeof createDirectorStop>;
