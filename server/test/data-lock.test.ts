/* F1c: one backend per data dir — a second one would "recover" (interrupt) the first one's running work. */
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { acquireDataLock, DataDirInUseError } from '../src/data-lock.ts';
import { tempDir } from './helpers.ts';

describe('data dir lock', () => {
  const t = tempDir();
  afterEach(() => t.cleanup());
  it('a live holder refuses a second backend (names pid + port); release frees it; stale locks are taken over', () => {
    const a = acquireDataLock(t.dir, 4319);
    expect(() => acquireDataLock(t.dir, 4391, process.pid + 1_000_000)).toThrow(DataDirInUseError);
    expect(() => acquireDataLock(t.dir, 4391, process.pid + 1_000_000)).toThrow(/pid \d+, port 4319/);
    a.release();
    expect(existsSync(join(t.dir, 'server.lock'))).toBe(false);
    writeFileSync(
      join(t.dir, 'server.lock'),
      JSON.stringify({ pid: 2 ** 22 + 12345, port: 1, startedAt: '' }),
    );
    const b = acquireDataLock(t.dir, 4391); // dead pid → stale
    b.release();
  });
});
