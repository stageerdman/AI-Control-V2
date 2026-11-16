/* The whiteboard as the director's tools answer it (text, for the model): goals with their ids, each task
   with its place, owner and status. present.ts is the screens' JSON view. */
import type { ChecklistItem, Goal } from '../db/work.ts';

const STATUS: Record<ChecklistItem['status'], string> = {
  todo: 'queued',
  running: 'running now',
  done: 'done',
  failed: 'did not finish',
  cancelled: 'stopped',
};
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function taskLine(it: ChecklistItem, name: (id: string) => string): string {
  const flags = [it.parallel ? 'parallel' : '', it.report ? 'report' : ''].filter(Boolean).join(', ');
  return `  ${it.position + 1}. [${STATUS[it.status]}] ${clip(it.text, 200)} — ${name(it.agentId)}${flags ? ` (${flags})` : ''}  id: ${it.id}`;
}

export function goalBlock(g: Goal, name: (id: string) => string): string {
  return [
    `Goal ${g.id} [${g.status}, ${g.pct}% done, updated ${g.updatedAt.slice(0, 10)}]: ${clip(g.text, 300)}`,
    ...(g.summary && g.summary !== g.text ? [`  Plan: ${clip(g.summary, 300)}`] : []),
    ...(g.featureId
      ? [`  Feature: ${g.featureId}${g.ships ? ' (ships when this goal is done)' : ' (one step of it)'}`]
      : []),
    ...(g.items.length ? g.items.map((i) => taskLine(i, name)) : ['  (no tasks)']),
  ].join('\n');
}

export function boardText(goals: Goal[], name: (id: string) => string): string {
  return goals.length ? goals.map((g) => goalBlock(g, name)).join('\n\n') : 'The whiteboard is empty.';
}
