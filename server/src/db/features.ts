/* Features repository (the office's features folder). A feature lives in one status
   group — now / planned / shipped — at a 1-based `order` inside it; every write keeps
   each group's order dense (1, 2, 3…), so moving or deleting never leaves gaps. */
import { slugify, uniqueId } from '../domain/ids.ts';
import { invalid, notFound } from '../errors.ts';
import type { Db } from './connection.ts';
import { now, type Row, row, rows } from './util.ts';

export const FEATURE_STATUSES = ['now', 'planned', 'shipped'] as const;
export type FeatureStatus = (typeof FEATURE_STATUSES)[number];

export type Feature = {
  id: string;
  projectId: string;
  name: string;
  status: FeatureStatus;
  /** 1-based position inside its status group. */
  order: number;
  pct: number | null;
  /** Agent or team id carrying it (null = nobody yet). */
  owner: string | null;
  /** One plain text block each. */
  description: string;
  vision: string;
  createdAt: string;
  updatedAt: string;
};
export type FeatureCreate = {
  name: string;
  status?: FeatureStatus;
  order?: number;
  pct?: number | null;
  owner?: string | null;
  description?: string;
  vision?: string;
};
export type FeaturePatch = Partial<FeatureCreate>;

const toFeature = (r: Row): Feature => ({
  id: r.id as string,
  projectId: r.project_id as string,
  name: r.name as string,
  status: r.status as FeatureStatus,
  order: r.position as number,
  pct: (r.pct as number | null) ?? null,
  owner: (r.owner as string | null) ?? null,
  description: r.description as string,
  vision: r.vision as string,
  createdAt: r.created_at as string,
  updatedAt: r.updated_at as string,
});

export function featuresRepo(db: Db) {
  const record = (projectId: string, id: string) =>
    row<Row>(db.prepare('SELECT * FROM features WHERE id = ? AND project_id = ?').get(id, projectId));
  const group = (projectId: string, status: FeatureStatus, without?: string) =>
    rows<{ id: string }>(
      db
        .prepare('SELECT id FROM features WHERE project_id = ? AND status = ? ORDER BY position, rowid')
        .all(projectId, status),
    )
      .map((r) => r.id)
      .filter((id) => id !== without);
  /** Rewrite a group's positions 1..n in the given order. */
  const renumber = (ids: string[]) => {
    const set = db.prepare('UPDATE features SET position = ? WHERE id = ?');
    ids.forEach((id, i) => {
      set.run(i + 1, id);
    });
  };
  /** Put `id` at `order` (1-based, clamped; default last) inside its group. */
  const place = (projectId: string, status: FeatureStatus, id: string, order?: number) => {
    const ids = group(projectId, status, id);
    const at = order === undefined ? ids.length : Math.min(Math.max(order - 1, 0), ids.length);
    ids.splice(at, 0, id);
    renumber(ids);
  };
  const assertOwner = (owner: string | null | undefined) => {
    if (!owner) return;
    const known =
      db
        .prepare(
          'SELECT 1 FROM agents WHERE id = ? AND deleted_at IS NULL UNION SELECT 1 FROM teams WHERE id = ?',
        )
        .get(owner, owner) !== undefined;
    if (!known) throw invalid(`Unknown owner '${owner}' (an agent or team id)`, { owner });
  };

  const repo = {
    /** Now, then Planned, then Shipped; each in its order. */
    list: (projectId: string): Feature[] =>
      rows<Row>(
        db
          .prepare(
            `SELECT * FROM features WHERE project_id = ?
             ORDER BY CASE status WHEN 'now' THEN 0 WHEN 'planned' THEN 1 ELSE 2 END, position, rowid`,
          )
          .all(projectId),
      ).map(toFeature),
    get: (projectId: string, id: string): Feature | null => {
      const r = record(projectId, id);
      return r ? toFeature(r) : null;
    },
    require(projectId: string, id: string): Feature {
      const f = repo.get(projectId, id);
      if (!f) throw notFound('Feature', id);
      return f;
    },

    create(projectId: string, f: FeatureCreate): Feature {
      assertOwner(f.owner);
      const id = uniqueId(
        `f-${slugify(f.name, 'feature')}`,
        (x) => db.prepare('SELECT 1 FROM features WHERE id = ?').get(x) !== undefined,
      );
      const status = f.status ?? 'planned';
      const t = now();
      db.prepare(
        `INSERT INTO features (id, project_id, name, status, position, pct, owner, description, vision, created_at, updated_at)
         VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        projectId,
        f.name,
        status,
        f.pct ?? null,
        f.owner ?? null,
        f.description ?? '',
        f.vision ?? '',
        t,
        t,
      );
      place(projectId, status, id, f.order);
      return repo.require(projectId, id);
    },

    update(projectId: string, id: string, patch: FeaturePatch): Feature {
      const cur = repo.require(projectId, id);
      assertOwner(patch.owner);
      const next = { ...cur, ...patch };
      db.prepare(
        'UPDATE features SET name = ?, status = ?, pct = ?, owner = ?, description = ?, vision = ?, updated_at = ? WHERE id = ?',
      ).run(
        next.name,
        next.status,
        next.pct ?? null,
        next.owner ?? null,
        next.description,
        next.vision,
        now(),
        id,
      );
      if (next.status !== cur.status) {
        renumber(group(projectId, cur.status, id)); // close the gap it left
        place(projectId, next.status, id, patch.order);
      } else if (patch.order !== undefined) place(projectId, cur.status, id, patch.order);
      return repo.require(projectId, id);
    },

    remove(projectId: string, id: string): Feature {
      const cur = repo.require(projectId, id);
      db.prepare('DELETE FROM features WHERE id = ?').run(id);
      renumber(group(projectId, cur.status));
      return cur;
    },
  };
  return repo;
}
export type FeaturesRepo = ReturnType<typeof featuresRepo>;
