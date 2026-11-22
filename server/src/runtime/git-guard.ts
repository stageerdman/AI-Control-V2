/* The git guard (AGENTS PUSH): agents push to their own project's origin with no approval, inside hard limits —
   no force push or history rewrite, no other remotes or other projects' repos, no deleting remote branches.
   Pure: judges one shell command line (every `git …` in it); the shell hook (shell-hook.ts) runs it before every
   Bash call. Anything that isn't git, or is git within the limits, is 'ok' — the normal allow-list decides. */

export type GitCheck = { kind: 'ok' } | { kind: 'deny'; reason: string };

const OK: GitCheck = { kind: 'ok' };
const deny = (reason: string): GitCheck => ({ kind: 'deny', reason });

/** The remotes a push may name: the project's own origin, or `.` (a local fast-forward, e.g. into main). */
const OWN_REMOTES = new Set(['origin', '.']);
/** Config keys that would point a push somewhere else (or hide one behind an alias). */
const REDIRECTING_KEY = /^(alias|remote|url|branch)\./i;
/** Global options that run git on another folder — a push from there reaches another repo. */
const ELSEWHERE = new Set(['-C', '--git-dir', '--work-tree']);
const GLOBAL_WITH_VALUE = new Set([...ELSEWHERE, '-c', '--namespace', '--exec-path', '--config-env']);

const FORCE = /^--(force|force-with-lease|force-if-includes|mirror)(=|$)/;
const DELETE = /^--(delete|prune)$/;
const ELSEWHERE_PUSH = /^--(repo|receive-pack|exec)(=|$)/;
const PUSH_WITH_VALUE = new Set(['-o', '--push-option', '--repo', '--receive-pack', '--exec']);

const SEGMENTS = /&&|\|\||[;|&\n\r]/;
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
const unquote = (w: string) => w.replace(/['"]/g, '');

export function checkGit(command: string): GitCheck {
  for (const segment of command.split(SEGMENTS)) {
    const r = checkSegment(segment.trim().split(/\s+/).filter(Boolean).map(unquote));
    if (r.kind === 'deny') return r;
  }
  return OK;
}

function checkSegment(words: string[]): GitCheck {
  let i = 0;
  while (i < words.length && ASSIGNMENT.test(words[i] as string)) i++;
  const program = words[i];
  if (program !== 'git' && !program?.endsWith('/git')) return OK;
  const configs: string[] = [];
  let elsewhere = false;
  for (i++; i < words.length && (words[i] as string).startsWith('-'); i++) {
    const [opt, inline] = splitOption(words[i] as string);
    if (ELSEWHERE.has(opt)) elsewhere = true;
    if (!GLOBAL_WITH_VALUE.has(opt)) continue;
    const value = inline ?? words[++i] ?? '';
    if (opt === '-c') configs.push(value);
  }
  const redirect = configs.find((c) => REDIRECTING_KEY.test(c));
  if (redirect) return deny(`git -c ${redirect.split('=')[0]} can't be set here — it reroutes git commands`);
  const sub = words[i];
  const args = words.slice(i + 1);
  if (sub === 'push') return elsewhere ? deny(PUSH_ELSEWHERE) : checkPush(args);
  if (sub === 'remote') return checkRemote(args);
  if (sub === 'config') return checkConfig(args);
  return OK;
}

const splitOption = (w: string): [string, string | undefined] => {
  const at = w.indexOf('=');
  return at > 0 && w.startsWith('--') ? [w.slice(0, at), w.slice(at + 1)] : [w, undefined];
};

const PUSH_ELSEWHERE =
  "Push from inside this project's folder (no -C, --git-dir or --work-tree): pushes go to this project's own origin only";
const NO_FORCE =
  'Force pushes and history rewrites are refused (no --force, -f, +refspec or --mirror). Pull and merge, then push normally';
const NO_DELETE =
  'Deleting remote branches is refused (no --delete, -d, :branch or --prune) — others may use them';

function checkPush(args: string[]): GitCheck {
  const positionals: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i] as string;
    if (!a.startsWith('-') || a === '-') {
      positionals.push(a);
      continue;
    }
    if (a === '--') {
      positionals.push(...args.slice(i + 1));
      break;
    }
    const [opt] = splitOption(a);
    if (FORCE.test(opt)) return deny(NO_FORCE);
    if (DELETE.test(opt)) return deny(NO_DELETE);
    if (ELSEWHERE_PUSH.test(opt)) return deny(`${opt} is refused — push to this project's origin`);
    if (!a.startsWith('--')) {
      const flags = a.slice(1);
      if (flags.includes('f')) return deny(NO_FORCE);
      if (flags.includes('d')) return deny(NO_DELETE);
      if (flags.endsWith('o') && !flags.includes('=')) i++; // -o takes the next word
      continue;
    }
    if (PUSH_WITH_VALUE.has(opt) && !a.includes('=')) i++;
  }
  const [remote, ...refspecs] = positionals;
  if (remote !== undefined && !OWN_REMOTES.has(remote))
    return deny(`Push to origin only (this project's own repo), not '${remote}'`);
  if (refspecs.some((r) => r.startsWith('+'))) return deny(NO_FORCE);
  if (refspecs.some((r) => r.startsWith(':'))) return deny(NO_DELETE);
  return OK;
}

const REWIRING_REMOTE = new Set(['add', 'set-url', 'rename', 'remove', 'rm']);

function checkRemote(args: string[]): GitCheck {
  const verb = args.find((a) => !a.startsWith('-'));
  return verb && REWIRING_REMOTE.has(verb)
    ? deny(`git remote ${verb} is refused — the studio sets this project's origin`)
    : OK;
}

const CONFIG_READS = /^(--get|--get-all|--get-regexp|--list|-l|--show-origin)$/;
const CONFIG_WRITES = /^(--add|--unset|--unset-all|--replace-all|--rename-section|--remove-section)$/;

function checkConfig(args: string[]): GitCheck {
  const key = args.find((a) => REDIRECTING_KEY.test(a));
  if (!key) return OK;
  const positionals = args.filter((a) => !a.startsWith('-'));
  const verb = positionals[0];
  const reads =
    verb === 'get' ||
    verb === 'list' ||
    (args.some((a) => CONFIG_READS.test(a)) && !args.some((a) => CONFIG_WRITES.test(a))) ||
    (positionals.length === 1 && !args.some((a) => CONFIG_WRITES.test(a)));
  return reads
    ? OK
    : deny(`Setting ${key} is refused — it reroutes git commands (remotes and aliases stay as they are)`);
}
