/* A review gate: after `after`'s build work is done, `reviewer` checks it (`kind`) and approves it or sends it
   back. In the workflow editor a gate is a sign-off arrow; `when` is its soft branch label ("only if it touches
   the UI") — words for the orchestrator, not a condition the server evaluates. */
import { z } from 'zod';

export const GATE_KINDS = ['quality', 'user-test', 'crash-test', 'security', 'review'] as const;
export type GateKind = (typeof GATE_KINDS)[number];
export const MAX_GATES = 8;

/** A soft branch label on an arrow (gate or step). */
export const BranchLabel = z.string().trim().min(1).max(120);

/** Said when an arrow is drawn without a reason, so review prompts still read one. */
export const DEFAULT_WHY: Record<GateKind | 'hand-off', string> = {
  'hand-off': 'Hands the work on',
  review: 'Checks it',
  quality: 'Checks the quality',
  'user-test': 'Tries it as a user',
  'crash-test': 'Tries to break it',
  security: 'Checks it’s safe',
};

/** A reason that may be left out or empty (the editor's why is optional). */
export const OptionalWhy = z.string().trim().max(300).optional();

export const GateSchema = z
  .strictObject({
    after: z.string().trim().min(1).max(80),
    reviewer: z.string().trim().min(1).max(80),
    kind: z.enum(GATE_KINDS),
    why: OptionalWhy,
    when: BranchLabel.optional(),
  })
  .transform(({ why, ...g }) => ({ ...g, why: why || DEFAULT_WHY[g.kind] }));
export type Gate = z.output<typeof GateSchema>;
