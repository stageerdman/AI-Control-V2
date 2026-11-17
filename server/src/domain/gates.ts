/* A review gate: after `after`'s build work is done, `reviewer` checks it (`kind`) and approves it or sends it
   back. Shared by workflows (src/domain/workflows.ts) and their graphs (src/domain/graph.ts). */
import { z } from 'zod';

export const GATE_KINDS = ['quality', 'user-test', 'crash-test', 'security', 'review'] as const;
export type GateKind = (typeof GATE_KINDS)[number];
export const MAX_GATES = 8;

export const GateSchema = z.strictObject({
  after: z.string().trim().min(1).max(80),
  reviewer: z.string().trim().min(1).max(80),
  kind: z.enum(GATE_KINDS),
  why: z.string().trim().min(1).max(300),
});
export type Gate = z.output<typeof GateSchema>;
