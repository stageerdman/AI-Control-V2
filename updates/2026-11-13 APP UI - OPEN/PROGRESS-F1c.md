# PROGRESS — F1c Real team work (server) — ⏳ in progress

Resume notes. Plan: `update v1.md` (Overnight final build). Builds on `PROGRESS-F1b.md`. API: `server/README.md`.
Commits prefixed `ENGINE F1c:`. `app/` is F2's — not touched here.

## Items
1. ⏳ Captains delegate — captain splits a team item into member sub-tasks (structured, validated), members build in
   their own checkouts (cap respected), captain integrates (member branches → item branch, conflicts → member merge-fix,
   one bounded rework round), then the item's collaboration gates, then main. Events `team.split`, `handoff` delegate/deliver.
2. ⏳ Features flow — goals link to a feature (created in "now" when needed); goal done → feature shipped (`feature.shipped`).
3. ⏳ Run the app — `.project` `run:` (or package.json dev/start), `GET/POST /projects/:id/app[/start|/stop]`, `PATCH …/app {command}`,
   one process per project, log tail (redacted), url detection, stopped on shutdown; health shows it.
4. ⏳ Real-app blockers — first goal on an empty project sets up the stack + records `run:` + fills CLAUDE.md project rules; "don't push".
5. ⏳ Live check — fresh sandbox project, team captain → 2 members, gate review, merge, feature shipped, app started.

## Done
(nothing yet)
