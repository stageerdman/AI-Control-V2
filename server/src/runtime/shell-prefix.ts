/* Setting-prefixed commands (G1): `NAME=value [NAME2=value2] <allowed command …>`, e.g. `PORT=3932 node server.js`.
   Claude Code's allow-list patterns (`Bash(node *)`) don't match a command that starts with an assignment, so a
   PreToolUse hook (shell-hook.ts) runs this check and approves exactly these — everything else keeps the normal rules.
   Pure. Literal values only: no `$`, backticks, `$(`, `;`, `&`, `|`, `<`, `>`, newlines, parentheses or backslashes
   anywhere in the command; names that would change how commands are found or run (PATH, LD_… and DYLD_…, GIT_…, auth
   overrides…) are refused. Git's push limits are the git guard's (git-guard.ts), which the hook runs first. */

export type PrefixCheck =
  /** Not a setting-prefixed command: the normal permission rules decide. */
  { kind: 'plain' } | { kind: 'allow'; names: string[]; command: string } | { kind: 'deny'; reason: string };

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
/** One leading assignment: NAME=bare | NAME='literal' | NAME="literal", then whitespace. */
const ASSIGNMENT = /^([A-Za-z_][A-Za-z0-9_]*)=('[^']*'|"[^"]*"|[^\s'"]*)\s+/;
/** Anything that makes the shell do more than run one program with literal arguments. */
const META = /[$`;&|<>()\\\n\r]/;
const FORBIDDEN_NAMES = new Set([
  'PATH',
  'IFS',
  'ENV',
  'BASH_ENV',
  'SHELL',
  'HOME',
  'PS4',
  'PROMPT_COMMAND',
  'NODE_OPTIONS',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_BASE_URL',
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_VERTEX',
  'CLAUDE_CODE_OAUTH_TOKEN',
]);
const FORBIDDEN_PREFIXES = ['LD_', 'DYLD_', 'GIT_', 'NPM_CONFIG_', 'npm_config_'];

export function checkPrefixed(raw: string, allowed: readonly string[]): PrefixCheck {
  const command = raw.trim();
  if (!ASSIGNMENT.test(command)) return { kind: 'plain' };
  if (META.test(command))
    return {
      kind: 'deny',
      reason:
        'Setting-prefixed commands take literal values only — no $, backticks, ;, &, |, <, >, ( ), \\ or newlines. Write the value out, e.g. PORT=3932 node server.js',
    };
  const names: string[] = [];
  let rest = command;
  for (let m = ASSIGNMENT.exec(rest); m; m = ASSIGNMENT.exec(rest)) {
    const name = m[1] as string;
    if (!NAME.test(name)) return { kind: 'deny', reason: `'${name}' is not a plain setting name` };
    if (FORBIDDEN_NAMES.has(name) || FORBIDDEN_PREFIXES.some((p) => name.startsWith(p)))
      return { kind: 'deny', reason: `${name} can't be set on a command here — it changes how commands run` };
    names.push(name);
    rest = rest.slice(m[0].length);
  }
  const words = rest.split(/\s+/).filter(Boolean);
  const program = words[0];
  if (!program)
    return { kind: 'deny', reason: 'A setting needs a command after it, e.g. PORT=3932 node server.js' };
  if (program.includes('='))
    return {
      kind: 'deny',
      reason: `Couldn't read '${program}' as a setting — use NAME=value with a literal value`,
    };
  if (/['"]/.test(program) || !allowed.includes(program))
    return { kind: 'deny', reason: `'${program}' isn't an allowed command (${allowed.join(', ')})` };
  return { kind: 'allow', names, command: rest };
}
