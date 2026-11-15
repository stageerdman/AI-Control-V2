/* Cast packs: a named set of roles and agents added to every studio once — new databases and
   existing ones alike. A meta flag records it, so a restart never duplicates them and deleting a
   pack's agent later never brings it back (the same promise the first-run seed makes). */
import type { Store } from '../db/store.ts';
import type { Look } from '../domain/look.ts';
import type { Toolset } from '../domain/toolset.ts';

export type PackRole = { id: string; name: string; reporter?: boolean; toolsmith?: boolean };
export type PackAgent = {
  id: string;
  name: string;
  nick?: string;
  roleId: string;
  look: Look;
  prompt: string;
  tools: Toolset;
};
export type CastPack = { key: string; roles: PackRole[]; agents: PackAgent[] };

const flag = (pack: CastPack) => `cast-pack:${pack.key}`;
const installed = (store: Store, pack: CastPack) =>
  store.db.prepare('SELECT 1 FROM meta WHERE key = ?').get(flag(pack)) !== undefined;

/** The pack's role, or the user's role of the same name if they already made one. Returns its id. */
function ensureRole(store: Store, r: PackRole): string {
  if (store.roles.get(r.id)) return r.id;
  const same = store.roles.findByName(r.name);
  if (same) return same.id;
  store.roles.create(r.name, r.id);
  if (r.reporter) store.roles.setReporter(r.id, true);
  if (r.toolsmith) store.roles.setToolsmith(r.id, true);
  return r.id;
}

/** Add the pack once. Returns true if it was added now, false if this studio already had it. */
export function installPackIfNeeded(store: Store, pack: CastPack): boolean {
  if (installed(store, pack)) return false;
  store.tx(() => {
    const roleIds = new Map(pack.roles.map((r) => [r.id, ensureRole(store, r)]));
    for (const { id, roleId, ...agent } of pack.agents) {
      if (store.agents.get(id)) continue; // an agent the user already has keeps its id and its edits
      store.agents.create({ ...agent, roleId: roleIds.get(roleId) ?? null }, id);
    }
    store.db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)').run(flag(pack), new Date().toISOString());
  });
  return true;
}
