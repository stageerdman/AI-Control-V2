/* The whiteboard as the director's tools answer it (text, for the model): goals with their ids, each task
   with its place, owner and status. present.ts is the screens' JSON view. */
import type { ChecklistItem, Goal } from '../db/work.ts';
import { notDefault } from '../domain/workflows.ts';

const STATUS: Record<ChecklistItem['status'], string> = {
  todo: 'queued',
  running: 'running now',
  done: 'done',
  failed: 'did not finish',
  cancelled: 'stopped',
};
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Who reads the board: names, the project's usual workflow (a goal under another one says which), and the
    director — a queued task of theirs was handed back to them and never starts until it has a new owner. */
export type BoardReader = { name: (id: string) => string; usualId: string; directorId: string };

export const waitsForOwner = (it: ChecklistItem, directorId: string): boolean =>
  it.status === 'todo' && it.agentId === directorId;

function taskLine(it: ChecklistItem, r: BoardReader): string {
  const flags = [it.parallel ? 'parallel' : '', it.report ? 'report' : ''].filter(Boolean).join(', ');
  const status = waitsForOwner(it, r.directorId) ? 'waiting for a new owner' : STATUS[it.status];
  return `  ${it.position + 1}. [${status}] ${clip(it.text, 200)} — ${r.name(it.agentId)}${flags ? ` (${flags})` : ''}  id: ${it.id}`;
}

export function goalBlock(g: Goal, r: BoardReader): string {
  const w = notDefault(g.workflow, r.usualId);
  return [
    `${g.quest === 'side' ? 'Side quest' : 'Goal'} ${g.id} [${g.status}, ${g.pct}% done, updated ${g.updatedAt.slice(0, 10)}]: ${clip(g.text, 300)}${w ? ` (workflow: ${w.name})` : ''}`,
    ...(g.summary && g.summary !== g.text ? [`  Plan: ${clip(g.summary, 300)}`] : []),
    ...(g.featureId
      ? [`  Feature: ${g.featureId}${g.ships ? ' (ships when this goal is done)' : ' (one step of it)'}`]
      : []),
    ...(g.items.length ? g.items.map((i) => taskLine(i, r)) : ['  (no tasks)']),
  ].join('\n');
}

export function boardText(goals: Goal[], r: BoardReader): string {
  return goals.length ? goals.map((g) => goalBlock(g, r)).join('\n\n') : 'The whiteboard is empty.';
}

const RECENT_ENDED = 3;

/** The board as it is this moment, short: active goals in full, then the last few that ended, one line each —
    read fresh on every call, so a finished or stopped goal never lingers as current. */
export function boardNow(goals: Goal[], r: BoardReader): string {
  const active = goals.filter((g) => g.status === 'running');
  const ended = goals.filter((g) => g.status !== 'running').slice(0, RECENT_ENDED);
  return [
    active.length ? active.map((g) => goalBlock(g, r)).join('\n\n') : 'No goal is active.',
    ...(ended.length
      ? [`Ended lately: ${ended.map((g) => `${clip(g.text, 120)} [${g.status}]`).join('; ')}`]
      : []),
  ].join('\n');
}
