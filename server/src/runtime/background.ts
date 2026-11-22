/* Background commands an agent left running when it answered (Bash run_in_background).
   Sea GPS live: the agent started its e2e tests in the background and answered "the full e2e is still running,
   I'll pick up again when it finishes" — the studio stopped the CLI 10s later, killing the tests, and the item
   failed review after review. The CLI itself wakes the model when a background command ends (even with stdin
   closed), so a run whose answer says it waits is kept alive until then, up to a clear limit. Pure: no I/O here. */
import type { Activity } from './runner.ts';

export type BackgroundTask = { id: string; description: string };

/** How long a run may wait for its background commands before it is stopped (and Pixel told why). */
export const BACKGROUND_WAIT_MS = 45 * 60_000;

const WAITS = [
  /\bstill running\b/i,
  /\b(?:running )?in the background\b/i,
  /\b(?:once|when|after) (?:it|they|that|this|the [\w\s-]{1,40}?) (?:finish(?:es)?|complete[sd]?|(?:is|are) done|pass(?:es)?|end[s]?)\b/i,
  /\bpick (?:it |this |that )?(?:back )?up\b/i,
  /\bI'?(?:ll| will) (?:continue|carry on|resume|check back)\b/i,
  /\bwait(?:ing)? (?:for|on|until)\b/i,
];

/** The answer says the agent means to carry on once its background commands end. */
export const waitsForBackground = (answer: string): boolean => WAITS.some((w) => w.test(answer));

/** What the office shows over the desk while the run waits. */
export const waitingActivity = (tasks: readonly BackgroundTask[]): Activity => ({
  kind: 'waiting',
  label: 'Waiting for its background tests to finish',
  ...(tasks.length ? { detail: tasks.map((t) => t.description).join('\n') } : {}),
});

const named = (tasks: readonly BackgroundTask[]) =>
  tasks.length ? ` (${tasks.map((t) => t.description || t.id).join(', ')})` : '';

const count = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;
const duration = (ms: number) =>
  ms >= 60_000
    ? count(Math.round(ms / 60_000), 'minute')
    : count(Math.max(1, Math.round(ms / 1000)), 'second');

/** The runner's own words when a wait runs out (`tasks`: those still running) — limits.ts reads it as a stall,
    so Pixel hears why. */
export const backgroundTimeoutError = (ms: number, tasks: readonly BackgroundTask[]): string =>
  tasks.length
    ? `Stopped: waited ${duration(ms)} for its background command${tasks.length === 1 ? '' : 's'}${named(tasks)} to finish; they never did.`
    : `Stopped: waited ${duration(ms)} for its background commands and its answer after them; the answer never came.`;
