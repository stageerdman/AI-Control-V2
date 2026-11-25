/* Which processes a sweep stops — pure, over one read of the process table. */
import { type Proc, treeOf } from '../running/processes.ts';
import { ownerOf } from './owner.ts';

/** `self` and the chain above it (the studio app, a terminal): never ours to stop. */
function ancestry(self: number, procs: readonly Proc[]): Set<number> {
  const byPid = new Map(procs.map((p) => [p.pid, p]));
  const out = new Set<number>([self]);
  for (let p = byPid.get(self); p && !out.has(p.ppid); p = byPid.get(p.ppid)) out.add(p.ppid);
  return out;
}

/** Processes tagged with `key`, plus their groups and descendants (Apple's own binaries — sh, sleep — hide
    their environment, but sit under a tagged one), minus `self` and its ancestors. */
export function ownedBy(key: string, procs: readonly Proc[], self: number): Proc[] {
  const keep = ancestry(self, procs);
  const found = new Map<number, Proc>();
  for (const p of procs) {
    if (ownerOf(p.command) !== key) continue;
    for (const q of [p, ...treeOf(p.pid, procs)]) found.set(q.pid, q);
  }
  return [...found.values()].filter((p) => !keep.has(p.pid)).sort((a, b) => a.pid - b.pid);
}

/** Processes running from inside one of these app bundles (launched by macOS, so they carry no tag). */
export function fromBundles(bundles: readonly string[], procs: readonly Proc[], self: number): Proc[] {
  const keep = ancestry(self, procs);
  const roots = bundles.map((b) => `${b.replace(/\/+$/, '')}/Contents/MacOS/`);
  return procs.filter((p) => !keep.has(p.pid) && roots.some((r) => p.command.startsWith(r)));
}
