/* The collaboration design (B8) grew into workflows (src/domain/workflows.ts): the model lives there and is
   re-exported here so older imports keep working. What stays here is the review side: what each kind of
   reviewer looks for, and reading their verdict. */
import type { GateKind } from './workflows.ts';

export {
  type Collaboration,
  CollaborationSchema,
  collaborationIssues,
  DEFAULT_MAX_SEND_BACKS,
  GATE_KINDS,
  type Gate,
  type GateKind,
  GateSchema,
  gatesFor,
  type ItemGate,
  MAX_GATES,
  resolvePlaceholders,
  type Staffing,
} from './workflows.ts';

/** What each kind of reviewer looks for (their review task). */
export const GATE_FOCUS: Record<GateKind, string> = {
  quality:
    'Quality gate: is the code correct, modular, clean and simple — no duplication, no dead code, nothing beyond the brief? Do the project’s own checks/tests pass?',
  'user-test':
    'User-tester gate: use the result the way a real user would. Is it understandable, does it do what the brief promised, is anything confusing or broken from a user’s point of view?',
  'crash-test':
    'Crash-tester gate: try hard to break it — odd inputs, empty states, edge cases, rapid repeats. Report what crashes or misbehaves.',
  security:
    'Security gate: look for leaked secrets, unsafe input handling, injection, over-broad access. Report concrete risks only.',
  review: 'Review gate: does the work meet the brief and the project’s rules (CLAUDE.md)?',
};

export type Verdict = { verdict: 'approve' | 'changes'; notes: string };

/** A reviewer's verdict from their final reply: the last `{"verdict": …, "notes": …}` object in it; failing
    that, a plain APPROVE / CHANGES word. Anything unclear counts as changes, with their reply as the notes
    (a review that doesn't say "approve" never lets work through; send-backs are bounded anyway). */
export function parseVerdict(reply: string): Verdict {
  const text = reply.trim();
  /* whole JSON lines first: notes may quote code with braces ({ok:false}) — F1c live: a brace-free match missed
     a clear approve and cost a send-back round */
  const lines = text
    .split('\n')
    .map((l) => l.trim().replace(/^`+|`+$/g, ''))
    .filter((l) => l.startsWith('{') && l.endsWith('}') && l.includes('"verdict"'));
  const objects = [...(text.match(/\{[^{}]*"verdict"[^{}]*\}/g) ?? []), ...lines];
  for (const raw of objects.reverse()) {
    try {
      const v = JSON.parse(raw) as { verdict?: unknown; notes?: unknown };
      const verdict = String(v.verdict ?? '').toLowerCase();
      const notes = typeof v.notes === 'string' ? v.notes.trim() : '';
      if (/^approve/.test(verdict)) return { verdict: 'approve', notes };
      if (/^(changes|send.?back|reject)/.test(verdict))
        return { verdict: 'changes', notes: notes || 'Changes requested (no notes given).' };
    } catch {
      /* next */
    }
  }
  const prose = text.replace(/\{[^{}]*"verdict"[^{}]*\}/g, '').trim();
  if (/\bAPPROVED?\b/.test(text) && !/\bCHANGES\b/.test(text)) return { verdict: 'approve', notes: prose };
  return { verdict: 'changes', notes: prose || 'The review ended without a clear verdict.' };
}
