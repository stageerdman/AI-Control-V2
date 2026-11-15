/* The whiteboard as the user reads it: every task carries its people (name + avatar look) and, when it
   stopped, a plain message. The stored goal stays as it is; this only adds fields for the screens. */
import type { ChecklistItem, Goal } from '../db/work.ts';
import { DEFAULT_LOOK, type Look } from '../domain/look.ts';
import { finishedById, workingNowIds } from './people.ts';
import { type Problem, plainProblem } from './plain-problem.ts';

export type Person = { id: string; name: string; look: Look };
/** Finds an agent by id (null: no longer in the studio). */
export type FindAgent = (id: string) => { name: string; look: Look } | null;

export type TaskView = Omit<ChecklistItem, 'subtasks'> & {
  workingNow: Person[];
  finishedBy: Person | null;
  problem: Problem | null;
  subtasks: TaskView[];
};
export type GoalView = Omit<Goal, 'items'> & { items: TaskView[] };

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
    subtasks: it.subtasks.map((s) => presentTask(s, find)),
  };
}

export const presentGoal = (g: Goal, find: FindAgent): GoalView => ({
  ...g,
  items: g.items.map((it) => presentTask(it, find)),
});
