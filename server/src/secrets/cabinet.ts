/* The cabinet (G1): accesses saved once, granted per project. An access is a named bundle of
   fields; each field's VALUE goes only to the SecretStore (global .env), its metadata to the db.
   Secret values are write-only: nothing here ever returns one — callers get `hasValue` + `last4`.
   A field marked `secret: false` (a username, a URL) carries its `value` so the UI can show it.

   The B3 Key Cabinet (`/credentials`) is a thin view over this: a credential = an access read
   through its first field. */
import type { AccessInfo, AccessMeta, FieldMeta, ValueInfo } from '../db/accesses.ts';
import type { Store } from '../db/store.ts';
import { slugify } from '../domain/ids.ts';
import { invalid, notFound } from '../errors.ts';
import { ENV_KEY } from './dotenv.ts';
import { checkFolder, type FolderGuard } from './folderAccess.ts';
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

export type AccessField = Omit<FieldMeta, 'createdAt'> & {
  /** Only on a non-secret field that has a value. */
  value?: string;
};
export type Access = Omit<AccessMeta, 'fields'> & { fields: AccessField[] };
export type FieldCreate = { label: string; envVar?: string; secret?: boolean; value?: string };
/** `folder`: a folder access (read and write), checked by the folder guard; its fields may be empty. */
export type AccessCreate = AccessInfo & { fields: FieldCreate[]; folder?: string };
export type FieldPatch = { label?: string; envVar?: string; secret?: boolean };
export type AccessDeleted = {
  deleted: { kind: 'access'; id: string };
  /** Access deletes can't be undone: an undo snapshot would have to keep the values. */
  restorable: false;
  /** Projects that had it granted — their .env still holds its fields until the next sync. */
  projectIds: string[];
};
export type ImportResult = { imported: Access[]; refreshed: string[] };

/** B3 shape: an access read through its first field. */
export type Credential = {
  id: string;
  name: string;
  envVar: string;
  serves: string;
  docsUrl: string | null;
  instructions: string;
  hasValue: boolean;
  last4: string | null;
  projectIds: string[];
  createdAt: string;
  updatedAt: string;
};
export type CredentialCreate = AccessInfo & { envVar?: string; value?: string };
export type CredentialDeleted = Omit<AccessDeleted, 'deleted'> & {
  deleted: { kind: 'credential'; id: string };
};

/** What changed, for the projects it is granted to (ids only, never a value). */
export type AccessNotice = {
  accessId: string;
  change: 'updated' | 'deleted' | 'granted' | 'revoked';
  projectIds: string[];
};

const checkEnvVar = (envVar: string) => {
  if (!ENV_KEY.test(envVar)) throw invalid('Invalid env var name', { envVar });
};

export function cabinet(
  store: Store,
  secrets: SecretStore,
  opts: { notify?: (n: AccessNotice) => void; folders?: FolderGuard } = {},
) {
  const repo = store.accesses;
  const notify = (accessId: string, change: AccessNotice['change'], projectIds: string[]) => {
    if (projectIds.length) opts.notify?.({ accessId, change, projectIds });
  };
  const show = (a: AccessMeta): Access => ({
    ...a,
    fields: a.fields.map(({ createdAt: _c, ...f }) => {
      if (f.secret || !f.hasValue) return f;
      const value = secrets.get(f.envVar);
      return value === undefined ? f : { ...f, value };
    }),
  });
  const asCredential = (a: AccessMeta): Credential => {
    const f = a.fields[0];
    if (!f) throw notFound('Credential', a.id);
    return {
      id: a.id,
      name: a.name,
      envVar: f.envVar,
      serves: a.serves,
      docsUrl: a.docsUrl,
      instructions: a.instructions,
      hasValue: f.hasValue,
      last4: f.last4,
      projectIds: a.projectIds,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    };
  };
  /** Write values after the db rows (inside the tx); a failing write takes back the ones already written. */
  const writeAll = (pairs: [string, string][]) => {
    const done: string[] = [];
    try {
      for (const [k, v] of pairs) {
        secrets.set(k, v);
        done.push(k);
      }
    } catch (e) {
      for (const k of done) secrets.delete(k);
      throw e;
    }
  };

  const guardedFolder = (folder: string) => {
    if (!opts.folders) throw invalid('This cabinet takes no folder accesses', { folder });
    return checkFolder(folder, opts.folders);
  };

  function create(input: AccessCreate, idPrefix = 'a'): AccessMeta {
    const { fields, folder, ...rest } = input;
    const info = folder === undefined ? rest : { ...rest, folder: guardedFolder(folder) };
    const planned = fields.map((f) => {
      const envVar = f.envVar ?? toEnvVar(`${info.name} ${f.label}`);
      checkEnvVar(envVar);
      return { f, envVar };
    });
    return store.tx(() => {
      const a = repo.create(
        info,
        planned.map(({ f, envVar }) => ({
          field: { label: f.label, envVar, secret: f.secret ?? true },
          value: valueInfo(f.value ?? secrets.get(envVar)),
        })),
        idPrefix,
      );
      writeAll(
        planned.flatMap(({ f, envVar }) =>
          f.value === undefined ? [] : [[envVar, f.value] as [string, string]],
        ),
      );
      return a;
    });
  }

  function remove(id: string): AccessMeta {
    return store.tx(() => {
      const a = repo.require(id);
      repo.remove(id);
      for (const f of a.fields) secrets.delete(f.envVar);
      return a;
    });
  }

  function setValue(accessId: string, fieldId: string, value: string): AccessMeta {
    return store.tx(() => {
      const f = repo.field(accessId, fieldId);
      repo.setValueInfo(fieldId, valueInfo(value));
      secrets.set(f.envVar, value);
      return repo.require(accessId);
    });
  }

  const svc = {
    list: () => repo.list().map(show),
    get: (id: string) => show(repo.require(id)),

    /** With a field `value`: saves it to the global .env. Without: adopts whatever the .env already has. */
    create: (input: AccessCreate): Access => show(create(input)),

    update(id: string, patch: Partial<AccessInfo>): Access {
      const a = store.tx(() => repo.update(id, patch));
      notify(id, 'updated', a.projectIds);
      return show(a);
    },

    remove(id: string): AccessDeleted {
      const a = remove(id);
      notify(id, 'deleted', a.projectIds);
      return { deleted: { kind: 'access', id }, restorable: false, projectIds: a.projectIds };
    },

    addField(accessId: string, f: FieldCreate): Access {
      const a = store.tx(() => {
        const access = repo.require(accessId);
        const envVar = f.envVar ?? toEnvVar(`${access.name} ${f.label}`);
        checkEnvVar(envVar);
        repo.addField(
          accessId,
          { label: f.label, envVar, secret: f.secret ?? true },
          valueInfo(f.value ?? secrets.get(envVar)),
        );
        if (f.value !== undefined) secrets.set(envVar, f.value);
        return repo.require(accessId);
      });
      notify(accessId, 'updated', a.projectIds);
      return show(a);
    },

    /** Rename (label), move to another env var (the value moves with it), or flip secret. */
    updateField(accessId: string, fieldId: string, patch: FieldPatch): Access {
      if (patch.envVar !== undefined) checkEnvVar(patch.envVar);
      const a = store.tx(() => {
        const before = repo.field(accessId, fieldId);
        repo.updateField(accessId, fieldId, patch);
        if (patch.envVar !== undefined && patch.envVar !== before.envVar) {
          const v = secrets.get(before.envVar);
          if (v !== undefined) {
            secrets.set(patch.envVar, v);
            secrets.delete(before.envVar);
          }
        }
        return repo.require(accessId);
      });
      notify(accessId, 'updated', a.projectIds);
      return show(a);
    },

    removeField(accessId: string, fieldId: string): Access {
      const a = store.tx(() => {
        const f = repo.field(accessId, fieldId);
        repo.removeField(accessId, fieldId);
        secrets.delete(f.envVar);
        return repo.require(accessId);
      });
      notify(accessId, 'updated', a.projectIds);
      return show(a);
    },

    /** Replace a field's value: write-only for secret fields — the old one is never shown, only overwritten. */
    setValue: (accessId: string, fieldId: string, value: string): Access =>
      show(setValue(accessId, fieldId, value)),

    /** Register every key in the global .env that no field knows yet (one-field access, secret),
        and refresh hasValue/last4 of the ones it does (the file may have been hand-edited). */
    importFromEnv(): ImportResult {
      return store.tx(() => {
        const imported: string[] = [];
        const refreshed = new Set<string>();
        for (const envVar of secrets.keys()) {
          const info = valueInfo(secrets.get(envVar));
          const known = repo.byEnvVar(envVar);
          if (!known)
            imported.push(
              repo.create(
                { name: envVar },
                [{ field: { label: 'Key', envVar, secret: true }, value: info }],
                'c',
              ).id,
            );
          else if (known.field.hasValue !== info.hasValue || known.field.last4 !== info.last4) {
            repo.setValueInfo(known.field.id, info);
            refreshed.add(known.access.id);
          }
        }
        for (const f of repo.allFields()) {
          if (f.hasValue && secrets.get(f.envVar) === undefined) {
            repo.setValueInfo(f.id, valueInfo(undefined));
            const owner = repo.byEnvVar(f.envVar);
            if (owner) refreshed.add(owner.access.id);
          }
        }
        return { imported: imported.map((id) => show(repo.require(id))), refreshed: [...refreshed] };
      });
    },

    /* ------------------------------------------------ B3 Key Cabinet (/credentials) */
    credentials: {
      /* a folder access without fields has no key to read it through */
      list: () =>
        repo
          .list()
          .filter((a) => a.fields.length)
          .map(asCredential),
      get: (id: string) => asCredential(repo.require(id)),
      create: ({ envVar, value, ...info }: CredentialCreate): Credential =>
        asCredential(
          create(
            {
              ...info,
              fields: [
                {
                  label: 'Key',
                  envVar: envVar ?? toEnvVar(info.name),
                  ...(value === undefined ? {} : { value }),
                },
              ],
            },
            'c',
          ),
        ),
      update: (id: string, patch: Partial<AccessInfo>) =>
        asCredential(store.tx(() => repo.update(id, patch))),
      replaceValue(id: string, value: string): Credential {
        const f = repo.require(id).fields[0] as FieldMeta;
        return asCredential(setValue(id, f.id, value));
      },
      remove(id: string): CredentialDeleted {
        const a = remove(id);
        notify(id, 'deleted', a.projectIds);
        return { deleted: { kind: 'credential', id }, restorable: false, projectIds: a.projectIds };
      },
      importFromEnv(): { imported: Credential[]; refreshed: string[] } {
        const r = svc.importFromEnv();
        return { imported: r.imported.map((a) => asCredential(repo.require(a.id))), refreshed: r.refreshed };
      },
    },
  };
  return svc;
}
export type Cabinet = ReturnType<typeof cabinet>;
