/* The whiteboard's memory: every change logged with who and when, and removals put back while they can be
   (UNDO_MS). Puts back only what fits: nothing that is already on the board, no task without its goal. */
import { type BoardChange, boardLog } from '../db/board-log.ts';
import type { Db } from '../db/connection.ts';
import type { Store } from '../db/store.ts';
import { type BoardSnapshot, workRepo } from '../db/work.ts';
import { conflict, invalid } from '../errors.ts';

export function createHistory(deps: { db: Db; store: Store; name: (id: string) => string }) {
  const { store, name } = deps;
  const work = workRepo(deps.db);
  const log = boardLog(deps.db);

  function undoableChange(projectId: string, changeId?: string): BoardChange {
    const c = changeId ? log.get(changeId) : log.list(projectId, 100).find((x) => x.undoable);
    if (!c || c.projectId !== projectId)
      throw invalid(
        changeId
          ? `No change '${changeId}' on this whiteboard — look with board_history.`
          : 'Nothing to undo: no removal or clean-up in the last day.',
      );
    if (!c.undoable)
      throw invalid(
        c.undoneAt
          ? `'${c.summary}' was already undone.`
          : `'${c.summary}' can't be undone (too old, or not a removal).`,
      );
    return c;
  }

  function checkFits(s: BoardSnapshot) {
    const goalIds = new Set(s.goals.map((g) => g.id as string));
    for (const g of s.goals)
      if (work.goal(g.id as string)) throw conflict(`'${g.text}' is already on the whiteboard.`);
    for (const i of s.items) {
      if (work.item(i.id as string)) throw conflict(`'${i.text}' is already on the whiteboard.`);
      if (!goalIds.has(i.goal_id as string) && !work.goal(i.goal_id as string))
        throw conflict(`'${i.text}' belonged to a goal that is gone too — undo that removal first.`);
    }
  }

  return {
    record: (projectId: string, by: string, action: string, summary: string, snapshot?: BoardSnapshot) =>
      log.record({ projectId, actor: by, action, summary, ...(snapshot ? { snapshot } : {}) }),

    /** Newest first, one line each: when, who, what, and the id to undo it with. */
    text(projectId: string, limit = 20): string {
      const list = log.list(projectId, limit);
      if (!list.length) return 'No whiteboard changes yet.';
      return list
        .map(
          (c) =>
            `${c.at} ${name(c.actor)}: ${c.summary}${c.undoable ? ` [undo id: ${c.id}]` : ''}${c.undoneAt ? ' (undone)' : ''}`,
        )
        .join('\n');
    },

    /** Puts a removal's rows back (the latest undoable one if no id) → what it was and the goals it touched. */
    putBack(projectId: string, changeId?: string): { change: BoardChange; snapshot: BoardSnapshot } {
      const change = undoableChange(projectId, changeId);
      const snapshot = log.snapshotOf(change.id) as BoardSnapshot;
      checkFits(snapshot);
      store.tx(() => {
        work.restore(snapshot);
        log.markUndone(change.id);
      });
      return { change, snapshot };
    },
  };
}
export type BoardHistory = ReturnType<typeof createHistory>;
