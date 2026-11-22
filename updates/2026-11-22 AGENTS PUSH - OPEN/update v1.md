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
- [ ] Phase 1
- [ ] Phase 2
- [ ] Phase 3
- [ ] Phase 4
- [ ] Phase 5
