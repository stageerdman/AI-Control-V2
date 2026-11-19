/* Time estimates for one office: read its spans and its whiteboard, roll up, estimate (the reads of
   GET /projects/:id/timesheet and /estimate). */
import type { Db } from '../db/connection.ts';
import { type Row, rows } from '../db/util.ts';
import { type Estimates, estimatesOf } from './estimate.ts';
import { type Board, rollUp, type Timesheet } from './rollup.ts';
import { readSpans } from './spans.ts';

/** The office's checklist items, goals and features — only what the roll-up needs. */
export function readBoard(db: Db, projectId: string): Board {
  const items = rows<Row>(
    db
      .prepare(
        `SELECT id, goal_id, parent_id, agent_id, text, status FROM checklist_items
         WHERE project_id = ? ORDER BY created_at, position`,
      )
      .all(projectId),
  ).map((r) => ({
    id: r.id as string,
    goalId: r.goal_id as string,
    parentId: (r.parent_id as string | null) ?? null,
    agentId: r.agent_id as string,
    text: r.text as string,
    status: r.status as string,
  }));
  const goals = rows<Row>(
    db
      .prepare('SELECT id, feature_id, text, status FROM goals WHERE project_id = ? ORDER BY created_at')
      .all(projectId),
  ).map((r) => ({
    id: r.id as string,
    featureId: (r.feature_id as string | null) ?? null,
    text: r.text as string,
    status: r.status as string,
  }));
  const features = rows<Row>(
    db
      .prepare('SELECT id, name, status FROM features WHERE project_id = ? ORDER BY created_at')
      .all(projectId),
  ).map((r) => ({ id: r.id as string, name: r.name as string, status: r.status as string }));
  return { items, goals, features };
}

export type OfficeTimesheet = Timesheet & { estimates: Estimates };

export function timesheetOf(db: Db, projectId: string, at: Date = new Date()): OfficeTimesheet {
  const sheet = rollUp(readSpans(db, projectId), readBoard(db, projectId), at.getTime());
  return { ...sheet, estimates: estimatesOf(sheet) };
}

/** Guesses for new work on this office; `agentId` = who would take the task. */
export function estimateFor(db: Db, projectId: string, agentId?: string, at: Date = new Date()): Estimates {
  return estimatesOf(rollUp(readSpans(db, projectId), readBoard(db, projectId), at.getTime()), agentId);
}
