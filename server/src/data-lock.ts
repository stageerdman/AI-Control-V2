/* One backend per data dir. Starting a server recovers the db (every run/item still marked running is
   failed as "interrupted", its checkout put away) — so a second server on the same data dir would kill the
   first one's live work (F1c live check: the desktop app's server started next to a dev server and did
   exactly that). The lock is `<home>/server.lock` = {pid, port, startedAt}; a lock whose pid is gone is stale. */
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export type LockInfo = { pid: number; port: number; startedAt: string };

export class DataDirInUseError extends Error {
  constructor(
    readonly home: string,
    readonly holder: LockInfo,
  ) {
    super(
      `Another AI Studio backend (pid ${holder.pid}, port ${holder.port}) already uses ${home} — ` +
        'two backends on one data dir would interrupt each other’s running work. Use that one, stop it, or set AI_STUDIO_HOME.',
    );
    this.name = 'DataDirInUseError';
  }
}

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
};
const read = (file: string): LockInfo | null => {
  try {
    const v = JSON.parse(readFileSync(file, 'utf8')) as LockInfo;
    return Number.isInteger(v.pid) ? v : null;
  } catch {
    return null;
  }
};

/** Take the data dir, or throw DataDirInUseError naming the live holder. Returns release(). */
export function acquireDataLock(home: string, port: number, pid = process.pid): { release: () => void } {
  const file = join(home, 'server.lock');
  const info: LockInfo = { pid, port, startedAt: new Date().toISOString() };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      writeFileSync(file, JSON.stringify(info), { flag: 'wx', mode: 0o600 });
      return {
        release: () => {
          if (read(file)?.pid === pid) unlinkSync(file);
        },
      };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      const holder = read(file);
      if (holder && holder.pid !== pid && alive(holder.pid)) throw new DataDirInUseError(home, holder);
      try {
        unlinkSync(file); // stale (or ours): take it over
      } catch {
        /* someone else removed it */
      }
    }
  }
  throw new Error(`Couldn't take ${file}`);
}
