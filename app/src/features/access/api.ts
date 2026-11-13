/* Access endpoints (Key Cabinet + per-project grants). Values are write-only: they go out in a
   request body and never come back — responses carry only hasValue + last4. */
import { http } from '../../api/client';
import { studio } from '../../api/studio';
import type { Credential } from '../../api/types';

export type {
  AccessEntry,
  AccessSync,
  Credential,
  CredentialCreate,
  CredentialDeleted,
  ProjectAccess,
} from '../../api/types';

export type CredentialMeta = { name: string; serves: string; docsUrl: string | null; instructions: string };
export type ImportResult = { imported: Credential[]; refreshed: string[] };

export const accessApi = {
  list: studio.credentials.list,
  create: studio.credentials.create,
  update: (id: string, meta: Partial<CredentialMeta>) => studio.credentials.update(id, meta),
  replaceKey: studio.credentials.setValue,
  remove: studio.credentials.remove,
  importFromEnv: () => http.post<ImportResult>('/credentials/import'),
  project: studio.projects.access,
  setGrants: studio.projects.setAccess,
  sync: studio.projects.syncAccess,
};

/** Query keys (invalidate 'credentials' after any cabinet change; it also refreshes project grants). */
export const keys = {
  cabinet: 'credentials',
  project: (id: string) => `credentials:project:${id}`,
};
