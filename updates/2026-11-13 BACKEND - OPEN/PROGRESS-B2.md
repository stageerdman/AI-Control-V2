# PROGRESS — B2 Blueprint & Project Setter

Resume notes. Plan: `update v1.md`; lessons: `wiki.md`; API: `server/README.md`.

## Done ✅ (27 new tests → 106 total)
- `src/blueprint/modules.ts` — read `<controlHome>/modules/*.md` (read-only), order
  STRUCTURE, CODING, UX, WORKFLOW then alphabetical; `compileClaudeMd` = header (name, about,
  "compiled from …" note) · each module body with headings demoted one level (description
  line dropped) · `## Project-specific rules`, joined by `---`.
- `src/blueprint/templates.ts` — `.project` (same format as the studio's own), `.gitignore`,
  `issues.txt`, first `updates/<date> INIT - OPEN/` (update v1.md + wiki.md).
- `src/setter/scaffold.ts` — one `scaffold()` for new + adopt: preflight-resolves every target
  through the sandbox guard, creates only missing items (`wx`, never overwrites; the one edit is
  appending `.env` to a `.gitignore` that lacks it), `.env` 0600, `git init -b main`, commits
  exactly what it added (`git commit --only`). Steps `{step, status, detail}` with `onStep`
  callback (running → done|kept|skipped) for B4. `inspect()` = disk vs expected.
- `src/setter/git.ts` — local only; user's identity, falls back to "AI Studio" if none.
- `src/setter/finish.ts` — draft → project in ONE `store.tx`: create project, delete draft,
  scaffold last; any throw rolls back and removes a folder it created. `plan.teamIds/agentIds`
  (if present) staff the project.
- Routes: `GET /blueprint`, `POST /drafts/:id/finish`, `GET /projects/:id/scaffold`,
  `GET /sandbox/folders`.
- Real run (defaults): draft "Hello Studio" → finished → `~/dev/AI-Studio-Sandbox/hello-studio`
  with the full scaffold, one local commit `3b7fdab AI Studio: set up Hello Studio`, clean
  status, no remote. Left in place as the first sandbox project.

## Gotchas
- Tests set `GIT_CONFIG_GLOBAL=/dev/null` (test/setup.ts) so they never depend on the dev's git.
- The repo working tree is shared with the B3 builder: commit only your own paths, pull with
  `--autostash`, and run `biome check --write` on your own files only. For a real run against
  `~/.ai-studio`, run from a `git worktree` of HEAD so someone's uncommitted migration never
  touches the real db.
- `finish` for `new` refuses a folder that exists and isn't empty (409 → adopt instead).

## Next
- B4 live events: stream `onStep` from `finishDraft` (already a parameter).
