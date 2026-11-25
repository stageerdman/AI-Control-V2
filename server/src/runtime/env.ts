/* The run's environment, built from scratch — never the server's own env. Only what a
   CLI needs to run as this user (HOME for the Claude Code login, PATH for git/node),
   then the project's granted secrets. Auth overrides are stripped so the agent always
   uses the Claude Code login, never an API key that happens to be granted to a project. */
import { dirname } from 'node:path';

const PASS_THROUGH = [
  'HOME',
  'USER',
  'LOGNAME',
  'SHELL',
  'TMPDIR',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  '__CF_USER_TEXT_ENCODING',
  /* AGENTS PUSH: a project whose origin is ssh (git@github.com:…) pushes through the user's ssh agent */
  'SSH_AUTH_SOCK',
];
const BASE_PATH = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'];
/** Never handed to the CLI: they'd switch its auth/provider away from the user's login. */
export const AUTH_OVERRIDES = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_BASE_URL',
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_VERTEX',
  'CLAUDE_CODE_OAUTH_TOKEN',
];

export function runEnv(
  parent: NodeJS.ProcessEnv,
  granted: Record<string, string>,
  extra: Record<string, string> = {},
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const k of PASS_THROUGH) {
    const v = parent[k];
    if (v) env[k] = v;
  }
  env.PATH = [...new Set([dirname(process.execPath), ...BASE_PATH])].join(':');
  for (const [k, v] of Object.entries(granted)) if (!AUTH_OVERRIDES.includes(k)) env[k] = v;
  return { ...env, ...extra, ...NO_HIDDEN_MEMORY };
}

/* Claude Code's auto memory is keyed by folder, not by (project, agent), and the studio neither scopes nor shows
   it. The studio's own memory (desk notes, to-dos, my_history) is the only one; nothing may switch this back on. */
const NO_HIDDEN_MEMORY = { CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1' };
