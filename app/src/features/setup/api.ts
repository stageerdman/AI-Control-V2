/* Setup-space endpoints beyond api/studio.ts (drafts CRUD/chat/accept/finish live there). */
import { type Draft, http, type SetupStep } from '../../api';

/** GET /sandbox/folders — top-level sandbox folders not yet under AI Studio (the Adopt picker). */
export type SandboxFolder = {
  folder: string;
  git: boolean;
  marked: boolean;
  /** G3: its first remote (credentials stripped); an adopted folder keeps it. */
  remote?: { url: string; github: string | null } | null;
};
export const sandboxFolders = () => http.get<SandboxFolder[]>('/sandbox/folders');
/** Where the sandbox lives (for the path under the tile). */
export const sandboxPath = () =>
  http.get<{ paths: { sandbox: string } }>('/health').then((h) => h.paths.sandbox);

/** POST /drafts/:id/setup — the Project Setter sets the draft's folder up (idempotent; steps stream on the draft). */
export type SetupResult = { draft: Draft; steps: SetupStep[]; commit: string | null };
export const setupDraft = (id: string) => http.post<SetupResult>(`/drafts/${encodeURIComponent(id)}/setup`);
