/* Queue a stopped checklist item again (a failed/cancelled goal continued, or work whose agent came back).
   An item that had started carries on in its own session; a review starts its gate over. */
import type { ChecklistItem, ItemPatch } from '../db/work.ts';

export function requeuePatch(it: ChecklistItem, hasSession: boolean): ItemPatch {
  const again = it.stage !== 'review' && hasSession;
  return {
    status: 'todo',
    runId: null,
    note: null,
    resumeRunId: again ? it.runId : null,
    continues: 0,
    ...(it.teamPhase === 'members' ? { teamPhase: null } : {}),
  };
}
