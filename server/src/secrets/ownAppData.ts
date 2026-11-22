/* A Mac app project's own data folder (`~/Library/Application Support/<bundle id>`): its agents may always
   read and write it, with no vault entry and no grant (the user's decision). Only that one folder, and only
   when it passes the same guard as any shared folder: the bundle id must be one plain folder name, and the
   folder must exist and (after following links) be neither too broad nor overlap the studio's own folders. */
import { AppError } from '../errors.ts';
import { bundleIdOf } from './bundleId.ts';
import { appDataFolder, type FolderGuard, liveFolder } from './folderAccess.ts';

/** `/`, `.` and `..` would leave Application Support/<id> — not one app's folder. */
const plainName = (id: string) => !id.includes('/') && !id.includes('\\') && id !== '.' && id !== '..';

/** The folder as the agent is told it (not yet resolved), or null: not a Mac app, odd id, missing or refused. */
export function ownAppDataFolder(projectDir: string, guard: FolderGuard): string | null {
  let id: string;
  try {
    id = bundleIdOf(projectDir);
  } catch (e) {
    /* no bundle id, or several: not a Mac app we can name — nothing to open */
    if (e instanceof AppError && e.status === 409) return null;
    throw e;
  }
  if (!plainName(id)) return null;
  const folder = appDataFolder(guard.userHome, id);
  return liveFolder(folder, guard) ? folder : null;
}
