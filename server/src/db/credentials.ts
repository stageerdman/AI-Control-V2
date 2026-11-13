/* Credentials repository: the Key Cabinet's metadata and per-project grants.
   Never sees a secret value — only `hasValue` and the last 4 characters. */
import { slugify, uniqueId } from '../domain/ids.ts';
import { conflict, invalid, notFound } from '../errors.ts';
import type { Db } from './connection.ts';
import { now, row, rows } from './util.ts';

type CredentialRecord = {
  id: string;
  name: string;
  env_var: string;
  serves: string;
  docs_url: string | null;
  instructions: string;
  has_value: number;
  last4: string | null;
  position: number;
  created_at: string;
  updated_at: string;
};

export type Credential = {
  id: string;
  name: string;
  /** The key in the global .env (and in each granted project's .env). */
  envVar: string;
  serves: string;
  docsUrl: string | null;
  instructions: string;
  hasValue: boolean;
  /** Last 4 characters of the value; null when there's no value or it's too short to show any. */
  last4: string | null;
  /** Projects this credential is granted to. */
  projectIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type CredentialMeta = {
  name: string;
  serves?: string;
  docsUrl?: string | null;
  instructions?: string;
};
/** What the cabinet tells the repo about a value — never the value itself. */
export type ValueInfo = { hasValue: boolean; last4: string | null };

export function credentialsRepo(db: Db) {
  const record = (id: string) =>
    row<CredentialRecord>(db.prepare('SELECT * FROM credentials WHERE id = ?').get(id));
  const requireRecord = (id: string) => {
    const r = record(id);
    if (!r) throw notFound('Credential', id);
    return r;
  };
  const projectIds = (id: string) =>
    rows<{ project_id: string }>(
      db
        .prepare(
          `SELECT pa.project_id FROM project_access pa JOIN projects p ON p.id = pa.project_id
           WHERE pa.credential_id = ? ORDER BY p.position`,
        )
        .all(id),
    ).map((r) => r.project_id);
  const toCredential = (r: CredentialRecord): Credential => ({
    id: r.id,
    name: r.name,
    envVar: r.env_var,
    serves: r.serves,
    docsUrl: r.docs_url,
    instructions: r.instructions,
    hasValue: r.has_value === 1,
    last4: r.last4,
    projectIds: projectIds(r.id),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  });
  const idTaken = (id: string) => record(id) !== undefined;
  const requireProject = (id: string) => {
    if (!db.prepare('SELECT 1 FROM projects WHERE id = ?').get(id)) throw notFound('Project', id);
  };

  const repo = {
    list: (): Credential[] =>
      rows<CredentialRecord>(db.prepare('SELECT * FROM credentials ORDER BY position').all()).map(
        toCredential,
      ),
    require: (id: string): Credential => toCredential(requireRecord(id)),
    byEnvVar: (envVar: string): Credential | null => {
      const r = row<CredentialRecord>(db.prepare('SELECT * FROM credentials WHERE env_var = ?').get(envVar));
      return r ? toCredential(r) : null;
    },

    create(meta: CredentialMeta, envVar: string, v: ValueInfo): Credential {
      const hit = repo.byEnvVar(envVar);
      if (hit)
        throw conflict(`'${envVar}' is already in the cabinet as '${hit.name}'`, { existingId: hit.id });
      const id = uniqueId(`c-${slugify(meta.name, 'key')}`, idTaken);
      const pos = (
        db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM credentials').get() as { p: number }
      ).p;
      const t = now();
      db.prepare(
        `INSERT INTO credentials (id, name, env_var, serves, docs_url, instructions, has_value, last4, position, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        meta.name,
        envVar,
        meta.serves ?? '',
        meta.docsUrl ?? null,
        meta.instructions ?? '',
        v.hasValue ? 1 : 0,
        v.last4,
        pos,
        t,
        t,
      );
      return repo.require(id);
    },

    update(id: string, patch: Partial<CredentialMeta>): Credential {
      const r = requireRecord(id);
      db.prepare(
        'UPDATE credentials SET name = ?, serves = ?, docs_url = ?, instructions = ?, updated_at = ? WHERE id = ?',
      ).run(
        patch.name ?? r.name,
        patch.serves ?? r.serves,
        patch.docsUrl === undefined ? r.docs_url : patch.docsUrl,
        patch.instructions ?? r.instructions,
        now(),
        id,
      );
      return repo.require(id);
    },

    setValueInfo(id: string, v: ValueInfo): Credential {
      requireRecord(id);
      db.prepare('UPDATE credentials SET has_value = ?, last4 = ?, updated_at = ? WHERE id = ?').run(
        v.hasValue ? 1 : 0,
        v.last4,
        now(),
        id,
      );
      return repo.require(id);
    },

    /** Hard delete; grants go with it (FK cascade). */
    remove(id: string): void {
      requireRecord(id);
      db.prepare('DELETE FROM credentials WHERE id = ?').run(id);
    },

    /* ---------------------------------------------------------- grants */
    grantedIds(projectId: string): string[] {
      requireProject(projectId);
      return rows<{ credential_id: string }>(
        db
          .prepare(
            `SELECT pa.credential_id FROM project_access pa JOIN credentials c ON c.id = pa.credential_id
             WHERE pa.project_id = ? ORDER BY c.position`,
          )
          .all(projectId),
      ).map((r) => r.credential_id);
    },

    /** Partial update: `{credentialId: true|false}`. Unknown credential ids → 422. */
    setGrants(projectId: string, grants: Record<string, boolean>): void {
      requireProject(projectId);
      for (const cid of Object.keys(grants))
        if (!idTaken(cid)) throw invalid(`Unknown credential '${cid}'`, { credentialId: cid });
      const on = db.prepare(
        'INSERT OR IGNORE INTO project_access (project_id, credential_id, granted_at) VALUES (?, ?, ?)',
      );
      const off = db.prepare('DELETE FROM project_access WHERE project_id = ? AND credential_id = ?');
      for (const [cid, granted] of Object.entries(grants)) {
        if (granted) on.run(projectId, cid, now());
        else off.run(projectId, cid);
      }
    },
  };
  return repo;
}
export type CredentialsRepo = ReturnType<typeof credentialsRepo>;
