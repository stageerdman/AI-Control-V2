/* The whiteboard as the user reads it: every task carries its people (name + avatar look), its sign-offs and,
   when it stopped, a plain message. The stored goal stays as it is; this only adds fields for the screens. */
import type { ChecklistItem, Goal } from '../db/work.ts';
import { DEFAULT_LOOK, type Look } from '../domain/look.ts';
import {
  effectiveGates,
  isTemporary,
  type ScopedWorkflow,
  type Signoff,
  scoped,
  signedBy,
  signoffs,
  type Workflow,
  type WorkflowTag,
  workflowTag,
} from '../domain/workflows.ts';
import { finishedById, workingNowIds } from './people.ts';
import { type Problem, plainProblem } from './plain-problem.ts';

export type Person = { id: string; name: string; look: Look };
/** Finds an agent by id (null: no longer in the studio). */
export type FindAgent = (id: string) => { name: string; look: Look } | null;

export type SignoffView = Omit<Signoff, 'reviewer'> & { reviewer: Person };
export type TaskView = Omit<ChecklistItem, 'subtasks'> & {
  workingNow: Person[];
  finishedBy: Person | null;
  problem: Problem | null;
  /** Its reviewers' sign-offs, in gate order (empty: no reviewer). */
  signoffs: SignoffView[];
  subtasks: TaskView[];
};
/** `workflow`: what the goal runs under (null: an older goal — the project's usual way): its tag plus the whole
    workflow, so the editor can draw it read-only; `gates` are the ones it really runs (a temporary lead's
    sign-offs included). Events carry only the tag.
    `signedBy`: who signed off its work — only once the goal is done. */
export type GoalWorkflowView = ScopedWorkflow & WorkflowTag;
export type GoalView = Omit<Goal, 'items' | 'workflow'> & {
  items: TaskView[];
  workflow: GoalWorkflowView | null;
  signedBy: Person[];
};

const goalWorkflow = (w: Workflow): GoalWorkflowView => ({
  ...scoped({ ...w, gates: effectiveGates(w) }, isTemporary(w) ? 'temporary' : 'office'),
  ...workflowTag(w),
});

export function personOf(find: FindAgent, id: string): Person {
  const a = find(id);
  return a ? { id, name: a.name, look: a.look } : { id, name: 'Someone who left', look: DEFAULT_LOOK };
}

export function presentTask(it: ChecklistItem, find: FindAgent): TaskView {
  const done = finishedById(it);
  return {
    ...it,
    workingNow: workingNowIds(it).map((id) => personOf(find, id)),
    finishedBy: done ? personOf(find, done) : null,
    problem: plainProblem(it.status, it.note),
    signoffs: signoffs(it).map((s) => ({ ...s, reviewer: personOf(find, s.reviewer) })),
    subtasks: it.subtasks.map((s) => presentTask(s, find)),
  };
}

export const presentGoal = (g: Goal, find: FindAgent): GoalView => ({
  ...g,
  items: g.items.map((it) => presentTask(it, find)),
  workflow: g.workflow ? goalWorkflow(g.workflow) : null,
  signedBy: g.status === 'done' ? signedBy(g).map((id) => personOf(find, id)) : [],
});
