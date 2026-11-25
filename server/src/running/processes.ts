/* The OS's own view of what a session is running: its code runs are the live processes under it.
   The process table is the truth — read fresh each time, so nothing is ever stale. A session's
   processes are those in its process group (sessions start in their own group) plus every
   descendant by parent pid (a command that made its own group is still a child). */
import { execFileSync } from 'node:child_process';
import { withoutOwnerTag } from '../reaper/owner.ts';

export type Proc = { pid: number; ppid: number; pgid: number; elapsedSec: number; command: string };

/** `[[dd-]hh:]mm:ss` (ps etime) → seconds; NaN when it is not that shape. */
export function parseElapsed(etime: string): number {
  const m = /^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+)$/.exec(etime.trim());
  if (!m) return Number.NaN;
  const [, d, h, min, s] = m;
  return ((Number(d ?? 0) * 24 + Number(h ?? 0)) * 60 + Number(min)) * 60 + Number(s);
}

/** Lines of `ps -o pid=,ppid=,pgid=,etime=,command=` → processes (malformed lines skipped). */
export function parsePs(text: string): Proc[] {
  const out: Proc[] = [];
  for (const line of text.split('\n')) {
    const m = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/.exec(line);
    if (!m) continue;
    const elapsedSec = parseElapsed(m[4] as string);
    if (Number.isNaN(elapsedSec)) continue;
    out.push({
      pid: Number(m[1]),
      ppid: Number(m[2]),
      pgid: Number(m[3]),
      elapsedSec,
      command: (m[5] as string).trim(),
    });
  }
  return out;
}

/** Everything running under `root` (its group + descendants), the root itself left out. */
export function treeOf(root: number, procs: readonly Proc[]): Proc[] {
  const children = new Map<number, Proc[]>();
  for (const p of procs) children.set(p.ppid, [...(children.get(p.ppid) ?? []), p]);
  const found = new Map<number, Proc>();
  const stack = procs.filter((p) => p.pgid === root || p.ppid === root);
  for (let p = stack.pop(); p; p = stack.pop()) {
    if (found.has(p.pid) || p.pid === root) continue;
    found.set(p.pid, p);
    stack.push(...(children.get(p.pid) ?? []));
  }
  return [...found.values()].sort((a, b) => a.pid - b.pid);
}

/** The live process table (empty if `ps` can't be read — then no code runs are shown, never invented ones).
    `withEnv`: each command carries its environment too (macOS `ps -E`; Apple's own binaries show none). */
export function readProcs(withEnv = false): Proc[] {
  try {
    return parsePs(
      execFileSync('ps', [...(withEnv ? ['-E', '-ww'] : []), '-A', '-o', 'pid=,ppid=,pgid=,etime=,command='], {
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
        /* untagged: `ps -E` lists itself, and a tagged reader would be picked by every sweep */
        env: withoutOwnerTag(process.env),
      }),
    );
  } catch (e) {
    console.error(`[running] could not read the process table: ${(e as Error).message}`);
    return [];
  }
}

/** Signal one process (a negative pid: its whole group); false when it is already gone. */
export function signal(pid: number, sig: NodeJS.Signals): boolean {
  try {
    process.kill(pid, sig);
    return true;
  } catch {
    return false;
  }
}

export type ProcIO = { procs: () => Proc[]; kill: (pid: number, sig: NodeJS.Signals) => boolean };
const OS: ProcIO = { procs: readProcs, kill: signal };

/** Stop `root` and everything under it (its group, and children that made their own): TERM now, KILL after the grace. */
export function stopTree(root: number, graceMs: number, io: ProcIO = OS): void {
  const pids = [root, ...treeOf(root, io.procs()).map((p) => p.pid)];
  const hit = (sig: NodeJS.Signals) => {
    io.kill(-root, sig);
    for (const p of pids) io.kill(p, sig);
  };
  hit('SIGTERM');
  setTimeout(() => hit('SIGKILL'), graceMs).unref();
}
