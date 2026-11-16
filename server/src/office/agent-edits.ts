/* Editing a Cast agent (by hand in the Cast, later by Tinker): save the change, then tell every office the agent
   shows up in (staff or guest) what changed, so it can redraw them — a new look appears without a reload.
   Only the fields asked for change: prompt, history, teams and projects stay as they are. */
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
      const before = store.agents.require(id);
      const after = store.tx(() => store.agents.update(id, patch));
      const fields = changedFields(before, after);
      /* after the transaction: a rolled-back edit must never reach an office */
      if (fields.length)
        for (const projectId of officesOf(after))
          events.append('project', projectId, { type: 'agent.changed', payload: { agentId: id, fields } });
      return after;
    },
  };
}
export type AgentEdits = ReturnType<typeof createAgentEdits>;
