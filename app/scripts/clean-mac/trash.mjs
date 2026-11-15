// Move a file or app into the user's Trash (never delete for good). A name already in the Trash gets a
// time stamp, so nothing there is overwritten.
import { existsSync, mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { trashName } from '../install-mac/plan.mjs';

/** @returns where it went in the Trash */
export function moveToTrash(path, trashDir, stamp = new Date().toTimeString().slice(0, 8).replace(/:/g, '.')) {
  mkdirSync(trashDir, { recursive: true });
  const dest = join(trashDir, trashName(path, (n) => existsSync(join(trashDir, n)), stamp));
  try {
    renameSync(path, dest);
  } catch (e) {
    throw new Error(e.code === 'EXDEV' ? 'it is on another disk; drag it to the Trash yourself' : e.message, { cause: e });
  }
  return dest;
}
