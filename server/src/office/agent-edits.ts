/* Editing a Cast agent (by hand in the Cast, later by Tinker): save the change, then tell every office the agent
   shows up in (staff or guest) what changed, so it can redraw them — a new look appears without a reload.
   Only the fields asked for change: prompt, history, teams and projects stay as they are. Kin share their
   instructions, so an instruction edit is news in every kin's offices too. */
import type { Agent, AgentPatch } from '../db/agents.ts';
import type { Store } from '../db/store.ts';
import { changedFields } from '../domain/agent-changes.ts';
import type { EventLog } from '../events/log.ts';

export function createAgentEdits({ store, events }: { store: Store; events: EventLog }) {
  const officesOf = (a: Agent): string[] => [
    ...new Set([...a.projectIds, ...store.guests.projectIdsOf(a.id)]),
  ];

  return {
    update(id: string, patch: AgentPatch): Agent {
      const before = [id, ...store.agents.kinOf(id).map((k) => k.id)].map((k) => store.agents.require(k));
      const after = store.tx(() => store.agents.update(id, patch));
      /* after the transaction: a rolled-back edit must never reach an office */
      for (const was of before) {
        const now = was.id === id ? after : store.agents.require(was.id);
        const fields = changedFields(was, now);
        if (fields.length)
          for (const projectId of officesOf(now))
            events.append('project', projectId, {
              type: 'agent.changed',
              payload: { agentId: now.id, fields },
            });
      }
      return after;
    },
  };
}
export type AgentEdits = ReturnType<typeof createAgentEdits>;
