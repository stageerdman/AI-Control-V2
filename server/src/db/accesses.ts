/* Accesses repository (G1): the cabinet's metadata — an access is a named bundle of fields (keys,
   tokens, usernames, URLs…) — and per-project grants (a grant covers every field of the access).
   Never sees a secret value: a field row holds `hasValue` and the last 4 characters only. */
import { slugify, uniqueId } from '../domain/ids.ts';
import { conflict, invalid, notFound } from '../errors.ts';
import type { Db } from './connection.ts';
import { now, row, rows } from './util.ts';

type AccessRecord = {
  id: string;
  name: string;
  serves: string;
  docs_url: string | null;
  instructions: string;
  position: number;
  created_at: string;
  updated_at: string;
};
type FieldRecord = {
  id: string;
  access_id: string;
  label: string;
  env_var: string;
  secret: number;
  has_value: number;
  last4: string | null;
  position: number;
  created_at: string;
  updated_at: string;
};

export type FieldMeta = {
  id: string;
  label: string;
  /** The key in the global .env (and in each granted project's .env); unique across every access. */
  envVar: string;
  /** false = not a secret (a username, a URL): its value may be shown. */
  secret: boolean;
  hasValue: boolean;
  /** Last 4 characters of the value; null when there's no value or it's too short to show any. */
  last4: string | null;
  createdAt: string;
};
export type AccessMeta = {
  id: string;
  name: string;
  serves: string;
  docsUrl: string | null;
  instructions: string;
  fields: FieldMeta[];
  /** Projects this access is granted to. */
  projectIds: string[];
  createdAt: string;
  updatedAt: string;
};
export type AccessInfo = { name: string; serves?: string; docsUrl?: string | null; instructions?: string };
export type FieldInput = { label: string; envVar: string; secret: boolean };
/** What the cabinet tells the repo about a value — never the value itself. */
export type ValueInfo = { hasValue: boolean; last4: string | null };

export function accessesRepo(db: Db) {
  const record = (id: string) => row<AccessRecord>(db.prepare('SELECT * FROM accesses WHERE id = ?').get(id));
  const requireRecord = (id: string) => {
    const r = record(id);
    if (!r) throw notFound('Access', id);
    return r;
  };
  const fieldRecord = (id: string) =>
    row<FieldRecord>(db.prepare('SELECT * FROM access_fields WHERE id = ?').get(id));
  const toField = (f: FieldRecord): FieldMeta => ({
    id: f.id,
    label: f.label,
    envVar: f.env_var,
    secret: f.secret === 1,
    hasValue: f.has_value === 1,
    last4: f.last4,
    createdAt: f.created_at,
  });
  const fieldsOf = (accessId: string) =>
    rows<FieldRecord>(
      db.prepare('SELECT * FROM access_fields WHERE access_id = ? ORDER BY position, rowid').all(accessId),
    ).map(toField);
  const projectIds = (id: string) =>
    rows<{ project_id: string }>(
      db
        .prepare(
          `SELECT g.project_id FROM access_grants g JOIN projects p ON p.id = g.project_id
           WHERE g.access_id = ? ORDER BY p.position`,
        )
        .all(id),
    ).map((r) => r.project_id);
  const toAccess = (r: AccessRecord): AccessMeta => ({
    id: r.id,
    name: r.name,
    serves: r.serves,
    docsUrl: r.docs_url,
    instructions: r.instructions,
    fields: fieldsOf(r.id),
    projectIds: projectIds(r.id),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  });
  const requireProject = (id: string) => {
    if (!db.prepare('SELECT 1 FROM projects WHERE id = ?').get(id)) throw notFound('Project', id);
  };
  const touch = (accessId: string) =>
    db.prepare('UPDATE accesses SET updated_at = ? WHERE id = ?').run(now(), accessId);
  const envVarOwner = (envVar: string) =>
    row<FieldRecord>(db.prepare('SELECT * FROM access_fields WHERE env_var = ?').get(envVar));
  const assertEnvVarFree = (envVar: string, selfFieldId?: string) => {
    const hit = envVarOwner(envVar);
    if (hit && hit.id !== selfFieldId) {
      const owner = record(hit.access_id);
      throw conflict(`'${envVar}' is already in the cabinet as '${owner?.name ?? hit.access_id}'`, {
        existingId: hit.access_id,
        fieldId: hit.id,
      });
    }
  };
  const nextFieldPos = (accessId: string) =>
    (
      db
        .prepare('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM access_fields WHERE access_id = ?')
        .get(accessId) as { p: number }
    ).p;
  const insertField = (accessId: string, f: FieldInput, v: ValueInfo): string => {
    assertEnvVarFree(f.envVar);
    const id = uniqueId(
      `f-${slugify(record(accessId)?.name ?? accessId, 'access')}-${slugify(f.label, 'field')}`,
      (x) => fieldRecord(x) !== undefined,
    );
    const t = now();
    db.prepare(
      `INSERT INTO access_fields (id, access_id, label, env_var, secret, has_value, last4, position, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      accessId,
      f.label,
      f.envVar,
      f.secret ? 1 : 0,
      v.hasValue ? 1 : 0,
      v.last4,
      nextFieldPos(accessId),
      t,
      t,
    );
    return id;
  };

  const repo = {
    list: (): AccessMeta[] =>
      rows<AccessRecord>(db.prepare('SELECT * FROM accesses ORDER BY position').all()).map(toAccess),
    require: (id: string): AccessMeta => toAccess(requireRecord(id)),
    exists: (id: string) => record(id) !== undefined,
    /** The access + field that own an env var, or null. */
    byEnvVar(envVar: string): { access: AccessMeta; field: FieldMeta } | null {
      const f = envVarOwner(envVar);
      if (!f) return null;
      const access = repo.require(f.access_id);
      return { access, field: access.fields.find((x) => x.id === f.id) as FieldMeta };
    },
    field(accessId: string, fieldId: string): FieldMeta {
      const f = fieldRecord(fieldId);
      if (!f || f.access_id !== accessId) throw notFound('Field', fieldId);
      return toField(f);
    },
    allFields: (): FieldMeta[] =>
      rows<FieldRecord>(db.prepare('SELECT * FROM access_fields ORDER BY rowid').all()).map(toField),

    /** An access with its fields (each with what the cabinet knows of its value). */
    create(info: AccessInfo, fields: { field: FieldInput; value: ValueInfo }[], idPrefix = 'a'): AccessMeta {
      if (!fields.length) throw invalid('An access needs at least one field');
      const envs = fields.map((f) => f.field.envVar);
      if (new Set(envs).size !== envs.length)
        throw invalid('Two fields use the same env var', { envVars: envs });
      for (const e of envs) assertEnvVarFree(e);
      const id = uniqueId(`${idPrefix}-${slugify(info.name, 'access')}`, (x) => record(x) !== undefined);
      const pos = (
        db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM accesses').get() as { p: number }
      ).p;
      const t = now();
      db.prepare(
        `INSERT INTO accesses (id, name, serves, docs_url, instructions, position, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(id, info.name, info.serves ?? '', info.docsUrl ?? null, info.instructions ?? '', pos, t, t);
      for (const f of fields) insertField(id, f.field, f.value);
      return repo.require(id);
    },

    update(id: string, patch: Partial<AccessInfo>): AccessMeta {
      const r = requireRecord(id);
      db.prepare(
        'UPDATE accesses SET name = ?, serves = ?, docs_url = ?, instructions = ?, updated_at = ? WHERE id = ?',
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

    /** Hard delete; its fields and grants go with it (FK cascade). */
    remove(id: string): void {
      requireRecord(id);
      db.prepare('DELETE FROM accesses WHERE id = ?').run(id);
    },

    addField(accessId: string, f: FieldInput, v: ValueInfo): FieldMeta {
      requireRecord(accessId);
      const id = insertField(accessId, f, v);
      touch(accessId);
      return repo.field(accessId, id);
    },

    updateField(accessId: string, fieldId: string, patch: Partial<FieldInput>): FieldMeta {
      const f = repo.field(accessId, fieldId);
      if (patch.envVar !== undefined) assertEnvVarFree(patch.envVar, fieldId);
      db.prepare(
        'UPDATE access_fields SET label = ?, env_var = ?, secret = ?, updated_at = ? WHERE id = ?',
      ).run(
        patch.label ?? f.label,
        patch.envVar ?? f.envVar,
        (patch.secret ?? f.secret) ? 1 : 0,
        now(),
        fieldId,
      );
      touch(accessId);
      return repo.field(accessId, fieldId);
    },

    removeField(accessId: string, fieldId: string): void {
      repo.field(accessId, fieldId);
      if (fieldsOf(accessId).length <= 1)
        throw conflict('An access keeps at least one field — delete the access instead', { fieldId });
      db.prepare('DELETE FROM access_fields WHERE id = ?').run(fieldId);
      touch(accessId);
    },

    setValueInfo(fieldId: string, v: ValueInfo): void {
      const f = fieldRecord(fieldId);
      if (!f) throw notFound('Field', fieldId);
      db.prepare('UPDATE access_fields SET has_value = ?, last4 = ?, updated_at = ? WHERE id = ?').run(
        v.hasValue ? 1 : 0,
        v.last4,
        now(),
        fieldId,
      );
      touch(f.access_id);
    },

    /* ---------------------------------------------------------- grants */
    grantedIds(projectId: string): string[] {
      requireProject(projectId);
      return rows<{ access_id: string }>(
        db
          .prepare(
            `SELECT g.access_id FROM access_grants g JOIN accesses a ON a.id = g.access_id
             WHERE g.project_id = ? ORDER BY a.position`,
          )
          .all(projectId),
      ).map((r) => r.access_id);
    },

    /** Partial update: `{accessId: true|false}`. Unknown access ids → 422. Returns the ids that changed. */
    setGrants(projectId: string, grants: Record<string, boolean>): string[] {
      requireProject(projectId);
      for (const aid of Object.keys(grants))
        if (!record(aid)) throw invalid(`Unknown access '${aid}'`, { accessId: aid });
      const on = db.prepare(
        'INSERT OR IGNORE INTO access_grants (project_id, access_id, granted_at) VALUES (?, ?, ?)',
      );
      const off = db.prepare('DELETE FROM access_grants WHERE project_id = ? AND access_id = ?');
      const changed: string[] = [];
      for (const [aid, granted] of Object.entries(grants)) {
        const r = granted ? on.run(projectId, aid, now()) : off.run(projectId, aid);
        if (Number(r.changes) > 0) changed.push(aid);
      }
      return changed;
    },

    /* ---------------------------------------------------------- seen ("new" dot) */
    /** When the project last looked at its access; before that, the project's own creation counts. */
    seenAt(projectId: string): string {
      const r = row<{ access_seen_at: string | null; created_at: string }>(
        db.prepare('SELECT access_seen_at, created_at FROM projects WHERE id = ?').get(projectId),
      );
      if (!r) throw notFound('Project', projectId);
      return r.access_seen_at ?? r.created_at;
    },
    markSeen(projectId: string): string {
      requireProject(projectId);
      const t = now();
      db.prepare('UPDATE projects SET access_seen_at = ? WHERE id = ?').run(t, projectId);
      return t;
    },
  };
  return repo;
}
export type AccessesRepo = ReturnType<typeof accessesRepo>;
