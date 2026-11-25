/* The studio's tag on everything it starts: `AI_STUDIO_OWNER=<data dir key>` in the environment.
   An environment is inherited through every fork — double forks, nohup, re-parenting to launchd — so a process
   is found by its tag, never by a parent that may be long gone. The key keeps two studios (another
   AI_STUDIO_HOME) apart; one data dir has one backend at a time (data-lock.ts), so anything else carrying its
   key is ours to stop — this run's work at quit, a crashed run's leftovers at boot. */
import { createHash } from 'node:crypto';

export const OWNER_VAR = 'AI_STUDIO_OWNER';

export const ownerKey = (home: string): string => createHash('sha256').update(home).digest('hex').slice(0, 12);

const TAG = new RegExp(`(?:^|\\s)${OWNER_VAR}=(\\S+)`);

/** `env` without the tag: for the one process meant to outlive the studio (the self-installer). */
export function withoutOwnerTag(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const { [OWNER_VAR]: _tag, ...rest } = env;
  return rest;
}

/** The owner key a `ps -E` command line carries, or null when it has no tag. */
export function ownerOf(command: string): string | null {
  return TAG.exec(command)?.[1] ?? null;
}
