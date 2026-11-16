/* The director sees what is running on its project and stops it from the office chat (voice path for
   RUNNING's stop): `runningNow` goes into its summary; `apply` stops one agent or everything and says, in
   one line per target, what was stopped (the `stop_work` tool's answer). */
import type { Store } from '../db/store.ts';
import type { Running, RunningItem } from '../running/registry.ts';
import type { Stopper } from '../running/stop.ts';
import { agentByName } from './people.ts';

/** Stop work now: everything in the project, or these people (names). */
export type DirectorStop = { everyone: true } | { agents: string[] };

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;
/** "1 session and 2 code runs" — what a stop hit, in words. */
export function describeStopped(items: readonly RunningItem[]): string {
  const sessions = items.filter((i) => i.kind === 'session').length;
  const code = items.filter((i) => i.kind === 'code').length;
  return [sessions ? plural(sessions, 'session') : '', code ? plural(code, 'code run') : '']
    .filter(Boolean)
    .join(' and ');
}

export function createDirectorStop(deps: { store: Store; running: Running; stopper: Stopper }) {
  const { store } = deps;
  const name = (id: string | null) => (id ? (store.agents.get(id)?.name ?? id) : 'the app');

  return {
    /** Who is working on what in the project right now (sessions, code runs, the app). */
    runningNow: (projectId: string) =>
      deps.running.list({ projectId }).map((i) => ({ who: name(i.agentId), kind: i.kind, what: i.label })),

    /** Stop as `directorId` asks, from inside its own turn: its own run is never stopped. */
    apply(projectId: string, directorId: string, stop: DirectorStop): string[] {
      if ('everyone' in stop) {
        const what = describeStopped(deps.stopper.project(projectId, directorId).stopped);
        return [what ? `Stopped everything: ${what}.` : 'Nothing was running — all quiet.'];
      }
      return [...new Set(stop.agents)].map((said) => {
        const a = agentByName(store, said);
        if (!a) return `Couldn’t stop ${said}: nobody by that name is in the studio.`;
        if (a.id === directorId) return 'That’s you — you can’t stop your own turn.';
        const what = describeStopped(deps.stopper.agent(projectId, a.id).stopped);
        return what ? `Stopped ${a.name}: ${what}.` : `${a.name} had nothing running.`;
      });
    },
  };
}
export type DirectorStopper = ReturnType<typeof createDirectorStop>;
