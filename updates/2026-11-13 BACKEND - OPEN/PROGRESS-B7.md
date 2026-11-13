# PROGRESS — B7 Health check — ✅ done (219 tests)

Resume notes. Plan: `update v1.md`; lessons: `wiki.md`; API + contract: `server/README.md`. FakeRunner only — no live runs.

## Done (9 new tests → 219 total)
- `src/health/git-status.ts` — local git status (branch, clean + change count, last commit, commits, first remote with
  credentials stripped), `githubRepo()` parsing, `gh repo view <repo> --json visibility` probe (read-only, 10 s) used only when
  asked + GitHub remote + gh installed (`findGh`: /opt/homebrew/bin, /usr/local/bin, /usr/bin).
- `src/health/health.ts` — `check()` = one `crew.call` with contract `health` in the project folder: tools Read/Glob/Grep/Bash,
  allow-list `HEALTH_ALLOWED` (ls, pwd, git status/log/diff/show/ls-files/shortlog), no secrets, caps 15 turns; one repair,
  then 502; persisted to `health_reports` (migration 9) with the git snapshot and usage (attempts, turns, tokens); event
  `health.checked`; one check per project at a time. `get()` = latest + history (≤ 20) + live local git.
- `crew/structured.ts` gained an optional `workspace` (cwd + tools + allow-list); `RunSpec.allowedTools`.
- Routes `POST/GET /projects/:id/health`; main passes `ghProbe` when gh is installed (tests/default: null → never called).
- Fake brain answers `health` (so `AI_STUDIO_RUNNER=fake` serves it). Real-server check (fake runner, temp home, port 4349):
  fresh project + one untracked file → report B/A/B, git dirty (1 change), `health.checked` with `dirty: true` on the stream.
- Tests: temp git repos (no repo, empty repo, dirty, remotes, credential stripping, gh asked only for GitHub remotes, gh error),
  health service (read-only spec + CLI args, persistence/history/event, repair then 502, 409s), a recorded-style stream fixture
  (`test/fixtures/health-stream.jsonl`) parsed + validated.

## A live health check (not run — needs the user's go)
`POST /projects/hello-studio/health {}` (or smoke-six) on the real CLI: ONE run in the project folder, read-only tools, typically
4–10 turns (Glob, a few Reads, `git log`) plus at most one repair turn; caps 15 turns. Input is mostly cache (≈ 5–8k fresh + cache
reads growing per turn, cf. B6's agent runs ≈ 25k cache read for 4 turns), output ≈ 0.5–1.5k tokens. No GitHub call (neither
sandbox project has a remote). Verifies: the allow-list holds (no writes possible), the model follows the `health` contract,
grades are sensible on a tiny project.

## Notes
- `smoke-six` (sandbox) is left as the B6 evidence: `update v1.md` is still staged from Semicolon's capped run.
