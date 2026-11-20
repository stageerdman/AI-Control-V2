/* Stall alerts, delivered (src/crew/stall.ts writes them): the stalled goal's own project's orchestrator gets the
   message at once — as a note in their live run if they are working (after their next step), in the comms log
   either way, and as a `work.stalled` event, which report-in (src/office/report-in.ts) hands them to decide
   what the user hears. */
import type { Comms } from '../comms/comms.ts';
import { type Stall, stallText } from '../crew/stall.ts';
import type { Store } from '../db/store.ts';
import type { Goal } from '../db/work.ts';
import type { EventLog } from '../events/log.ts';

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function createStallAlerts(deps: {
  store: Store;
  events: EventLog;
  comms: Comms;
  /** A note for an agent's live run (runtime.tell) → false when they aren't running. */
  tell: (projectId: string, agentId: string, from: string, text: string) => boolean;
}) {
  return function deliver(stall: Stall, goal: Goal): void {
    const orch = deps.store.projects.get(stall.projectId)?.orchestratorId;
    if (!orch) return;
    const task = stall.itemId ? (goal.items.find((i) => i.id === stall.itemId)?.text ?? null) : null;
    const text = clip(stallText(stall, goal.text, task), 4000);
    const told = deps.tell(stall.projectId, orch, 'AI Studio', text);
    deps.comms.record({
      scope: 'project',
      scopeId: stall.projectId,
      kind: 'alert',
      from: null,
      to: orch,
      text,
      refs: { goalId: stall.goalId, itemId: stall.itemId, stall: stall.kind, live: told },
    });
    deps.events.append('project', stall.projectId, {
      type: 'work.stalled',
      payload: {
        goalId: stall.goalId,
        ...(stall.itemId ? { itemId: stall.itemId } : {}),
        orchestratorId: orch,
        kind: stall.kind,
        text,
      },
    });
  };
}
