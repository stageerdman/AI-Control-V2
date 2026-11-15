/* Who a whiteboard task belongs to right now: who is working on it, and who finished it (agent ids). */
import type { ChecklistItem } from '../db/work.ts';

/** Who holds the item right now: the reviewer during a review, else the builder. */
export const holder = (it: ChecklistItem): string =>
  it.stage === 'review' ? (it.gates[it.gateIndex]?.reviewer ?? it.agentId) : it.agentId;

/** Working on it now: a split team item's members on their running parts, else whoever holds a running item. */
export function workingNowIds(it: ChecklistItem): string[] {
  if (it.status !== 'running') return [];
  if (it.teamPhase !== 'members') return [holder(it)];
  return [...new Set(it.subtasks.filter((s) => s.status === 'running').map((s) => s.agentId))];
}

/** Finished it: the owner who delivered it (the builder, or the captain who pulled a team's parts together). */
export const finishedById = (it: ChecklistItem): string | null => (it.status === 'done' ? it.agentId : null);
