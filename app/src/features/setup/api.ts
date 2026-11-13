/* Setup-space endpoints beyond api/studio.ts (drafts CRUD/chat/accept/finish live there). */
import { http } from '../../api';

/** GET /sandbox/folders — top-level sandbox folders not yet under AI Studio (the Adopt picker). */
export type SandboxFolder = { folder: string; git: boolean; marked: boolean };
export const sandboxFolders = () => http.get<SandboxFolder[]>('/sandbox/folders');
/** Where the sandbox lives (for the path under the tile). */
export const sandboxPath = () =>
  http.get<{ paths: { sandbox: string } }>('/health').then((h) => h.paths.sandbox);
