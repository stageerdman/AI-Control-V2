import { describe, expect, it } from 'vitest';
import type { Proc, ProcIO } from '../../src/running/processes.ts';
import { sweep } from '../../src/reaper/sweep.ts';

const proc = (pid: number): Proc => ({ pid, ppid: 1, pgid: pid, elapsedSec: 1, command: 'x' });

/** A fake table: TERM removes the pids in `obeys`, KILL removes anything. */
function fakeOS(live: number[], obeys: number[]) {
  const alive = new Set(live);
  const sent: string[] = [];
  const io: ProcIO = {
    procs: () => [...alive].map(proc),
    kill: (pid, sig) => {
      sent.push(`${sig}:${pid}`);
      if (sig === 'SIGKILL' || obeys.includes(pid)) alive.delete(pid);
      return true;
    },
  };
  return { io, alive, sent };
}
const all = (ps: Proc[]) => ps;

describe('sweep', () => {
  it('does nothing, and does not wait, when nothing is ours', async () => {
    const os = fakeOS([], []);
    expect(await sweep(os.io, all, 60_000)).toEqual({ termed: 0, killed: 0 });
    expect(os.sent).toEqual([]);
  });
  it('stops at TERM when everything goes, without a KILL', async () => {
    const os = fakeOS([1, 2], [1, 2]);
    expect(await sweep(os.io, all, 1000, 1)).toEqual({ termed: 2, killed: 0 });
    expect(os.sent).toEqual(['SIGTERM:1', 'SIGTERM:2']);
  });
  it('awaits the grace, then KILLs what ignored TERM', async () => {
    const os = fakeOS([1, 2], [1]);
    expect(await sweep(os.io, all, 30, 5)).toEqual({ termed: 2, killed: 1 });
    expect(os.sent.at(-1)).toBe('SIGKILL:2');
    expect(os.alive.size).toBe(0);
  });
  it('re-picks on every read: a pid that stopped matching is never KILLed', async () => {
    const os = fakeOS([1, 2], []);
    let reads = 0;
    const pick = (ps: Proc[]) => (reads++ === 0 ? ps : ps.filter((p) => p.pid !== 2));
    await sweep(os.io, pick, 20, 5);
    expect(os.sent).not.toContain('SIGKILL:2');
    expect(os.sent).toContain('SIGKILL:1');
  });
});
