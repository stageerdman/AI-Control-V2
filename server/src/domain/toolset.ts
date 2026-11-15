/* An agent's working tools: what it may change and run, beyond reading (every agent reads).
   Stored per agent; null = the studio's full kit (edit anything, the studio shell). Pure data —
   the runtime maps it to Claude Code permissions (src/runtime/permissions.ts). */
import { z } from 'zod';

/** Project-relative path globs an agent may create or change files in (e.g. `updates/**`). */
const pathGlob = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .refine((p) => !p.startsWith('/') && !p.split('/').includes('..'), 'Paths stay inside the project');

export const ToolsetSchema = z.object({
  /** 'any' = every file in the project, 'none' = read only, or only where these globs match. */
  edit: z.union([z.enum(['any', 'none']), z.array(pathGlob).min(1).max(8)]),
  /** 'studio' = the studio shell (git, npm, node…), 'git' = git only, 'none' = no shell. */
  shell: z.enum(['studio', 'git', 'none']),
  /** Web search and fetch. */
  web: z.boolean(),
  /** What it works with, in plain words for the Cast (the design card's "works with" line). */
  works: z.array(z.string().trim().min(1).max(120)).max(8),
});
export type Toolset = z.infer<typeof ToolsetSchema>;
export type EditScope = Toolset['edit'];
