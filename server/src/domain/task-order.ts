/* Task order (pure). A checklist runs in order: a task depends on every task before its parallel group (a
   parallel task runs alongside the one before it), so it starts only once those have all landed (done: accepted,
   and merged when it has a branch). Tasks that depend on nothing still run side by side. */

type Ordered = { status: string; parallel: boolean };

/** The tasks the one at `index` depends on: every task before its parallel group. */
export function dependsOn<T extends Ordered>(items: readonly T[], index: number): T[] {
  let start = index;
  while (start > 0 && items[start]?.parallel) start--;
  return items.slice(0, start);
}

const didNotLand = (s: string) => s === 'failed' || s === 'cancelled';

/** Whether the task at `index` may start: 'go' once all it depends on landed, 'wait' while any is still open,
    'skip' when one didn't land (it stays on hold; continuing the goal queues it again). `neverSkip`: a team
    member's part waits for whatever is open and never skips — its captain picks up what a teammate left. */
export function orderGate(
  items: readonly Ordered[],
  index: number,
  neverSkip = false,
): 'go' | 'wait' | 'skip' {
  const before = dependsOn(items, index);
  const open = before.some((b) => b.status === 'todo' || b.status === 'running');
  if (neverSkip) return open ? 'wait' : 'go';
  if (before.some((b) => didNotLand(b.status))) return 'skip';
  return open ? 'wait' : 'go';
}

/** The note dispatch leaves on a task it held because a dependency didn't land (whiteboard/plain-problem.ts reads it). */
export const SKIPPED_NOTE = 'Skipped: an earlier item did not succeed';
export const isSkipped = (note: string | null) => note === SKIPPED_NOTE;

/** A task on hold, and the tasks it depends on that stalled. */
export type Blocked = { task: string; waitsOn: string[] };

type Task = Ordered & { text: string };

/** The tasks that never started because one they depend on stalled (`stalled` says which did). `notStarted`:
    still waiting, or skipped by dispatch. Each names its missing dependencies. */
export function blockedBy<T extends Task>(
  items: readonly T[],
  notStarted: (t: T) => boolean,
  stalled: (t: T) => boolean,
): Blocked[] {
  return items.flatMap((t, i) => {
    if (!notStarted(t)) return [];
    const waitsOn = dependsOn(items, i)
      .filter(stalled)
      .map((d) => d.text);
    return waitsOn.length ? [{ task: t.text, waitsOn }] : [];
  });
}
