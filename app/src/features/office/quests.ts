/* The Quest Board's data (updates/2026-11-16 MAIN AND SIDE QUESTS - OPEN/design-quest-board.md):
   goals split into the main storyline (one open main quest + the other features in progress, folded)
   and side quests (one pinned card per goal). Pure: no React, no fetching. */
import type { ChecklistItem, Goal } from '../../api';
import type { Feature } from './api';
import { boardTasks, nowFeatures, resumable } from './state';

export type MainQuest = {
  /** The banner: the feature's name, else the goal's text (a main goal with no feature). */
  name: string;
  featureId: string | null;
  ships: boolean;
  /** The feature's % (the same number the old In progress row showed), else the goal's. */
  pct: number;
  done: number;
  total: number;
  steps: { id: string; goalId: string; item: ChecklistItem }[];
  /** The step that carries Continue / Drop for its stopped goal (one per goal). */
  stuckGoalOf: Record<string, string>;
  /** The goal the card speaks for (its workflow chip, its "Signed by"). */
  goal: Goal;
};
export type SideQuest = {
  goal: Goal;
  /** The item the card speaks for: who has it now, who finished it, or what stopped it. */
  item: ChecklistItem | null;
};
export type QuestBoard = {
  /** An older server sends no `quest`: everything is main and the side section is left out. */
  tagged: boolean;
  main: MainQuest | null;
  others: Feature[];
  side: SideQuest[];
  /** Done side quests from before this hour: folded into one strip. */
  doneEarlier: SideQuest[];
  /** "2 open · 1 stuck" / "All done" (null when there are none). */
  count: string | null;
  stuckSide: Goal[];
};

export const isSide = (g: Goal) => g.quest === 'side';

/** Main quest: the feature the running main goal serves, else the newest main goal's. */
export function mainQuest(goals: Goal[], features: Feature[]): MainQuest | null {
  const main = goals.filter((g) => !isSide(g));
  const goal = main.find((g) => g.status === 'running') ?? main[0];
  if (!goal) return null;
  const feature = goal.featureId ? features.find((f) => f.id === goal.featureId) : undefined;
  const steps = boardTasks(main).map((t) => ({ id: t.id, goalId: t.item.goalId, item: t.item }));
  const stuckGoalOf: Record<string, string> = {};
  for (const g of main.filter((x) => x.status === 'failed')) {
    const it = g.items.find((i) => i.status === 'failed') ?? g.items.at(-1);
    if (it) stuckGoalOf[it.id] = g.id;
  }
  return {
    name: feature?.name ?? goal.text,
    featureId: feature?.id ?? null,
    ships: !!goal.ships,
    pct: Math.round(feature ? (feature.pct ?? 0) : goal.pct),
    done: steps.filter((s) => s.item.status === 'done').length,
    total: steps.length,
    steps,
    stuckGoalOf,
    goal,
  };
}

/** The item a side quest's card speaks for. */
export function sideItem(g: Goal): ChecklistItem | null {
  const it = g.items;
  if (g.status === 'done') return it.filter((i) => i.status === 'done').at(-1) ?? it.at(-1) ?? null;
  if (g.status === 'failed') return it.find((i) => i.status === 'failed') ?? it.at(-1) ?? null;
  if (g.status === 'cancelled' || g.status === 'stopped')
    return it.find((i) => i.status === 'cancelled') ?? it.at(-1) ?? null;
  return it.find((i) => i.status === 'running') ?? it.find((i) => i.status === 'todo') ?? it[0] ?? null;
}

const sameHour = (iso: string, now: Date) => {
  const d = new Date(iso);
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate() &&
    d.getHours() === now.getHours()
  );
};

export function sideCount(goals: Goal[]): string | null {
  if (!goals.length) return null;
  const open = goals.filter((g) => g.status === 'running').length;
  const stuck = goals.filter((g) => g.status === 'failed').length;
  const parts = [open && `${open} open`, stuck && `${stuck} stuck`].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'All done';
}

export function questBoard(goals: Goal[], features: Feature[], now = new Date()): QuestBoard {
  const tagged = !goals.length || goals.some((g) => g.quest !== undefined);
  const main = mainQuest(goals, features);
  const others = nowFeatures(features).filter((f) => f.id !== main?.featureId);
  const sides = goals.filter(isSide);
  /* open first (stuck, then running), then the ones done; the server sends newest first */
  const rank = (g: Goal) => (resumable(g) ? 0 : g.status === 'running' ? 1 : 2);
  const ordered = sides.slice().sort((a, b) => rank(a) - rank(b));
  /* finished ones stay pinned for the hour they finished in; older done ones fold, older dropped ones go */
  const ended = (g: Goal) => g.status === 'done' || g.status === 'cancelled';
  const pinned = ordered.filter((g) => !ended(g) || sameHour(g.updatedAt, now));
  const folded = ordered.filter((g) => g.status === 'done' && !sameHour(g.updatedAt, now));
  const card = (g: Goal): SideQuest => ({ goal: g, item: sideItem(g) });
  return {
    tagged,
    main,
    others,
    side: pinned.map(card),
    doneEarlier: folded.map(card),
    count: sideCount(sides),
    stuckSide: sides.filter((g) => g.status === 'failed'),
  };
}
