# Always Merged: live check (Elon, 2026-11-23)

**Result: all three cases landed on master by themselves. The user did nothing, and no line asked them to
merge, push or review.** Nothing was sent back to Uncle Bob.

## How it was run

- A throwaway backend from this branch (same code as master `80bd216`), with real agents on a cheap model:
  `PORT=3569 AI_STUDIO_SELF_INSTALL=0 AI_STUDIO_MODEL=claude-haiku-5-5 AI_STUDIO_HOME=<d>/home
  AI_STUDIO_SANDBOX=<d>/sandbox AI_CONTROL_HOME=<d>/control npm start --prefix server`, where `<d>` is a gitignored
  `amcheck/node_modules/d`.
- The sandbox project `lumen` is a `git init -b master` repo with one commit (a 7-line README). The seeded project
  Atlas was pointed at it with `PATCH /projects/atlas {"folder":"lumen"}`.
- `live-check.mjs start "<goal>"` posts the goal. `CHECK_FOLDER=<d>/sandbox/lumen [CLASH=1|dirty] live-check.mjs
  watch <id>` follows its items and disturbs the project folder mid-build. At the end it prints master's graph, the
  folder's status and the branches.
- Cost: about $1 of agent time across the three goals.

## Cases

| # | Case | What happened | Result |
|---|---|---|---|
| 1 | Plain task: change the Notes line | Landed as `789aa23`, a fast-forward. The builder also added `.project` `test: node tools/…/check-readme.js`, so every later landing ran a test. | ✅ on master, folder clean, branch deleted |
| 2 | **Clash:** the task changes the Tagline while the "user" commits a different Tagline on master (`7dbc85b`) | Landing found the clash (stage `merge`, `mergeTries` 1, a `merge-fix` back to the same builder). The builder resolved it in its own checkout (`0930710`, "Merge master into tagline branch"). Master was fast-forwarded to it, with no merge in the user's folder. About 15 s from clash to landed. | ✅ on master, folder clean, branch deleted |
| 3 | **Unsaved edit:** the user leaves an uncommitted line in README.md in the project folder while a task edits README.md | The edit was saved as its own commit on master (`199485f` "AI Studio: saved changes found in the project folder"). The landing went round again (merge in the checkout → `190629a`) and fast-forwarded. Both the user's line and the task's About section are on master. | ✅ nothing lost, folder clean |

What the director said (Atlas thread): "…and the change is merged into main", "The README tagline step is done and
merged into main". Never "waiting for review/merge", never "say the word". The server log had no errors.

## Small things seen (not landing bugs; no send-back)

1. **"main" instead of "master".** The director said "merged into main", but the branch is `master`, because
   report-in's `mergedLine` said "main" literally. **Fixed here:** it now names the item's own main branch
   (`workspace.main`), with a test in `report-in.test.ts`.
2. **The planner adds a "Set up the project base" step** in front of a one-line goal. The first builder then does
   the whole goal, and the real step ends "already in place, no commit" (cases 1 and 3). Nothing breaks and it
   lands, but it is wasted work. This is the planner's base-setup rule, not Always Merged.
3. In case 2 the director rightly flagged that the user's own "glow in the dark" tagline was overwritten. That is a
   real product question, not a merge chore.

## Not covered live (covered by tests)

- A clash the builder can't fix in `MAX_MERGE_TRIES` → back to the director as `unlanded`, never `failed`
  (`worktrees-flow.test.ts`, `team-flow.test.ts`). A cheap model fixed every clash on the first try, so this path
  didn't come up live.
- A failing `test:` line → `test-fix`. The test step ran on landings 2 and 3 and passed. A failing run wasn't forced.
- The folder on another branch (moving main by `update-ref`). Covered in `worktrees.test.ts`.
