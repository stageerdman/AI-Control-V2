/* What a called agent knows about its own work here, for the call's task: its latest delivery (the last finished
   run's result) and its latest desk note — so a call is answered from real notes, not a blank memory. */
import type { Run } from '../db/runs.ts';
import type { DeskNote } from '../office/desk.ts';

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function notesOf(deps: {
  /** The project's runs, newest first (runsRepo.list). */
  runs: (projectId: string) => Run[];
  /** The agent's desk notes, newest first (desk.list). */
  desk: (projectId: string, agentId: string) => DeskNote[];
}) {
  return (projectId: string, agentId: string): string | null => {
    const last = deps
      .runs(projectId)
      .find((r) => r.agentId === agentId && r.status === 'succeeded' && r.result?.trim());
    const note = deps.desk(projectId, agentId)[0];
    const lines = [
      ...(last
        ? [`Latest delivery (${last.endedAt ?? last.startedAt}): ${clip((last.result ?? '').trim(), 1500)}`]
        : []),
      ...(note
        ? [`Desk note (${note.at}): where ${note.where}; doing ${note.doing}; next ${note.next}`]
        : []),
    ];
    return lines.length ? lines.join('\n') : null;
  };
}
