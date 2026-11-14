/* Blueprint endpoints. The modules are read-only here — their source is <AI Control home>/modules. */
import { http } from '../../api/client';
import { studio } from '../../api/studio';
import type { ScaffoldReport } from '../../api/types';

export type BlueprintModule = {
  name: string;
  /** The module file's first line. */
  description: string;
  /** The markdown text (from `# Title`). */
  body: string;
  /** File mtime (ISO) — compared with each project's compile date. */
  updatedAt: string | null;
};
export type TreeEntry = { path: string; kind: 'file' | 'dir'; desc: string };
export type Blueprint = { modulesDir: string; modules: BlueprintModule[]; tree: TreeEntry[] };
export type Scaffold = ScaffoldReport & { claudeMdGenerated?: string | null };

export const blueprintApi = {
  get: () => http.get<Blueprint>('/blueprint'),
  scaffold: (projectId: string) => studio.projects.scaffold(projectId) as Promise<Scaffold>,
  projects: studio.projects.list,
  /** POST /projects/:id/claude-md/rebuild — 409 (no "## Project-specific rules", no CLAUDE.md) is said as-is. */
  rebuild: studio.projects.rebuildClaudeMd,
};

export const keys = { blueprint: 'blueprint', scaffold: (id: string) => `blueprint:scaffold:${id}` };
