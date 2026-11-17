/* The whiteboard repository: goals and their checklist items (plain SQL, no rules —
   src/crew/dispatch.ts owns those). */
import type { Quest } from '../domain/quests.ts';
import { type ItemGate, type Workflow, WorkflowSchema } from '../domain/workflows.ts';
import type { Workspace } from '../git/worktrees.ts';
import type { Db } from './connection.ts';
import { now } from './util.ts';

export type GoalStatus = 'running' | 'done' | 'failed' | 'cancelled';
export type ItemStatus = 'todo' | 'running' | 'done' | 'failed' | 'cancelled';
/** build → review(s) → (merge) → done. `merge` = the builder fixes a merge conflict. */
export type ItemStage = 'build' | 'review' | 'merge';
/** F1c: a team item the captain split — its members are building ('members'), or the captain pulls it together ('integrate'). */
export type TeamPhase = 'members' | 'integrate';
export type ItemReview = {
  reviewer: string;
  gate: ItemGate['kind'];
  verdict: 'approve' | 'changes';
  notes: string;
  runId: string;
  at: string;
};
export type ChecklistItem = {
  id: string;
  goalId: string;
  projectId: string;
  position: number;
  text: string;
  brief: string;
  agentId: string;
  teamId: string | null;
  /** May start alongside the item before it; otherwise it waits for every earlier item. */
  parallel: boolean;
  /** Asks for knowledge, not change: done when its report is filed (by a reporter). */
  report: boolean;
  /** The report this item's run filed (the whiteboard links to it). */
  reportId: string | null;
  status: ItemStatus;
  /** The current (or last) run: the builder's, or the reviewer's during a review. */
  runId: string | null;
  note: string | null;
  /** B8: where the item is in its flow, its review gates (snapshot at dispatch), the next gate,
      how often it was sent back, the last reviewer notes and every verdict so far. */
  stage: ItemStage;
  gates: ItemGate[];
  gateIndex: number;
  sendBacks: number;
  notes: string | null;
  reviews: ItemReview[];
  /** The builder's last run (rework resumes its session). */
  buildRunId: string | null;
  /** Its own git checkout + branch (null: it works in the project folder — not a git repo yet). */
  workspace: Workspace | null;
  /** Merge conflicts the builder was asked to fix. */
  mergeTries: number;
  /** A stopped run (turn cap, restart) whose session the next run carries on from (null = start as usual). */
  resumeRunId: string | null;
  /** How often it carried on after reaching its turn cap. */
  continues: number;
  /** F1c: a member's sub-task of a team item (null on the whiteboard's own items). */
  parentId: string | null;
  /** F1c: where a split team item is (null = not split, or back in the normal flow after integration). */
  teamPhase: TeamPhase | null;
  /** Rework rounds the captain sent members back for. */
  teamRounds: number;
  /** The captain's split in one sentence (null = not split). */
  teamPlan: string | null;
  /** The members' sub-tasks (oldest round first; empty on sub-tasks themselves). */
  subtasks: ChecklistItem[];
  createdAt: string;
  updatedAt: string;
};
export type ItemPatch = {
  status: ItemStatus;
  runId?: string | null;
  note?: string | null;
  stage?: ItemStage;
  gateIndex?: number;
  sendBacks?: number;
  notes?: string | null;
  reviews?: ItemReview[];
  buildRunId?: string | null;
  workspace?: Workspace | null;
  mergeTries?: number;
  resumeRunId?: string | null;
  continues?: number;
  teamPhase?: TeamPhase | null;
  teamRounds?: number;
  teamPlan?: string | null;
};
export type Goal = {
  id: string;
  projectId: string;
  text: string;
  summary: string;
  status: GoalStatus;
  items: ChecklistItem[];
  /** done / total, 0–100. */
  pct: number;
  /** Caps for every run this goal dispatches (null → the runtime defaults). */
  caps: { maxTurns?: number; maxBudgetUsd?: number } | null;
  /** F1c: the feature this goal works on (null = none, e.g. research), and whether finishing it ships the feature. */
  featureId: string | null;
  ships: boolean;
  /** The main storyline (the feature being built) or a side quest (a quick fix, a short research job). */
  quest: Quest;
  /** The workflow it runs under, snapshot when it was added (null = older goals: the project's default). */
  workflow: Workflow | null;
  createdAt: string;
  updatedAt: string;
};

export type NewItem = Pick<ChecklistItem, 'id' | 'text' | 'brief' | 'agentId' | 'teamId'> & {
  parallel?: boolean;
  report?: boolean;
  gates?: ItemGate[];
};
export type ItemEdit = Partial<
  Pick<ChecklistItem, 'text' | 'brief' | 'agentId' | 'teamId' | 'parallel' | 'gates'>
>;

type Row = Record<string, unknown>;
/** Whiteboard rows as stored (every column), taken before a removal so it can be put back as it was. */
export type BoardSnapshot = { goals: Row[]; items: Row[] };

const toItem = (r: Row): ChecklistItem => ({
  id: r.id as string,
  goalId: r.goal_id as string,
  projectId: r.project_id as string,
  position: r.position as number,
  text: r.text as string,
  brief: r.brief as string,
  agentId: r.agent_id as string,
  teamId: (r.team_id as string) ?? null,
  parallel: r.parallel === 1,
  report: r.report === 1,
  reportId: (r.report_id as string | null) ?? null,
  status: r.status as ItemStatus,
  runId: (r.run_id as string) ?? null,
  note: (r.note as string) ?? null,
  stage: ((r.stage as string) ?? 'build') as ItemStage,
  gates: parseList<ItemGate>(r.gates),
  gateIndex: (r.gate_index as number) ?? 0,
  sendBacks: (r.send_backs as number) ?? 0,
  notes: (r.notes as string | null) ?? null,
  reviews: parseList<ItemReview>(r.reviews),
  buildRunId: (r.build_run_id as string | null) ?? null,
  workspace: r.workspace ? (JSON.parse(r.workspace as string) as Workspace) : null,
  mergeTries: (r.merge_tries as number) ?? 0,
  resumeRunId: (r.resume_run_id as string | null) ?? null,
  continues: (r.continues as number) ?? 0,
  parentId: (r.parent_id as string | null) ?? null,
  teamPhase: (r.team_phase as TeamPhase | null) ?? null,
  teamRounds: (r.team_rounds as number) ?? 0,
  teamPlan: (r.team_plan as string | null) ?? null,
  subtasks: [],
  createdAt: r.created_at as string,
  updatedAt: r.updated_at as string,
});
function parseWorkflow(raw: unknown): Workflow | null {
  if (typeof raw !== 'string') return null;
  try {
    const r = WorkflowSchema.safeParse(JSON.parse(raw));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}
function parseList<T>(raw: unknown): T[] {
  try {
    const v = JSON.parse((raw as string) ?? '[]');
    return Array.isArray(v) ? (v as T[]) : [];
  } catch {
    return [];
  }
}

const WITH_REPORT = `SELECT i.*, (SELECT r.id FROM reports r WHERE r.item_id = i.id ORDER BY r.created_at DESC LIMIT 1) AS report_id
  FROM checklist_items i`;

export function workRepo(db: Db) {
  /** A team item's sub-tasks, in the order the captain gave them (rounds in order). */
  const children = (parentId: string): ChecklistItem[] =>
    (
      db
        .prepare('SELECT * FROM checklist_items WHERE parent_id = ? ORDER BY position, rowid')
        .all(parentId) as Row[]
    ).map(toItem);
  const withSubtasks = (it: ChecklistItem): ChecklistItem => ({ ...it, subtasks: children(it.id) });
  /** The whiteboard's own items (sub-tasks hang under their team item). */
  const items = (goalId: string) =>
    (
      db
        .prepare(`${WITH_REPORT} WHERE i.goal_id = ? AND i.parent_id IS NULL ORDER BY i.position`)
        .all(goalId) as Row[]
    )
      .map(toItem)
      .map(withSubtasks);
  const toGoal = (r: Row): Goal => {
    const its = items(r.id as string);
    return {
      id: r.id as string,
      projectId: r.project_id as string,
      text: r.text as string,
      summary: r.summary as string,
      status: r.status as GoalStatus,
      items: its,
      caps: r.caps ? JSON.parse(r.caps as string) : null,
      featureId: (r.feature_id as string | null) ?? null,
      ships: r.ships !== 0,
      quest: (r.quest as Quest | null) ?? 'main',
      workflow: parseWorkflow(r.workflow),
      pct: its.length ? Math.round((its.filter((i) => i.status === 'done').length / its.length) * 100) : 0,
      createdAt: r.created_at as string,
      updatedAt: r.updated_at as string,
    };
  };

  function insertItems(goalId: string, projectId: string, start: number, list: NewItem[]) {
    const t = now();
    const ins = db.prepare(
      `INSERT INTO checklist_items (id, goal_id, project_id, position, text, brief, agent_id, team_id, parallel, report, gates, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'todo', ?, ?)`,
    );
    list.forEach((i, n) => {
      ins.run(
        i.id,
        goalId,
        projectId,
        start + n,
        i.text,
        i.brief,
        i.agentId,
        i.teamId,
        i.parallel ? 1 : 0,
        i.report ? 1 : 0,
        JSON.stringify(i.gates ?? []),
        t,
        t,
      );
    });
  }
  /** INSERT a stored row back under its own columns (names come from our own SELECT *, never from input). */
  const reinsert = (table: 'goals' | 'checklist_items', r: Row) => {
    const cols = Object.keys(r);
    db.prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(
      ...(cols.map((c) => r[c]) as (string | number | null)[]),
    );
  };
  const renumber = (ids: string[]) => {
    const set = db.prepare('UPDATE checklist_items SET position = ? WHERE id = ?');
    ids.forEach((id, n) => {
      set.run(n, id);
    });
  };

  const repo = {
    goal(id: string): Goal | null {
      const r = db.prepare('SELECT * FROM goals WHERE id = ?').get(id) as Row | undefined;
      return r ? toGoal(r) : null;
    },
    goals: (projectId: string): Goal[] =>
      (
        db
          .prepare('SELECT * FROM goals WHERE project_id = ? ORDER BY created_at DESC, rowid DESC')
          .all(projectId) as Row[]
      ).map(toGoal),
    insertGoal(
      g: Pick<Goal, 'id' | 'projectId' | 'text' | 'summary'> & {
        caps?: Goal['caps'];
        quest?: Quest;
        workflow?: Workflow | null;
      },
      list: NewItem[],
    ): Goal {
      const t = now();
      db.prepare(
        `INSERT INTO goals (id, project_id, text, summary, status, caps, quest, workflow, created_at, updated_at) VALUES (?, ?, ?, ?, 'running', ?, ?, ?, ?, ?)`,
      ).run(
        g.id,
        g.projectId,
        g.text,
        g.summary,
        g.caps ? JSON.stringify(g.caps) : null,
        g.quest ?? 'main',
        g.workflow ? JSON.stringify(g.workflow) : null,
        t,
        t,
      );
      insertItems(g.id, g.projectId, 0, list);
      return repo.goal(g.id) as Goal;
    },
    /** New whiteboard items after the goal's last one. */
    appendItems(goal: Pick<Goal, 'id' | 'projectId'>, list: NewItem[]): Goal {
      insertItems(goal.id, goal.projectId, items(goal.id).length, list);
      return repo.goal(goal.id) as Goal;
    },
    editGoal(id: string, change: { text?: string; summary?: string }) {
      const cur = repo.goal(id);
      if (!cur) return;
      db.prepare('UPDATE goals SET text = ?, summary = ?, updated_at = ? WHERE id = ?').run(
        change.text ?? cur.text,
        change.summary ?? cur.summary,
        now(),
        id,
      );
    },
    editItem(id: string, change: ItemEdit) {
      const cur = repo.item(id);
      if (!cur) return;
      const given = Object.fromEntries(Object.entries(change).filter(([, v]) => v !== undefined));
      const next = { ...cur, ...given };
      db.prepare(
        'UPDATE checklist_items SET text = ?, brief = ?, agent_id = ?, team_id = ?, parallel = ?, gates = ?, updated_at = ? WHERE id = ?',
      ).run(
        next.text,
        next.brief,
        next.agentId,
        next.teamId,
        next.parallel ? 1 : 0,
        JSON.stringify(next.gates),
        now(),
        id,
      );
    },
    /** Moves a whiteboard item to a 0-based place; positions stay 0..n-1 (dispatch indexes the list by them). */
    moveItem(id: string, to: number) {
      const cur = repo.item(id);
      if (!cur) return;
      const order = items(cur.goalId).filter((i) => i.id !== id);
      order.splice(Math.max(0, Math.min(to, order.length)), 0, cur);
      renumber(order.map((i) => i.id));
    },
    /** Deletes an item (its sub-tasks cascade) and closes the gap in its goal. */
    removeItem(id: string) {
      const cur = repo.item(id);
      if (!cur) return;
      db.prepare('DELETE FROM checklist_items WHERE id = ?').run(id);
      if (!cur.parentId) renumber(items(cur.goalId).map((i) => i.id));
    },
    /** Deletes a goal and every item under it. */
    removeGoal: (id: string) => db.prepare('DELETE FROM goals WHERE id = ?').run(id),
    /** The stored rows of these goals (with all their items) and these items (with their sub-tasks). */
    snapshot(goalIds: string[], itemIds: string[]): BoardSnapshot {
      const goals = goalIds.flatMap((id) => db.prepare('SELECT * FROM goals WHERE id = ?').all(id) as Row[]);
      const byGoal = goalIds.flatMap(
        (id) => db.prepare('SELECT * FROM checklist_items WHERE goal_id = ?').all(id) as Row[],
      );
      const byItem = itemIds.flatMap(
        (id) => db.prepare('SELECT * FROM checklist_items WHERE id = ?1 OR parent_id = ?1').all(id) as Row[],
      );
      const items = [...new Map([...byGoal, ...byItem].map((r) => [r.id as string, r])).values()];
      /* parents first: a sub-task's row points at its team item */
      items.sort((a, b) => Number(!!a.parent_id) - Number(!!b.parent_id));
      return { goals, items };
    },
    /** Puts a snapshot back: goals, then items, each top-level item at its old place in its goal. */
    restore(s: BoardSnapshot) {
      for (const g of s.goals) reinsert('goals', g);
      for (const i of s.items) reinsert('checklist_items', i);
      const tops = s.items
        .filter((i) => !i.parent_id)
        .sort((a, b) => (a.position as number) - (b.position as number));
      for (const i of tops) repo.moveItem(i.id as string, i.position as number);
    },
    /** F1c: link a goal to a feature. */
    setGoalFeature: (id: string, featureId: string | null, ships: boolean) =>
      db
        .prepare('UPDATE goals SET feature_id = ?, ships = ?, updated_at = ? WHERE id = ?')
        .run(featureId, ships ? 1 : 0, now(), id),
    /** The workflow a goal runs under from now on (switching mid-goal). */
    setGoalWorkflow: (id: string, w: Workflow | null) =>
      db
        .prepare('UPDATE goals SET workflow = ?, updated_at = ? WHERE id = ?')
        .run(w ? JSON.stringify(w) : null, now(), id),
    /** Running goals of a project that work on this feature. */
    featureGoals: (featureId: string): Goal[] =>
      (db.prepare('SELECT * FROM goals WHERE feature_id = ?').all(featureId) as Row[]).map(toGoal),
    children,
    /** F1c: the captain's sub-tasks for a team item (appended after any earlier round). */
    insertSubtasks(
      parent: ChecklistItem,
      list: (Pick<ChecklistItem, 'id' | 'text' | 'brief' | 'agentId'> & { parallel?: boolean })[],
    ): ChecklistItem[] {
      const t = now();
      const start = children(parent.id).length;
      const ins = db.prepare(
        `INSERT INTO checklist_items (id, goal_id, project_id, position, text, brief, agent_id, team_id, parallel, report, gates, status, parent_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, '[]', 'todo', ?, ?, ?)`,
      );
      list.forEach((i, n) => {
        ins.run(
          i.id,
          parent.goalId,
          parent.projectId,
          start + n,
          i.text,
          i.brief,
          i.agentId,
          parent.teamId,
          i.parallel ? 1 : 0,
          parent.id,
          t,
          t,
        );
      });
      return children(parent.id).slice(start);
    },
    setGoalStatus: (id: string, status: GoalStatus) =>
      db.prepare('UPDATE goals SET status = ?, updated_at = ? WHERE id = ?').run(status, now(), id),
    item(id: string): ChecklistItem | null {
      const r = db.prepare(`${WITH_REPORT} WHERE i.id = ?`).get(id) as Row | undefined;
      return r ? withSubtasks(toItem(r)) : null;
    },
    itemByRun(runId: string): ChecklistItem | null {
      const r = db.prepare('SELECT * FROM checklist_items WHERE run_id = ?').get(runId) as Row | undefined;
      return r ? toItem(r) : null;
    },
    /** Items of a project in a status, oldest goal first, then checklist order. */
    projectItems: (projectId: string, status: ItemStatus): ChecklistItem[] =>
      (
        db
          .prepare(
            `SELECT i.* FROM checklist_items i JOIN goals g ON g.id = i.goal_id
             WHERE i.project_id = ? AND i.status = ? ORDER BY g.created_at, g.rowid, i.position`,
          )
          .all(projectId, status) as Row[]
      ).map(toItem),
    setItem(id: string, patch: ItemPatch) {
      const cur = repo.item(id);
      if (!cur) return;
      const pick = <K extends keyof ItemPatch & keyof ChecklistItem>(k: K) =>
        (patch[k] === undefined ? cur[k] : patch[k]) as ChecklistItem[K];
      db.prepare(
        `UPDATE checklist_items SET status = ?, run_id = ?, note = ?, stage = ?, gate_index = ?, send_backs = ?, notes = ?,
           reviews = ?, build_run_id = ?, workspace = ?, merge_tries = ?, resume_run_id = ?, continues = ?, team_phase = ?, team_rounds = ?, team_plan = ?,
           updated_at = ? WHERE id = ?`,
      ).run(
        patch.status,
        pick('runId'),
        pick('note'),
        pick('stage'),
        pick('gateIndex'),
        pick('sendBacks'),
        pick('notes'),
        JSON.stringify(pick('reviews')),
        pick('buildRunId'),
        pick('workspace') ? JSON.stringify(pick('workspace')) : null,
        pick('mergeTries'),
        pick('resumeRunId'),
        pick('continues'),
        pick('teamPhase'),
        pick('teamRounds'),
        pick('teamPlan'),
        now(),
        id,
      );
    },
    /** A team rebuild hands an item to someone else (its status is set separately with setItem). */
    reassign: (id: string, to: { agentId: string; teamId: string | null; note: string | null }) =>
      db
        .prepare(
          'UPDATE checklist_items SET agent_id = ?, team_id = ?, note = ?, updated_at = ? WHERE id = ?',
        )
        .run(to.agentId, to.teamId, to.note, now(), id),
    /** Projects with checklist work in flight or queued. */
    activeProjects: (): string[] =>
      (
        db
          .prepare("SELECT DISTINCT project_id FROM checklist_items WHERE status IN ('todo', 'running')")
          .all() as { project_id: string }[]
      ).map((r) => r.project_id),
  };
  return repo;
}
export type WorkRepo = ReturnType<typeof workRepo>;
