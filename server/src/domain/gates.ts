/* A review gate: after `after`'s build work is done, `reviewer` checks it (`kind`) and approves it or sends it
   back. In the workflow editor a gate is a sign-off arrow; `when` is its soft branch label ("only if it touches
   the UI") — words for the orchestrator, not a condition the server evaluates. */
import { z } from 'zod';

export const GATE_KINDS = ['quality', 'user-test', 'crash-test', 'security', 'review'] as const;
export type GateKind = (typeof GATE_KINDS)[number];
export const MAX_GATES = 8;

/** A soft branch label on an arrow (gate or step). */
export const BranchLabel = z.string().trim().min(1).max(120);

export const GateSchema = z.strictObject({
  after: z.string().trim().min(1).max(80),
  reviewer: z.string().trim().min(1).max(80),
  kind: z.enum(GATE_KINDS),
  why: z.string().trim().min(1).max(300),
  when: BranchLabel.optional(),
});
export type Gate = z.output<typeof GateSchema>;
