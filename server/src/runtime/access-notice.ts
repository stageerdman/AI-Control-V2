/* What a working agent is told when an access is shared with its project mid-run. A running process's
   environment can't change (Claude Code reads its env once, at start — checked live, see the LIVE ACCESS
   update's wiki), so the studio writes the access into the .env of the agent's working folder:
   - 'live': that worked — the access is usable now, from .env;
   - 'restart': it couldn't — restart the session (forget) to have it in the environment.
   A shared folder is always 'restart': it joins a session's working folders only when the session starts.
   Names, labels and env vars only — never a value. */
import type { AgentAccess } from '../secrets/projectAccess.ts';

export type Pickup = 'live' | 'restart';

const fieldsOf = (a: AgentAccess) =>
  a.fields.map((f) => `${f.label} → \`${f.envVar}\`${f.hasValue ? '' : ' (not set yet)'}`).join(', ');

const headOf = (a: AgentAccess) =>
  a.folder
    ? `AI Studio — a folder (${a.name}) was shared with you, read and write: \`${a.folder}\`.`
    : `AI Studio — a new access (${a.name}) was shared with you: ${fieldsOf(a)}.`;

export function accessNotice(a: AgentAccess, how: Pickup, canForget: boolean): string {
  const head = headOf(a);
  if (how === 'live')
    return [
      head,
      'You can use it now: it is in the .env file of your working folder (your shell environment gets it in your next session). Load it from there, e.g. `node --env-file=.env …` or your app’s .env loader.',
      'Never print, log or commit a value.',
    ].join(' ');
  const restart = canForget
    ? 'Restart your session to use it: commit your work, then call `forget` with your note — you carry on in a fresh session with your chat and work kept, and the access in your environment.'
    : 'Restart your session to use it: it is in your environment from your next session on.';
  return `${head} ${restart}`;
}
