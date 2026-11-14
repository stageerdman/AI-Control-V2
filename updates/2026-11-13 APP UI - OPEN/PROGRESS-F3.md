# PROGRESS — F3 Real-AI end-to-end (server) — ⏳ in progress

Resume notes. Plan: `update v1.md` (Overnight final build → F3). Builds on `PROGRESS-F1b.md`, `PROGRESS-F1c.md`. API: `server/README.md`.
Commits prefixed `ENGINE F3:`. `app/` is F2's — not touched here.

## Harness (scratchpad `f3/`)
- Isolated data dir `f3/home` (an sqlite `.backup` of the real `~/.ai-studio/studio.db` — real Cast incl. F1c Web Crew; the real db is
  untouched, a byte copy is kept as `f3/studio-backup-real.db`). Backend on **:4601**, real runner (`/opt/homebrew/bin/claude`, opus 5.5),
  `start.sh` / `restart.sh` (restart = the lock's pid → SIGTERM → start; only between runs).
- `drive.mjs` walks the API the way the app's UI does: `POST /drafts` (name + about) → PATCH step/orchestrator → `POST …/setup` (Rivet)
  → `POST …/chat {}` (the orchestrator opens) + one user line → `accept` (Tinker mints any briefs) → `finish` → office: orchestrator thread
  turn (`POST …/threads/<orch>/messages`) → the goal (`POST …/work`, what the director chat does for goal-like text) → poll the whiteboard
  → `POST …/app/start` → curl / headless screenshot.

## Runs
### Run 1 — F3 Habit Hatch (web app, localStorage, tests) — ✅ shipped, app works (1 user answer needed → fixed)
`~/dev/AI-Studio-Sandbox/f3-habit-hatch`, orchestrator Pixel.
| step | what happened |
|---|---|
| setup | draft → Rivet (`ab9eb36`) → Pixel opened with F1c Web Crew + Scarlett (QA); "keep it lean" → same + gate quality after the crew → Scarlett, maxSendBacks 2; accept (nothing to mint) → finish. 17 s |
| chat | "how would you split that up?" → a sensible 4-step answer, but **"I don't see a team on the project yet"** (bug 1) |
| goal | 1 dispatch: 2 items for the captain (setup, then the habits), feature **Habit tracking** (new, Now) |
| item 1 | captain split → team: captain (server/tests/run line), Pete (starter page), Twinkle (base styles), parallel → merged into the team branch → captain integrated (npm test, `npm start` smoke) — its summary was **replaced by a reaction to its background server ending** (bug 2) → Scarlett approved → merged |
| item 2 | split → captain (streak + storage logic + tests), Pete (page), Twinkle (styles). **Pete stopped with an `ask_user`**: his brief said "use the shapes from the captain's sub-task" and he never saw it (bug 3) — answered as a user would ("Use your assumed shapes") → captain integrated and **caught the `done` vs `doneDates` mismatch**, added a page test → Scarlett approved (her QA smoke script now follows module imports) → merged |
| outcome | goal done 100 %, feature **Shipped**, office idle 100 % (1/1); main has 13 commits, `git worktree list` = main only, no `studio/*` branch; `npm test` 36/36 |
| app | Run the app → `npm start` (`run:` from `.project`) → `http://127.0.0.1:3000`; headless Chrome: add 2 habits, tick → "1 day", reload keeps both + the tick, untick → "0 days", delete + reload → gone, **0 console errors** (`shots/f3-habit-hatch-app.png`) |
| health | A / B / A — "needs a README and the removal of one leftover sample file"; git clean, local only; app running |
Usage: 18 runs, 108 turns (≈ $3.44 API-equivalent).

### Run 2 — F3 Bookmark Box (JSON HTTP API + a research report) — ✅ shipped, API works (1 user answer + 1 hang → both fixed)
`~/dev/AI-Studio-Sandbox/f3-bookmark-box`, orchestrator **Maestro**, staffing left to it (only the "about" text, no chat line).
| step | what happened |
|---|---|
| setup | Rivet (`298910c`) → Maestro chose **specialists only** (Captain Semicolon builds, Scarlett tests, Professor Prompt — the reporter — writes the comparison) + gate quality after Semicolon → Scarlett. 12 s |
| chat | a clear 3-step plan — but **"nobody on the project is set up to file reports"** (bug 4: the people summary marked reporter teams, not reporter roles) → fixed, confirmed live |
| goal | 1 dispatch: report item for the Professor first, then 2 build items for the captain; feature **Bookmark API** (Now) |
| report | the Professor: web research → `file_report` "JSON file vs node:sqlite for Bookmark Box storage" (recommends node:sqlite, 2 sources) → item done |
| item 2 | **the captain couldn't see the report** (it lives in the Reports tray, not the folder) → `ask_user` "which storage should I build on?" (bug 5) — answered as the user ("node:sqlite, as the report says") → built (node:sqlite, tests) → smoke-tested with a background `npm start` with no timeout → **its CLI never exited; the item sat "running" 7+ min** (bug 6) → stopped the process group by hand (what the fix now does) → Scarlett approved → merged |
| item 3 | API (save / list by tag / delete), README with curl examples, 16 tests → Scarlett added a restart smoke check (hard kill) → approved → merged |
| outcome | goal done, feature **Shipped**, office idle 100 %; main = 4 commits, no worktree / `studio/*` branch left, tree clean, `data/` ignored; `npm test` 16/16 |
| app | Run the app → `npm start` → `http://localhost:3000`; curl: 2× POST 201, POST without url → 400, `?tag=js` → 1, **stop + start through the studio → both still there**, DELETE → 204 → gone |
Usage: 9 runs, ≈ 95 turns (≈ $1.94 API-equivalent).

## Issues found → fixed
1. **(b33f888) The orchestrator's office chat didn't know who was on the project** — its per-turn summary had the whiteboard, features
   and health but no staffing, so it told a staffed project "I don't see a team yet" and offered to mint one. Summary now carries
   `people {teams: [{name, captain, members [{name, role}], reporter?}], specialists, howWeWork}`; it suggests ONE goal (dispatch splits
   it). Test: `threads.test.ts`. Confirmed live (it named the crew + Scarlett).
2. **(2a96145) A run's answer could be replaced by a follow-up** — an agent that smoke-tests with a background `npm start` gets a SECOND
   `result` event after its real answer (`origin.kind: task-notification`: the CLI's reaction to that task being stopped). The parser kept
   the last: the item note became "The test copy of the server … has now stopped", turns read 1 instead of 21 — and a reviewer's verdict
   or a captain's `{"rework"…}` line would be lost the same way (→ counted as "changes"). Now the first successful result is the answer;
   follow-ups only add turns/tokens and the cumulative cost. Fixture `live-f3-integrate-background.jsonl` → `test/crew/live-f3.test.ts`
   (fails without the fix).
3. **(022fa03) Members couldn't see what teammates promised** — a member's task listed teammates' parts by title only, so "use the shapes
   from the captain's sub-task" pointed at nothing and Pete stopped to ask the user. Members now get each teammate's brief (≤ 1.5k), are
   told their work isn't in this checkout yet, to code against the briefs and not ask the user about a teammate's part (simplest choice,
   say it in the summary); the split prompt asks for the exact interface in BOTH briefs. Test: `team-flow.test.ts`.
4. **(f2759c8) Reporters by role weren't marked** in the orchestrator's people summary (only reporter teams) → each person carries
   `reporter: true` when their role files reports. Test: `threads.test.ts`. Confirmed live.
5. **(798642d) Later items never saw what earlier items finished** — "build on what the report recommends" while the build run had no
   way to see the report. Every item's task (and a captain's split, and members' parts) now has "Done before you on this goal (build on
   it)": each earlier done item with who + its summary; a report item with the report's title, summary and a 4k body excerpt. Test:
   `reports.test.ts` (mixed goal; fails without the fix).
6. **(6d80871) A CLI that lingers after its answer hung the item** — an agent's background `npm start` without a timeout keeps the
   CLI alive after the result (stdin closed); nothing ended the run. Now: 10 s after the answer the run's whole process group is stopped
   (the leftover server too) and the answer stands. Test: `claude-cli.test.ts` (fake CLI that answers then waits on a child; fails
   without the fix).

## Plan usage (subscription: runs + turns; the CLI's $ is API-equivalent only)

## For the UI
