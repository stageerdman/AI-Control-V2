// Pure decisions for the Mac installer (main.mjs does the I/O). Kept apart so they are tested on their own.
import { join, resolve } from 'node:path';

export const APPLICATIONS = '/Applications';

/** Where the installed app lives: `/Applications/<productName>.app`. */
export const installPath = (productName) => join(APPLICATIONS, `${productName}.app`);

/** Cargo target dirs a Tauri build may write to, most likely first (the shared target is the convention). */
export function targetDirs({ env, home, appDir }) {
  const dirs = [env.CARGO_TARGET_DIR, join(home, '.cargo-shared-target'), join(appDir, 'src-tauri', 'target')];
  return [...new Set(dirs.filter(Boolean).map((d) => resolve(d)))];
}

/** The bundle this build produced: the newest candidate written at or after the build started. */
export function freshBundle(candidates, builtSinceMs) {
  const fresh = candidates.filter((c) => c.mtimeMs >= builtSinceMs).sort((a, b) => b.mtimeMs - a.mtimeMs);
  return fresh[0]?.path ?? null;
}

/** Every other copy of the app (old builds, duplicates in other folders): all found paths except the keepers. */
export function staleCopies(found, keep) {
  const keepers = new Set(keep.map((p) => resolve(p)));
  const paths = found.map((p) => p.trim()).filter(Boolean).map((p) => resolve(p));
  return [...new Set(paths)].filter((p) => p.endsWith('.app') && !keepers.has(p));
}

/** npm install is needed when dependencies were never installed or the lockfile changed since. */
export const needsDeps = (lockMtimeMs, installedMtimeMs) =>
  installedMtimeMs === undefined || lockMtimeMs > installedMtimeMs;
