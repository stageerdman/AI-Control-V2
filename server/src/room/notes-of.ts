/* What a called agent knows about its own work here, for the call's task: its latest delivery (the last finished
   run's result), its latest desk note, and the whiteboard as it is now. The first two are snapshots from when
   they were written (the orchestrator's last reply said "Uncle Bob is on the OneDrive fix" long after it finished);
   the board is read fresh on every call, so finishing, stopping or removing a goal shows at once. */
import type { Run } from '../db/runs.ts';
import type { DeskNote } from '../office/desk.ts';

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function notesOf(deps: {
  /** The project's runs, newest first (runsRepo.list). */
  runs: (projectId: string) => Run[];
  /** The agent's desk notes, newest first (desk.list). */
  desk: (projectId: string, agentId: string) => DeskNote[];
  /** The whiteboard right now, as text (board.now). */
  board: (projectId: string) => string;
}) {
  return (projectId: string, agentId: string): string => {
    const last = deps
      .runs(projectId)
      .find((r) => r.agentId === agentId && r.status === 'succeeded' && r.result?.trim());
    const note = deps.desk(projectId, agentId)[0];
    return [
      ...(last
        ? [`Latest delivery (${last.endedAt ?? last.startedAt}): ${clip((last.result ?? '').trim(), 1500)}`]
        : []),
      ...(note
        ? [`Desk note (${note.at}): where ${note.where}; doing ${note.doing}; next ${note.next}`]
        : []),
      `The whiteboard right now (the truth; where the notes above disagree, they are out of date):\n${deps.board(projectId)}`,
    ].join('\n');
  };
}
