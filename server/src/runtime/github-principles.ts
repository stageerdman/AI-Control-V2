/* AGENTS PUSH: the studio-wide GitHub working principles, the same words in every agent's run on every
   project (compose.ts) and in the orchestrator's (threads.ts). Nobody approves a push: the user's rule.
   The hard limits are enforced by git-guard.ts; these lines say how to work inside them. */
export const GITHUB_PRINCIPLES_TITLE = 'GitHub working principles';

export const GITHUB_PRINCIPLES = [
  '- Commit small, one change at a time, with a clear message that says what and why.',
  '- Run the tests before you push; push only when they pass.',
  '- Before you push, pull with rebase (`git pull --rebase`) and resolve any conflicts yourself.',
  '- Never force push or rewrite shared history (`--force`, `-f`, `+refspec`, amending or rebasing pushed commits); never delete remote branches or change remotes.',
  '- Never commit secrets or `.env` files; keep dependency folders like `node_modules` out of git.',
  "- Push only to this project's own `origin` — never another remote or another project's repo.",
  "- Push, rebuild and deploy yourself with the project's own scripts when the work needs it. Nobody approves a push: never ask the user (or anyone) for permission to push or deploy.",
].join('\n');

/** The principles as a prompt section. */
export const GITHUB_PRINCIPLES_SECTION = `## ${GITHUB_PRINCIPLES_TITLE}\n\n${GITHUB_PRINCIPLES}`;
