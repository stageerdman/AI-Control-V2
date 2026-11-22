# Agents push, rebuild and deploy — v1

## Goal
The user decided: every agent on every project may `git push` to its own project's origin, and rebuild and
deploy, with no approval from anyone. Sea GPS is blocked on this (its saved-routes fix can't go live).

Hard limits that stay:
- no force push or history rewrite (no `--force`, `-f`, `+refspec`, `--mirror`);
- no pushing to other remotes or other projects' repos (only `origin` — or `.` for a local fast-forward —
  and no `-C`/`--git-dir` pointing a push elsewhere, no rewiring remotes or aliases);
- no deleting remote branches (`--delete`, `:branch`, `--prune`).

Done when an agent on a test project pushes a commit to its own origin with no prompt, a force push to
master is refused, tests pass, and it's merged into master. Then Sea GPS's Pixel gets a mail.

## Phases
1. **Git guard (pure).** `server/src/runtime/git-guard.ts`: one function judges a shell command — a `git push`
   inside the limits passes, anything past them is refused with a reason an agent can act on. Unit tests for
   every limit and the normal pushes (branch, `-u`, tags, `HEAD:main`, bare `git push`).
2. **Wire it.** The shell hook (shell-hook.ts) runs the guard on every Bash call, before the setting-prefix
   check; shell-prefix.ts stops refusing `git push`. `--disallowed-tools` keeps a prefix-level backstop for the
   obvious force/delete forms (in case the hook can't run); runs without the hook (crew/review runs with their
   own tools) still can't push at all. Tests: cliArgs, the real hook script.
3. **Rules match.** Checkout lines (dispatch.ts, team.ts) and "How to work here" (compose.ts) say: commit, and
   push to the project's origin when the work needs to go live (rebuild/deploy with the project's own npm/npx
   scripts); no force push, no other remotes, no deleting remote branches. No more "Do not push".
4. **Live check.** A real `claude -p` run on a scratch project with a bare-repo origin: the agent pushes a commit
   with no prompt; a force push to master is refused. Opt-in test (`AI_STUDIO_PUSH_CHECK=1`).
5. **Ship.** Full suite green, merge into master, mail Sea GPS.

Rebuild/deploy: the projects that deploy today do it through `npm run …` / `npx …` (Cloudflare Pages via
wrangler, `tauri:build`), which the dev shell already allows, and native Mac builds have their own tools.
The only thing blocking them was `git push`.

## Status
- [x] Phase 1 — git-guard.ts + 55 unit tests.
- [x] Phase 2 — hook runs the guard first; prefix deny patterns as backstop; agent runs get gh's credential
  helper and `GIT_TERMINAL_PROMPT=0` (github/credential.ts `agentGitEnv`), and `SSH_AUTH_SOCK` for ssh origins.
- [x] Phase 3 — "Do not push" gone from dispatch.ts / team.ts; PUSH_LINE in compose.ts.
- [x] Phase 4 — `npm run check:push` passed with a real agent: pushed with no prompt, force push to master refused.
- [x] Phase 5 — full suite 1160 passed; merged into master; Sea GPS mailed.

## Decisions
- The hook is the real guard; `--disallowed-tools` patterns are only a prefix backstop for plain
  `--force`/`-f`/`--delete` forms.
- `.` is allowed as a push target, so an agent can fast-forward a local branch (e.g. into master).
- Not airtight against deliberate tricks (e.g. `git subtree push`); a GitHub branch protection rule on `main`
  is the server-side guard if one is ever needed.
- The new rules apply to runs started after the studio restarts on the new master.
