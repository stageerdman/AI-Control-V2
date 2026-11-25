/* Nothing the studio started outlives it: at quit, and at boot for what a crash left behind, stop every process
   carrying this data dir's tag (agent programs and all they spawned, Start'ed websites, test runs) and every app
   the studio opened through macOS. The self-installer is the one exception: it is spawned without the tag. */
import { join } from 'node:path';
import { type ProcIO, readProcs, signal } from '../running/processes.ts';
import { openedApps } from './opened-apps.ts';
import { OWNER_VAR, ownerKey } from './owner.ts';
import { fromBundles, ownedBy } from './pick.ts';
import { type SweepResult, sweep } from './sweep.ts';

const OS: ProcIO = { procs: () => readProcs(true), kill: signal };

export function createReaper(deps: { home: string; self?: number; io?: ProcIO }) {
  const key = ownerKey(deps.home);
  const self = deps.self ?? process.pid;
  const io = deps.io ?? OS;
  const apps = openedApps(join(deps.home, 'opened-apps.json'));
  return {
    /** The env entry every child of the studio carries. */
    tag: { [OWNER_VAR]: key } as Record<string, string>,
    /** Note an app opened through macOS, so the sweep finds it. */
    opened: apps.add,
    /** Stop all of ours: TERM, up to `graceMs` to go, then KILL. */
    async sweep(graceMs: number): Promise<SweepResult> {
      const bundles = apps.list();
      const result = await sweep(
        io,
        (procs) => [...ownedBy(key, procs, self), ...fromBundles(bundles, procs, self)],
        graceMs,
      );
      apps.clear();
      return result;
    },
  };
}
export type Reaper = ReturnType<typeof createReaper>;
