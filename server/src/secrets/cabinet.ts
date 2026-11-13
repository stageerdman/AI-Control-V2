/* The Key Cabinet: credentials saved once, granted per project. Metadata goes to
   the db, the VALUE only to the SecretStore (global .env). Values are write-only:
   nothing here ever returns one — callers get `hasValue` + `last4`. */
import type { Credential, CredentialMeta, ValueInfo } from '../db/credentials.ts';
import type { Store } from '../db/store.ts';
import { slugify } from '../domain/ids.ts';
import { invalid } from '../errors.ts';
import { ENV_KEY } from './dotenv.ts';
import type { SecretStore } from './secretStore.ts';

/** Shorter values show nothing: 4 of 11 characters is too much of a secret. */
export const MIN_LEN_FOR_LAST4 = 12;

export function valueInfo(value: string | undefined): ValueInfo {
  if (!value) return { hasValue: false, last4: null };
  return { hasValue: true, last4: value.length >= MIN_LEN_FOR_LAST4 ? value.slice(-4) : null };
}

/** "GitHub" → GITHUB, "Open AI key" → OPEN_AI_KEY. */
export function toEnvVar(name: string): string {
  const v = slugify(name, 'key').toUpperCase().replace(/-/g, '_');
  return /^[0-9]/.test(v) ? `_${v}` : v;
}

export type CredentialCreate = CredentialMeta & { envVar?: string; value?: string };
export type CredentialDeleted = {
  deleted: { kind: 'credential'; id: string };
  /** Credential deletes can't be undone: an undo snapshot would have to keep the value. */
  restorable: false;
  /** Projects that had it granted — their .env still holds it until the next sync. */
  projectIds: string[];
};
export type ImportResult = { imported: Credential[]; refreshed: string[] };

export function cabinet(store: Store, secrets: SecretStore) {
  const repo = store.credentials;
  return {
    list: () => repo.list(),
    get: (id: string) => repo.require(id),

    /** With `value`: saves it to the global .env. Without: adopts whatever the .env already has. */
    create(input: CredentialCreate): Credential {
      const { envVar: rawVar, value, ...meta } = input;
      const envVar = rawVar ?? toEnvVar(meta.name);
      if (!ENV_KEY.test(envVar)) throw invalid('Invalid env var name', { envVar });
      return store.tx(() => {
        const info = valueInfo(value ?? secrets.get(envVar));
        const c = repo.create(meta, envVar, info);
        if (value !== undefined) secrets.set(envVar, value); // throws → db rolls back
        return c;
      });
    },

    update: (id: string, patch: Partial<CredentialMeta>) => store.tx(() => repo.update(id, patch)),

    /** Replace key: write-only — the old value is never shown, only overwritten. */
    replaceValue(id: string, value: string): Credential {
      return store.tx(() => {
        const c = repo.setValueInfo(id, valueInfo(value));
        secrets.set(c.envVar, value);
        return c;
      });
    },

    remove(id: string): CredentialDeleted {
      return store.tx(() => {
        const c = repo.require(id);
        repo.remove(id);
        secrets.delete(c.envVar);
        return { deleted: { kind: 'credential', id }, restorable: false, projectIds: c.projectIds };
      });
    },

    /** Register every key in the global .env that the cabinet doesn't know yet (masked),
        and refresh hasValue/last4 of the ones it does (the file may have been hand-edited). */
    importFromEnv(): ImportResult {
      return store.tx(() => {
        const imported: Credential[] = [];
        const refreshed: string[] = [];
        for (const envVar of secrets.keys()) {
          const info = valueInfo(secrets.get(envVar));
          const known = repo.byEnvVar(envVar);
          if (!known) imported.push(repo.create({ name: envVar }, envVar, info));
          else if (known.hasValue !== info.hasValue || known.last4 !== info.last4) {
            repo.setValueInfo(known.id, info);
            refreshed.push(known.id);
          }
        }
        for (const c of repo.list()) {
          if (c.hasValue && secrets.get(c.envVar) === undefined) {
            repo.setValueInfo(c.id, valueInfo(undefined));
            refreshed.push(c.id);
          }
        }
        return { imported: imported.map((c) => repo.require(c.id)), refreshed };
      });
    },
  };
}
export type Cabinet = ReturnType<typeof cabinet>;
