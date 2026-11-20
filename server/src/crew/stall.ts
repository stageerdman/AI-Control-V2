/* Stall alerts (pure; src/crew/dispatch.ts raises them, src/office/stall-alerts.ts delivers them). When work stops
   short — a task fails, is sent back the maximum number of times, stops as stuck, or its goal stops partway — the
   project's orchestrator hears it at once: why it stopped and what is already done, so they can pick the next step.
   A step limit that carries on in a fresh session is not a stall: nothing stopped. */
import type { ChecklistItem, Goal } from '../db/work.ts';
import { type Blocked, blockedBy, isSkipped } from '../domain/task-order.ts';
import { isStuckStop } from '../runtime/limits.ts';

export type StallKind = 'failed' | 'sent-back' | 'stuck' | 'goal-stopped';
export type DoneSoFar = {
  /** Tasks of the goal that are done. */
  finished: string[];
  /** Done tasks whose branch was merged into main. */
  merged: { task: string; branch: string }[];
  /** Branches where stopped work is kept. */
  kept: string[];
};
export type Stall = {
  projectId: string;
  goalId: string;
  /** The stopped task (null: the goal as a whole). */
  itemId: string | null;
  kind: StallKind;
  /** Why it stopped, in a few useful lines. */
  reason: string;
  /** The goal stopped with it (always, for 'goal-stopped'). */
  goalStopped: boolean;
  /** Tasks on hold, each naming the task(s) it depends on that didn't finish. */
  blocked: Blocked[];
  done: DoneSoFar;
};

/** How much failing output an alert carries: the useful tail, not the whole log. */
const MAX_LINES = 12;
const MAX_CHARS = 1500;
const SIGNAL =
  /error|fail|✗|×|expected|assert|exception|cannot|can't|couldn't|not found|denied|refused|stopped/i;

/** Failing build or test output, trimmed to the useful part: its error lines (or else its last lines), clipped. */
export function trimOutput(text: string): string {
  const lines = text
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l.trim());
  if (lines.length <= MAX_LINES) return clip(lines.join('\n'), MAX_CHARS);
  const signal = lines.filter((l) => SIGNAL.test(l));
  const kept = (signal.length ? signal : lines).slice(-MAX_LINES);
  return clip(['…', ...kept].join('\n'), MAX_CHARS);
}

/** The branch a stopped task's work was kept on (dispatch adds "work kept on branch …" to its note). */
export const keptBranch = (note: string | null): string | null =>
  /work kept on branch (\S+)/.exec(note ?? '')?.[1] ?? null;

/** What the goal has to show so far: finished and merged tasks, and where stopped work is kept. */
export function doneSoFar(goal: Goal): DoneSoFar {
  const done = goal.items.filter((i) => i.status === 'done');
  return {
    finished: done.map((i) => i.text),
    merged: done.flatMap((i) => (i.workspace ? [{ task: i.text, branch: i.workspace.branch }] : [])),
    kept: goal.items.flatMap((i) => keptBranch(i.note) ?? []),
  };
}

/** Why a failed task stopped, and which kind of stall that is. `maxSendBacks`: its workflow's limit. */
export function failedReason(it: ChecklistItem, maxSendBacks: number): { kind: StallKind; reason: string } {
  const note = (it.note ?? '').replace(/ — work kept on branch \S+$/, '').trim();
  if (it.sendBacks > maxSendBacks) {
    const last = it.reviews.findLast((r) => r.verdict === 'changes')?.notes ?? it.notes ?? '';
    return {
      kind: 'sent-back',
      reason: `Sent back ${it.sendBacks} times (the limit is ${maxSendBacks}). The reviewer's last notes: ${clip(last, MAX_CHARS)}`,
    };
  }
  if (isStuckStop(note)) return { kind: 'stuck', reason: `A limit was hit: ${trimOutput(note)}` };
  return { kind: 'failed', reason: note ? trimOutput(note) : 'It stopped without saying why.' };
}

/** Never started: still waiting on its dependencies, or held by dispatch because one didn't land. */
const notStarted = (i: ChecklistItem) =>
  (i.status === 'todo' && i.stage === 'build' && !i.buildRunId) ||
  (i.status === 'cancelled' && isSkipped(i.note));

/** Tasks on hold because a task they depend on stalled (failed, or `also`: a task stuck but still open). */
const blockedIn = (goal: Goal, also?: string) =>
  blockedBy(goal.items, notStarted, (d) => d.status === 'failed' || d.id === also);

/** A task stopped (failed, or `why` says how else it stalled). */
export function itemStall(
  goal: Goal,
  it: ChecklistItem,
  maxSendBacks: number,
  why?: { kind: StallKind; reason: string },
): Stall {
  const { kind, reason } = why ?? failedReason(it, maxSendBacks);
  return {
    projectId: goal.projectId,
    goalId: goal.id,
    itemId: it.id,
    kind,
    reason,
    goalStopped: false,
    blocked: blockedIn(goal, it.id),
    done: doneSoFar(goal),
  };
}

/** The goal stopped partway: each failed task's reason, and the tasks that never ran because they depend on one. */
export function goalStall(goal: Goal, maxSendBacks: number): Stall {
  const causes = goal.items
    .filter((i) => i.status === 'failed')
    .map((i) => `“${i.text}” ${label(failedReason(i, maxSendBacks))}`);
  return {
    projectId: goal.projectId,
    goalId: goal.id,
    itemId: null,
    kind: 'goal-stopped',
    reason: causes.join('\n') || 'It stopped without saying why.',
    goalStopped: true,
    blocked: blockedIn(goal),
    done: doneSoFar(goal),
  };
}

const label = ({ kind, reason }: { kind: StallKind; reason: string }) =>
  kind === 'sent-back'
    ? `was ${lower(reason)}`
    : kind === 'stuck'
      ? `got stuck: ${reason}`
      : `failed: ${reason}`;
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** One message per stop. A task's stop that also stopped its goal is one alert: the task's, saying the goal
    stopped with it (and what never started); the goal's own alert is for a goal that stops later (parallel work
    finished after the failure). Repeats of the same stop go. */
export function coalesce(stalls: Stall[]): Stall[] {
  const out: Stall[] = [];
  for (const s of stalls) {
    if (out.some((o) => o.goalId === s.goalId && o.itemId === s.itemId && o.kind === s.kind)) continue;
    out.push(s);
  }
  const goal = out.find((s) => s.kind === 'goal-stopped');
  const tasks = out.filter((s) => s.kind !== 'goal-stopped');
  if (!goal || !tasks.length) return out;
  return tasks.map((t, i) =>
    i === tasks.length - 1 ? { ...t, goalStopped: true, blocked: goal.blocked, done: goal.done } : t,
  );
}

const HEADLINE: Record<StallKind, string> = {
  failed: 'failed',
  'sent-back': 'was sent back the maximum number of times',
  stuck: 'stopped as stuck',
  'goal-stopped': 'stopped partway',
};
const quoted = (xs: string[]) => xs.map((t) => `“${t}”`).join(', ');

/** The message the orchestrator reads. `task`: the stopped task's text (null for the goal). */
export function stallText(s: Stall, goalText: string, task: string | null): string {
  const what = task ? `The task “${task}” on the goal “${goalText}”` : `The goal “${goalText}”`;
  const d = s.done;
  const done = [
    d.finished.length ? `Finished: ${quoted(d.finished)}.` : 'Nothing is finished yet.',
    d.merged.length
      ? `Merged into main: ${d.merged.map((m) => `“${m.task}” (${m.branch})`).join(', ')}.`
      : '',
    d.kept.length ? `Stopped work is kept on branch ${d.kept.join(', ')}.` : '',
  ].filter(Boolean);
  return [
    `AI Studio — stall alert: ${what} ${HEADLINE[s.kind]}.`,
    `Why: ${s.reason}`,
    task && s.goalStopped ? 'The goal stopped with it.' : '',
    s.blocked.length
      ? `On hold, because a task they depend on didn't finish: ${s.blocked.map((b) => `“${b.task}” (waits on ${quoted(b.waitsOn)})`).join(', ')}.`
      : '',
    `Done so far: ${done.join(' ')}`,
    'Pick the next step: continue it, hand it to someone else, change the plan, or ask the user.',
  ]
    .filter(Boolean)
    .join('\n');
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
