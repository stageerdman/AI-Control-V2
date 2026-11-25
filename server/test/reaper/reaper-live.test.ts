/* The real thing on this Mac: a tagged program double-forks away from us and ignores SIGTERM — the sweep still
   finds it (by its tag, not its parent) and it is gone afterwards. */
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createReaper } from '../../src/reaper/reaper.ts';

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/* the child starts a detached, TERM-ignoring grandchild, prints its pid and exits: the grandchild is re-parented */
const DOUBLE_FORK = `
const { spawn } = require('node:child_process');
const g = spawn(process.execPath, ['-e', "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"],
  { detached: true, stdio: 'ignore' });
g.unref();
console.log(g.pid);
`;

function startOrphan(env: Record<string, string>): Promise<number> {
  return new Promise((resolve, reject) => {
    const c = spawn(process.execPath, ['-e', DOUBLE_FORK], { env: { ...process.env, ...env } });
    let out = '';
    c.stdout.on('data', (b: Buffer) => {
      out += b.toString();
    });
    c.once('error', reject);
    c.once('close', () => resolve(Number(out.trim())));
  });
}

describe.runIf(process.platform === 'darwin')('reaper on the live process table', () => {
  it('stops a re-parented, TERM-ignoring program it tagged, and leaves an untagged one alone', async () => {
    const reaper = createReaper({ home: mkdtempSync(join(tmpdir(), 'reaper-')) });
    const ours = await startOrphan(reaper.tag);
    const notOurs = await startOrphan({});
    try {
      await new Promise((r) => setTimeout(r, 200));
      expect(alive(ours)).toBe(true);
      const result = await reaper.sweep(300);
      expect(result).toEqual({ termed: 1, killed: 1 });
      await new Promise((r) => setTimeout(r, 100));
      expect(alive(ours)).toBe(false);
      expect(alive(notOurs)).toBe(true);
    } finally {
      for (const pid of [ours, notOurs]) if (alive(pid)) process.kill(pid, 'SIGKILL');
    }
  });

  /* regression: the backend carries its own tag (main.ts), so the `ps` reading the table did too — every read
     found a fresh tagged `ps`, the sweep waited out its whole grace and "killed" one each quit */
  it('finds nothing when the sweeping process itself carries the tag and nothing else does', async () => {
    const reaper = createReaper({ home: mkdtempSync(join(tmpdir(), 'reaper-')) });
    const before = { ...process.env };
    Object.assign(process.env, reaper.tag);
    try {
      expect(await reaper.sweep(300)).toEqual({ termed: 0, killed: 0 });
    } finally {
      process.env = before;
    }
  });
});
