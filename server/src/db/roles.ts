/* Roles repository: user-defined labels. Agents point at a role by id, so a
   rename propagates to every agent for free. */
import { slugify, uniqueId } from '../domain/ids.ts';
import { normalizeRoleName } from '../domain/roles.ts';
import { conflict, invalid, notFound } from '../errors.ts';
import type { Db } from './connection.ts';
import { exists, nextPosition, now, row, rows } from './util.ts';

/** reporter: agents holding this role may file reports (file_report). */
export type Role = { id: string; name: string; agentCount: number; reporter: boolean };
export type RoleRecord = {
  id: string;
  name: string;
  name_key: string;
  position: number;
  created_at: string;
  reporter?: number;
};

const SELECT = `SELECT r.id, r.name, r.reporter, (SELECT COUNT(*) FROM agents a WHERE a.role_id = r.id) AS agentCount FROM roles r`;
type RoleRow = Omit<Role, 'reporter'> & { reporter: number };
const toRole = (r: RoleRow): Role => ({ ...r, reporter: r.reporter === 1 });

export function rolesRepo(db: Db) {
  const byKey = (key: string) =>
    row<{ id: string }>(db.prepare('SELECT id FROM roles WHERE name_key = ?').get(key));

  const repo = {
    list: (): Role[] => rows<RoleRow>(db.prepare(`${SELECT} ORDER BY r.position`).all()).map(toRole),
    get: (id: string): Role | null => {
      const r = row<RoleRow>(db.prepare(`${SELECT} WHERE r.id = ?`).get(id));
      return r ? toRole(r) : null;
    },
    require(id: string): Role {
      const r = repo.get(id);
      if (!r) throw notFound('Role', id);
      return r;
    },
    /** Case-insensitive lookup by name (the Agent Creator reuses a role before making one). */
    findByName(rawName: string): Role | null {
      const hit = byKey(normalizeRoleName(rawName).toLowerCase());
      return hit ? repo.get(hit.id) : null;
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

    /** Agents holding a reporter role may file reports. */
    setReporter(id: string, reporter: boolean): Role {
      repo.require(id);
      db.prepare('UPDATE roles SET reporter = ? WHERE id = ?').run(reporter ? 1 : 0, id);
      return repo.require(id);
    },
    record: (id: string) => row<RoleRecord>(db.prepare('SELECT * FROM roles WHERE id = ?').get(id)),
    insertRecord(r: RoleRecord): void {
      db.prepare(
        'INSERT INTO roles (id, name, name_key, position, created_at, reporter) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(r.id, r.name, r.name_key, r.position, r.created_at, r.reporter ?? 0);
    },
    /** Raw delete; agents holding it become role-less (FK SET NULL). Use trash.trashRole for undo. */
    deleteRecord: (id: string) => db.prepare('DELETE FROM roles WHERE id = ?').run(id),
    nameTaken: (key: string) => byKey(key) !== undefined,
  };
  return repo;
}
export type RolesRepo = ReturnType<typeof rolesRepo>;
