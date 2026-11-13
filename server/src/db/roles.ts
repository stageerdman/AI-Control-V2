/* Roles repository: user-defined labels. Agents point at a role by id, so a
   rename propagates to every agent for free. */
import { slugify, uniqueId } from '../domain/ids.ts';
import { normalizeRoleName } from '../domain/roles.ts';
import { conflict, invalid, notFound } from '../errors.ts';
import type { Db } from './connection.ts';
import { exists, nextPosition, now, row, rows } from './util.ts';

export type Role = { id: string; name: string; agentCount: number };
export type RoleRecord = { id: string; name: string; name_key: string; position: number; created_at: string };

const SELECT = `SELECT r.id, r.name, (SELECT COUNT(*) FROM agents a WHERE a.role_id = r.id) AS agentCount FROM roles r`;

export function rolesRepo(db: Db) {
  const byKey = (key: string) =>
    row<{ id: string }>(db.prepare('SELECT id FROM roles WHERE name_key = ?').get(key));

  const repo = {
    list: (): Role[] => rows<Role>(db.prepare(`${SELECT} ORDER BY r.position`).all()),
    get: (id: string): Role | null => row<Role>(db.prepare(`${SELECT} WHERE r.id = ?`).get(id)) ?? null,
    require(id: string): Role {
      const r = repo.get(id);
      if (!r) throw notFound('Role', id);
      return r;
    },
    /** Body references must point at a real role → 422 otherwise. */
    assertExists(id: string): void {
      if (!exists(db, 'roles', id)) throw invalid(`Unknown role '${id}'`, { roleId: id });
    },

    create(rawName: string, id?: string): Role {
      const name = normalizeRoleName(rawName);
      const hit = byKey(name.toLowerCase());
      if (hit) throw conflict(`A role named '${name}' already exists`, { existingId: hit.id });
      const rid = id ?? uniqueId(`r-${slugify(name, 'role')}`, (x) => exists(db, 'roles', x));
      db.prepare('INSERT INTO roles (id, name, name_key, position, created_at) VALUES (?, ?, ?, ?, ?)').run(
        rid,
        name,
        name.toLowerCase(),
        nextPosition(db, 'roles'),
        now(),
      );
      return repo.require(rid);
    },

    rename(id: string, rawName: string): Role {
      repo.require(id);
      const name = normalizeRoleName(rawName);
      const hit = byKey(name.toLowerCase());
      if (hit && hit.id !== id)
        throw conflict(`A role named '${name}' already exists`, { existingId: hit.id });
      db.prepare('UPDATE roles SET name = ?, name_key = ? WHERE id = ?').run(name, name.toLowerCase(), id);
      return repo.require(id);
    },

    record: (id: string) => row<RoleRecord>(db.prepare('SELECT * FROM roles WHERE id = ?').get(id)),
    insertRecord(r: RoleRecord): void {
      db.prepare('INSERT INTO roles (id, name, name_key, position, created_at) VALUES (?, ?, ?, ?, ?)').run(
        r.id,
        r.name,
        r.name_key,
        r.position,
        r.created_at,
      );
    },
    /** Raw delete; agents holding it become role-less (FK SET NULL). Use trash.trashRole for undo. */
    deleteRecord: (id: string) => db.prepare('DELETE FROM roles WHERE id = ?').run(id),
    nameTaken: (key: string) => byKey(key) !== undefined,
  };
  return repo;
}
export type RolesRepo = ReturnType<typeof rolesRepo>;
