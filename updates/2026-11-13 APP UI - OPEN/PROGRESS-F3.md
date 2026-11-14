# PROGRESS — F3 Real-AI end-to-end (server) — ✅ done (6 live runs, 4 apps working, 9 issues fixed, 320 tests)

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

### Run 3 — F3 Recipe Scaler (fresh web app, team + reporter, mixed goal) — ✅ **clean: no user answer, no send-back, no hand stop**
`~/dev/AI-Studio-Sandbox/f3-recipe-scaler`, Pixel; fixes 1–6 live. Run in parallel with run 4.
| step | what happened |
|---|---|
| setup | "a web team + QA, and a short report first" → F1c Web Crew + Professor Prompt (reporter) + Scarlett, gate quality after the crew. 26 s |
| goal | report item first (the Professor), then 2 team items for the captain; feature **Recipe Scaler** |
| report | "Reading and friendly-rounding recipe ingredient amounts" (~45 example lines) |
| item 2 | captain's split (self) wrote an exact interface (`parseLine → {qty, qtyMax, unit, unitType: kitchen\|metricSmall\|…}`) straight from the report — the build "Done before you" carried it; tests use the report's example lines → Scarlett approved first time → merged |
| item 3 | split → captain (recent-recipes module), Pete (page), Twinkle (styles), parallel; members coded against each other's briefs ("follows the brief's interface exactly") → integrated → approved first time → merged |
| outcome | goal done, feature **Shipped**, 1 unread report; 0 asks, 0 send-backs; no worktree / `studio/*` left, tree clean; `npm test` 69/69 |
| app | Run the app → `http://localhost:3000`; headless Chrome: default 4→6 servings "1 1/2 cups flour" → "2 1/4 cups flour", 200 g → 300 g, "salt to taste" kept; new recipe 2→3: "3/4 cup sugar" → "1 1/4 cup sugar", 250 ml → 380 ml, 3 eggs → 5; servings 0 → "Servings must be numbers greater than 0."; recents survive reload; 0 console errors (`shots/f3-recipe-scaler-app.png`). Nit (app, not engine): "1 1/4 cup" not "cups" |
Usage: ≈ 13 runs, ≈ 160 turns (≈ $3.8 API-equivalent).

### Run 4 — follow-up goal on Habit Hatch (iteration) — ✅ shipped + works (2 issues → fixed)
"Add a weekly view: last 7 days as dots, tick yesterday too; keep tests passing, add tests." Parallel with run 3.
- dispatch: 1 team item; **linked the already-shipped feature "Habit tracking"** → nothing moved on the features folder; overall stayed 100 % while new work ran (bug 7).
- split → captain (logic `src/week.js` + tests), Pete (page), Twinkle (styles). Pete's part conflicted with the captain's (`src/week.js`) → **merge-fix sent back to Pete, resolved on its own** → integrated (52 tests).
- Scarlett: changes (duplicated day helper, dead `isYesterday`) → the captain's rework **did nothing**: on `--resume` the CLI first answered the last session's killed background shell with an empty result and the runner took it as the answer (bug 8) → Scarlett: "neither fix is in" (send-back 2 of 2) → the captain fixed both → approved → merged.
- outcome: goal done, main +8 commits, nothing left behind, `npm test` 52/52. Browser: 7 dots per habit, Yesterday tick + today → "2 days", 2 filled dots after reload, 0 errors (`shots/f3-habit-hatch-weekly.png`).
Usage: ≈ 13 runs, ≈ 110 turns (≈ $3.1 API-equivalent).

### Run 5 — F3 Todo CLI (fresh, a command-line app) — ✅ **clean: no user answer, no hand stop**
`~/dev/AI-Studio-Sandbox/f3-todo-cli`, Maestro, staffing left to it → specialists Captain Semicolon + Scarlett, gate quality. Parallel with run 6.
- 2 items (setup, then the commands) → item 1 approved first time; item 2: **Scarlett sent it back once for a real bug** (a second broken
  `todos.json` overwrote the first backup — she committed a failing check in `tools/scarlett-scenario/`) → fixed → approved → merged.
- outcome: feature **Todo CLI basics** shipped, `npm test` 30/30, nothing left behind, `todos.json` ignored.
- Run the app → `node todo.js` → **exited 0** with the list + help in its log (a CLI ends by itself — see For the UI). By hand: add ×2,
  done 1, list `[x] buy milk / [ ] call mum`, remove 2, survives between runs, `done 9` → "There is no todo 9." exit 1.

### Run 6 — follow-up goal on Bookmark Box (iteration, specialists) — ✅ **clean**
"Add search (?q=, title or url, case-insensitive, with ?tag=) and GET /bookmarks/:id; tests + README."
- dispatch made a **new feature "Bookmark search and lookup"** in Now (fix 7 live) → office 50 % (1/2) while it ran → 1 item → approved
  first time → merged → Shipped, office 100 % (2/2).
- Run the app: `?q=node&tag=js` → the right one, `/bookmarks/2` → it, `/bookmarks/999` → 404; **run 2's data still there**. 24/24 tests.

### Apps side by side + adoption
- Habit Hatch and Recipe Scaler both defaulted to port 3000 and both "ran" (one on 127.0.0.1, one on ::1) → the browser showed
  whichever `localhost` resolved to (bug 9) → fixed: after it, Habit Hatch :3931, Recipe Scaler :3375, Bookmark Box :3804 run at once,
  each answers with its own page/API (the agents had already written `PORT` support).
- **Adoption check** (fake-runner backend on :4602 with an empty data dir, on a throwaway copy of f3-todo-cli): New → adopt the folder →
  Setter: every scaffold step "kept / left untouched", no commit; files byte-identical (md5); finish → the project, `run: node todo.js`
  picked up from `.project`. Copy removed afterwards.

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
7. **(6f9eec8) A follow-up linked the shipped feature** → the dispatch rule now says a Shipped feature is done: a goal that ADDS
   something new gets a NEW feature; link a shipped one only for a fix. Test: `team-flow.test.ts` (prompt).
8. **(3ced630) A `task-notification` result taken as the answer** — the CLI answers its own background-task notices with a result
   (`origin.kind: task-notification`): after the answer (fix 2) and, on `--resume`, BEFORE the task (the last session's killed shell; empty,
   0 turns). The runner closed stdin on it, so the rework never ran. Now a notice is never the answer (before or after it only adds
   turns/tokens; cost = the CLI's cumulative max). Fixture `live-f3-resume-notice-first.jsonl` → `live-f3.test.ts` (fails without).
   (Runs 5–6 had no background notices, so this one is proven by the replayed real stream, not by a second live hit.)
9. **(0e7a145) Two apps on the same port** → Run the app now sets `PORT` per project (3100–3999, stable per id, next free if another
   running app holds it; the view has `port`), and build briefs say "a server reads its port from PORT (default 3000)". Tests:
   `app-runner.test.ts` (real process prints its PORT; `portFor` stable/skips taken). README updated. Confirmed live (3 apps at once).

## Reliability evidence (final)
| run | app | intervention | send-backs | outcome |
|---|---|---|---|---|
| 1 | Habit Hatch (web) | 1 answer (bug 3) | 0 | shipped, browser-verified |
| 2 | Bookmark Box (API + report) | 1 answer (bug 5) + 1 hand stop (bug 6) | 0 | shipped, curl-verified |
| 3 | Recipe Scaler (web, team + report) | **none** | 0 | shipped, browser-verified |
| 4 | Habit Hatch follow-up | none (but 1 wasted send-back, bug 8) | 2 | shipped, browser-verified |
| 5 | Todo CLI (fresh) | **none** | 1 (a real bug caught) | shipped, CLI-verified |
| 6 | Bookmark Box follow-up | **none** | 0 | shipped, curl-verified |
Every run: goal done, feature Shipped, all work merged into main, no checkout / `studio/*` branch left, tree clean, the project's tests
green (36→52, 16→24, 69, 30). Runs 3, 5, 6 went end to end with no intervention; each issue from runs 1, 2, 4 has a fix + a test.

## Plan usage (subscription: runs + turns; the CLI's $ is API-equivalent only)
All of F3 (6 runs, 4 projects, incl. setup chats, dispatches, splits, builds, reviews, reports, 1 health check): **64 Claude Code runs,
595 turns** (≈ $14.9 API-equivalent — nothing charged; it's plan usage). Per run: 1 ≈ 18 runs / 108 turns · 2 ≈ 9 / 95 · 3 ≈ 13 / 160 ·
4 ≈ 13 / 110 · 5 ≈ 8 / 94 · 6 ≈ 3 / 31. Crew calls (setup chat, dispatch) are small: 12 runs, 12 turns in total.

## For the UI
1. **Run the app view:** use `url` (now a per-project port, e.g. :3931 — never assume 3000) and show `port`. A **CLI** app ends by itself:
   `status: exited, exitCode: 0` with its output in `log` should read "Ran and finished" + the output, not as a crash (exitCode ≠ 0 = failed).
2. **Item notes are the agents' raw summaries** — they often open with process talk ("It's committed on my branch and not pushed", "I
   haven't opened it in a browser"). On the whiteboard show a clipped first sentence, the rest on hover/zoom.
3. **Follow-up goals now add a new feature** → overall % drops (100 → 50 "1 of 2 shipped") while it runs; make that read calm and expected.
4. **Asks**: members no longer ask about teammates' parts, but an ask can still come mid-run (both live ones had good `options` — "Use your
   assumed shapes" / "node:sqlite (recommended)"); the pager + options chips are the whole flow.
5. **The desktop app's backend must restart** to pick up these server fixes (it runs `npm start` from `server/` at launch) — quit and reopen.

## Morning notes
- **Built here** (all in `~/dev/AI-Studio-Sandbox/`, local git only, no remotes): `f3-habit-hatch` (web, `npm start`), `f3-bookmark-box`
  (JSON API, `npm start`, README with curl), `f3-recipe-scaler` (web, `npm start`), `f3-todo-cli` (`node todo.js …`). Each has tests
  (`npm test`), `run:` in `.project`, CLAUDE.md project rules, and an `updates/` plan the agents kept.
- **Use them in the real app:** Projects → New → *Adopt* → pick the folder → Rivet keeps everything (verified: nothing changed, no
  commit) → pick an orchestrator + team → office. Their F3 goal/report history lives only in the isolated test db (scratchpad
  `f3/home/studio.db`), not in `~/.ai-studio` — adopting starts a fresh history.
- **Known gaps:** agents can't look at a page in a real browser (they check with `npm test` + node fetch smoke scripts; members say so in
  their summaries) — a toolsmith toolkit with a headless browser would close it; env-prefixed commands (`PORT=… npm start`) are refused
  by the dev shell allow-list (agents adapt); a test failed once in the baseline suite (1 of 311) and never again in ~12 full runs — not
  pinned down; the orchestrator's chat resumes one session, so it may repeat an older idea (it said "four goals" after being told one).
- App nits (agents' work, not the engine): Recipe Scaler says "1 1/4 cup" (no plural); Habit Hatch's streak stays 0 until today is
  ticked (its design: counts back from today).
