/* The director sees what is running on its project and stops it from the office chat (voice path for
   RUNNING's stop): `runningNow` goes into its summary; `apply` carries out a `stop` answer and says, in
   one line per target, what was stopped. */
import type { Agent } from '../db/agents.ts';
import type { Store } from '../db/store.ts';
import type { Running, RunningItem } from '../running/registry.ts';
import type { Stopper } from '../running/stop.ts';
import type { DirectorStop } from './director-reply.ts';

export type StopLine = { kind: 'text' | 'error'; text: string };

/** An agent by name, nick or id, as the director (or voice) says it. */
export function agentByName(store: Store, said: string): Agent | undefined {
  const k = said.trim().toLowerCase();
  return store.agents
    .list()
    .find((a) => a.name.toLowerCase() === k || a.nick?.toLowerCase() === k || a.id === said.trim());
}

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

    apply(projectId: string, stop: DirectorStop): StopLine[] {
      if ('everyone' in stop) {
        const what = describeStopped(deps.stopper.project(projectId).stopped);
        return [
          { kind: 'text', text: what ? `Stopped everything: ${what}.` : 'Nothing was running — all quiet.' },
        ];
      }
      return [...new Set(stop.agents)].map((said): StopLine => {
        const a = agentByName(store, said);
        if (!a)
          return { kind: 'error', text: `I couldn’t stop ${said}: nobody by that name is in the studio.` };
        const what = describeStopped(deps.stopper.agent(projectId, a.id).stopped);
        return {
          kind: 'text',
          text: what ? `Stopped ${a.name}: ${what}.` : `${a.name} had nothing running.`,
        };
      });
    },
  };
}
export type DirectorStopper = ReturnType<typeof createDirectorStop>;
