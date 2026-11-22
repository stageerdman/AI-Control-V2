/* Queue a stopped checklist item again (a failed/cancelled goal continued, a task set back to todo, or work whose
   agent came back). An item that had started carries on in its own session.
   - A review that was only interrupted (cancelled) starts its gate over.
   - Work that failed in review (sent back too often, a review or merge that broke) goes back to its builder with
     the review count reset: re-running the reviewer would fail it again at once on any "changes" (Sea GPS). */
import type { ChecklistItem, ItemPatch } from '../db/work.ts';

/** `hasSession(runId)`: that run left a session to resume. */
export function requeuePatch(it: ChecklistItem, hasSession: (runId: string | null) => boolean): ItemPatch {
  const base = {
    status: 'todo' as const,
    runId: null,
    note: null,
    continues: 0,
    ...(it.teamPhase === 'members' ? { teamPhase: null } : {}),
  };
  if (it.stage !== 'review') return { ...base, resumeRunId: hasSession(it.runId) ? it.runId : null };
  if (it.status === 'cancelled' && it.gates[it.gateIndex]) return { ...base, resumeRunId: null };
  return {
    ...base,
    stage: 'build',
    gateIndex: 0,
    sendBacks: 0,
    mergeTries: 0,
    resumeRunId: hasSession(it.buildRunId) ? it.buildRunId : null,
  };
}
