/* Folder accesses: a folder outside every project (a Mac app's data folder) that a project may be granted.
   A granted folder becomes an extra working folder of its agents' runs (`--add-dir`), which opens the file
   tools and the shell's path check to that one folder and nothing else.

   Two checks, both here:
   - `checkFolder` when the access is saved: an absolute path to a folder that exists, not too broad (/, the
     home folder, ~/Library, Application Support itself) and not overlapping the studio's own folders (data
     dir, the global secrets, and — for a folder shared read and write — the projects folder) — those would
     hand an agent the studio itself. A read-only share may overlap the projects folder: its agents can read
     other projects' code, but never a .env (the run denies reading .env files in every shared folder). Checked
     on the path as typed and on its real path (symlinks followed).
   - `liveFolder` when a run starts: the same rules on the folder's real path (symlinks followed), so a link
     swapped in later can't widen the grant; a folder that doesn't exist yet is simply not passed. */
import { existsSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, join, normalize, relative, sep } from 'node:path';
import type { FolderMode } from '../db/accesses.ts';
import { invalid } from '../errors.ts';

export type FolderGuard = {
  /** The user's home folder (`~`). */
  userHome: string;
  /** The studio's own folders: no granted folder may contain them or sit inside them. */
  protect: readonly string[];
  /** Folders only a read-only share may overlap (the projects folder): no writable folder may. */
  readOnly?: readonly string[];
};

/** Where a Mac app keeps its data: `~/Library/Application Support/<bundle id>`. */
export const appSupportDir = (userHome: string) => join(userHome, 'Library', 'Application Support');
export const appDataFolder = (userHome: string, bundleId: string) => join(appSupportDir(userHome), bundleId);

const within = (root: string, p: string) => {
  const r = relative(root, p);
  return r === '' || (r !== '..' && !r.startsWith(`..${sep}`) && !isAbsolute(r));
};
/** `/`, /Users, ~, ~/Library and Application Support itself: each holds far more than one app's data. */
const tooBroad = (p: string, userHome: string) => within(p, appSupportDir(userHome));
const realOr = (p: string) => (existsSync(p) ? realpathSync(p) : p);

function refusal(path: string, guard: FolderGuard, mode: FolderMode): string | null {
  if (tooBroad(path, guard.userHome) || tooBroad(path, realOr(guard.userHome)))
    return 'is too broad to share — pick the one folder an agent needs';
  const own = [...guard.protect, ...(mode === 'write' ? (guard.readOnly ?? []) : [])];
  for (const dir of own)
    for (const o of new Set([dir, realOr(dir)]))
      if (within(path, o) || within(o, path))
        return guard.readOnly?.includes(dir)
          ? `overlaps AI Studio's projects folder ${o} — share it read-only`
          : `overlaps AI Studio's own folder ${o}`;
  return null;
}

/** The folder as saved: absolute and normalized (no trailing slash), or a 422 saying why not. */
export function checkFolder(path: string, guard: FolderGuard, mode: FolderMode = 'write'): string {
  if (!isAbsolute(path) || path.includes('\0'))
    throw invalid('A shared folder must be an absolute path', { folder: path });
  const p = normalize(path).replace(/(.)\/+$/, '$1');
  if (!existsSync(p) || !statSync(p).isDirectory())
    throw invalid(`The folder ${p} doesn't exist (or isn't a folder)`, { folder: p });
  const why = refusal(p, guard, mode) ?? refusal(realpathSync(p), guard, mode);
  if (why) throw invalid(`The folder ${p} ${why}`, { folder: p });
  return p;
}

/** The real path to pass to a run, or null: missing, not a folder, or (after following links) refused. */
export function liveFolder(path: string, guard: FolderGuard, mode: FolderMode = 'write'): string | null {
  if (!existsSync(path)) return null;
  const real = realpathSync(path);
  if (!statSync(real).isDirectory() || refusal(real, guard, mode)) return null;
  return real;
}
