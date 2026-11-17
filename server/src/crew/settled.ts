/* What the orchestrator's thread says when a goal settles (WORKFLOWS phase 4). Pure.
   - A temporary crew that finished well: the offer to keep its way of working.
   - A done goal whose work was signed off: who signed it.
   Anything else stays quiet — the whiteboard already shows it. */
import type { Goal } from '../db/work.ts';
import { signedBy } from '../domain/workflows.ts';

const list = (names: string[]) =>
  names.length < 2 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;

/** The thread line for a goal that just settled; null = nothing worth saying. `name`: agent id → name. */
export function settledLine(g: Goal, name: (id: string) => string): string | null {
  if (g.status !== 'done') return null;
  const signers = signedBy(g).map(name);
  const signed = signers.length ? ` Signed by ${signers.join(', ')}.` : '';
  const lead = g.workflow?.lead;
  if (lead) {
    const crew = (g.workflow?.crew ?? []).map(name);
    return `${name(lead)}'s crew finished '${g.text}'. Keep this way of working? I can save its checks as a workflow, or make ${list([name(lead), ...crew])} a team.${signed}`;
  }
  return signed ? `'${g.text}' is done.${signed}` : null;
}
