/* Handing a checklist item to a new owner (pure rules; src/crew/dispatch.ts applies them).
   The item keeps its checkout (its branch, with whatever was committed) and its review history; everything that
   ties it to the old owner's sessions goes, so the new owner builds in their own session and every later review
   looks at the new owner's work on that branch. */
import type { ChecklistItem, ItemPatch } from '../db/work.ts';
import { holder } from '../whiteboard/people.ts';

/** How a handover lands, by the item's status:
    - `keep`: done — the finished work changes hands as it is, nothing reruns;
    - `later`: running — the owner changes now; the live run ends as the old owner's and the item restarts then;
    - `now`: queued or stopped — the new owner's fresh build is queued at once. */
export type HandoverMode = 'keep' | 'later' | 'now';

export function handoverMode(it: Pick<ChecklistItem, 'status'>): HandoverMode {
  if (it.status === 'done') return 'keep';
  return it.status === 'running' ? 'later' : 'now';
}

/** Forget the old owner's sessions (a rework or carry-on would resume them as the new owner). */
export const dropSessions = {
  buildRunId: null,
  resumeRunId: null,
  continues: 0,
} satisfies Omit<ItemPatch, 'status'>;

/** A fresh build for the new owner in the same checkout: back to the first gate, no send-backs or merge tries. */
export const freshBuild = (): ItemPatch => ({
  status: 'todo',
  runId: null,
  ...dropSessions,
  stage: 'build',
  gateIndex: 0,
  sendBacks: 0,
  notes: null,
  mergeTries: 0,
  teamPhase: null,
});

const HANDED = 'Handed over by ';
/** The item's note when a builder hands it on: what the new owner reads in their build task. */
export const handoverNote = (byName: string, request: string): string => `${HANDED}${byName}: ${request}`;
/** The note the new owner builds from, or '' when the item's note is something else (a result, a failure). */
export const handoverLine = (note: string | null): string => (note?.startsWith(HANDED) ? note : '');

/** A run whose agent no longer holds its item: its item changed hands while it ran (its result isn't theirs). */
export const outlivedOwner = (it: ChecklistItem, runAgentId: string): boolean => holder(it) !== runAgentId;
