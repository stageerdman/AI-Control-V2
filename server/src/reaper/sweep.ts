/* The reliable stop: TERM what was picked, wait (awaited — never an unref'd timer that dies with the process),
   read the table again, KILL what is still there. Re-picking on every read means a pid that was reused meanwhile
   is never hit (it no longer carries the tag), and a process spawned during the wait is caught too. */
import type { Proc, ProcIO } from '../running/processes.ts';

export type Pick = (procs: Proc[]) => Proc[];
export type SweepResult = { termed: number; killed: number };

const POLL_MS = 100;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function sweep(io: ProcIO, pick: Pick, graceMs: number, pollMs = POLL_MS): Promise<SweepResult> {
  const first = pick(io.procs());
  for (const p of first) io.kill(p.pid, 'SIGTERM');
  if (first.length === 0) return { termed: 0, killed: 0 };
  const deadline = Date.now() + graceMs;
  let left = first;
  while (left.length > 0 && Date.now() < deadline) {
    await sleep(pollMs);
    left = pick(io.procs());
  }
  for (const p of left) io.kill(p.pid, 'SIGKILL');
  return { termed: first.length, killed: left.length };
}
