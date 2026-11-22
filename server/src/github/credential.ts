/* How git reaches github.com: through gh's login (`gh auth git-credential`), so neither the studio's pushes nor an
   agent's need any other git setup. Pure. */

export const GH_HELPER_KEY = 'credential.https://github.com.helper';
export const ghHelper = (ghBin: string) => `!${ghBin} auth git-credential`;

/** AGENTS PUSH: env for an agent run's own git — github.com logins through gh, and never a prompt (a run can't
    answer one, so a missing login fails at once instead of hanging the push). */
export function agentGitEnv(ghBin: string | null): Record<string, string> {
  return {
    GIT_TERMINAL_PROMPT: '0',
    ...(ghBin
      ? { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: GH_HELPER_KEY, GIT_CONFIG_VALUE_0: ghHelper(ghBin) }
      : {}),
  };
}
