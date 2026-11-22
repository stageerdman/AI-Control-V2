# Agents push — lessons

- **The hook is the guard.** Claude Code's `--disallowed-tools` patterns match only a command prefix, so they
  can't tell `git push origin main` from `git push origin +main`. The shell hook parses the whole command
  (`runtime/git-guard.ts`, pure, unit-tested) and is where every limit lives. The deny patterns are a backstop
  for when the hook can't run.
- **If the hook process itself fails, Claude Code proceeds.** Keep the hook small and dependency-free.
- **Agents need credentials in their env.** A headless run has no keychain prompt: without gh's credential
  helper and `GIT_TERMINAL_PROMPT=0` a push to github.com hangs or fails. `agentGitEnv(ghBin)` sets both;
  ssh origins need `SSH_AUTH_SOCK` passed through.
- **`.` is a legal target.** `git push . HEAD:master` is a local fast-forward, not another remote.
- **Live check:** `npm run check:push` (server/) — a real agent on a scratch project with a bare-repo origin.
