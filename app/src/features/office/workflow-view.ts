/* Workflows on screen (updates/2026-11-17 WORKFLOWS - OPEN, Phase 5) — pure: no React, no fetching.
     chipOf      the goal's workflow chip: none for the usual way, plain for another stable one, dashed for temporary
     signoffView the task's sign-off strip: up to 3 faces + "+N", every state with a glyph and words
     signedLine  "Signed by A, B" on a done goal
     crewRings   the office's dashed rings: one per running goal under a temporary workflow */
import type { Goal, Signoff, SignoffState, TaskPerson } from '../../api';

export type WorkflowChipView = { name: string; temporary: boolean; lead: string | null };

/** `defaultId`: the project's first workflow (undefined = not known yet → only temporary ones show). */
export function chipOf(goal: Pick<Goal, 'workflow'>, defaultId: string | undefined): WorkflowChipView | null {
  const w = goal.workflow;
  if (!w) return null;
  if (w.temporary) return { name: w.name, temporary: true, lead: w.lead ?? null };
  if (!defaultId || w.id === defaultId) return null;
  return { name: w.name, temporary: false, lead: null };
}

export const MAX_FACES = 3;
const STATE_WORD: Record<SignoffState, string> = {
  pending: 'not signed yet',
  signed: 'signed',
  'sent-back': 'sent it back',
};
export type SignoffFace = { key: string; person: TaskPerson; state: SignoffState; label: string };
export type SignoffStripView = { faces: SignoffFace[]; more: number; label: string };

/** null = no reviewer on this task: no strip at all. */
export function signoffView(signoffs: Signoff[] | undefined): SignoffStripView | null {
  if (!signoffs?.length) return null;
  const all = signoffs.map((s, i) => ({
    key: `${i}:${s.reviewer.id}`,
    person: s.reviewer,
    state: s.state,
    label: `${s.reviewer.name}: ${STATE_WORD[s.state]}`,
  }));
  return {
    faces: all.slice(0, MAX_FACES),
    more: Math.max(0, all.length - MAX_FACES),
    label: `Sign-offs: ${all.map((f) => f.label).join(', ')}`,
  };
}

/** "Signed by Health Analyst, Humanitarian" — done goals with anyone who signed; else null. */
export function signedLine(goal: Pick<Goal, 'status' | 'signedBy'>): string | null {
  if (goal.status !== 'done' || !goal.signedBy?.length) return null;
  return `Signed by ${goal.signedBy.map((p) => p.name).join(', ')}`;
}

export type CrewRing = { goalId: string; label: string; lead: string; crew: string[] };

/** One ring per running goal whose workflow is temporary (lead + crew); the label is the goal, short. */
export function crewRings(goals: Goal[]): CrewRing[] {
  const out: CrewRing[] = [];
  for (const g of goals) {
    const w = g.workflow;
    if (g.status !== 'running' || !w?.temporary || !w.lead) continue;
    const crew = (w.crew ?? []).filter((c) => c !== w.lead);
    out.push({ goalId: g.id, label: short(g.text, 40), lead: w.lead, crew });
  }
  return out;
}

const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
