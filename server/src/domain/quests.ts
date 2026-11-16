/* Main quests & side quests (updates/2026-11-16 QUESTS): a goal is the main storyline — the feature the agents
   are building now — or a side quest, a quick fix or short research job. Main quests come first:
   - queued work is taken main quests first (each kind keeps its own order);
   - a side quest waits while its agent has main-quest work that could start now.
   Pure: dispatch's pump hands in the queue and what it knows about each task. */

export const QUESTS = ['main', 'side'] as const;
export type Quest = (typeof QUESTS)[number];

/** Main quests first; within each kind the order stays as given (stable). */
export function mainFirst<T>(queue: readonly T[], questOf: (t: T) => Quest): T[] {
  return [...queue.filter((t) => questOf(t) === 'main'), ...queue.filter((t) => questOf(t) === 'side')];
}

/** A queued task as the rule sees it: whose it is, its quest, and whether it could start now. */
export type Queued = { holder: string; quest: Quest; ready: boolean };

/** The agents a side quest must wait for: they have main-quest work that could start now. */
export const heldForMain = (queue: readonly Queued[]): Set<string> =>
  new Set(queue.filter((q) => q.quest === 'main' && q.ready).map((q) => q.holder));
