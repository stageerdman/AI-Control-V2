# Always Merged — update v1

**Goal:** every finished change lands on the project's main branch by itself. The user
never reviews, merges, pushes or "says the word". When something gets in the way
(a clash with other work, failing tests, a busy project folder) agents fix it, and
Pixel hears about it as a fact, not as a job for the user.

Feature: `f-always-merged` (Always Merged).

## Phase 0: how work finishes today (done — this design)

### What already works

- Every checklist item works on its own branch in its own checkout
  (`server/src/git/worktrees.ts`). When it is **accepted** (built, every review gate
  approved), `accept()` → `mergeBack()` in `server/src/crew/dispatch.ts` merges it
  into main by itself: fast-forward if it can, else a merge commit, one merge at a time
  per project (`serial`). Then `item.merged`, checkout removed, branch deleted.
- A clash goes back to the builder (`merge-fix`, stage `merge`, up to `MAX_MERGE_TRIES = 2`).
- After a restart, an item whose run had finished merges again (`recover()`).
- Merge is per **task**, not per goal. That is right and stays: later tasks branch off
  main's tip and build on the earlier ones, so a goal-level merge would starve them.

### Why the user was still asked to merge

1. **Pixel repeats the builder's words, written before the merge.** The builder's prompt
   says "commit your work there — it merges into master once accepted. Do not push." So
   builders end with "committed on the branch (not pushed), waits for review and the merge
   into master". Report-in (`server/src/office/report-in.ts`) only fires once the item is
   **done**, which means it is already merged. But Pixel gets only the builder's stale
   note, never the merge itself, and passes it on. In the comms log:
   - 11-19 "committed on Jony's branch but not pushed or merged yet, so say the word"
   - 11-20 "committed on the branch but not pushed yet, so just say the word"
   - 11-22 "It's committed on a branch and waiting for review and merge into master"
   All three were in fact on master already (e.g. `cb06b18`, `cc9f1ec`).
   **This is most of the problem, and the cheapest part to fix.**
2. **Merges that fail without a clash end as `failed`**, with the work left on its branch
   and a note for the user ("The project folder is on another branch, so the work couldn't
   be merged"):
   - the project folder is checked out on another branch;
   - the project folder has unsaved edits in a file the work touches (spike case 2: git
     refuses, `Your local changes … would be overwritten`). In HQ that is real: the user's
     own Claude Code sessions commit straight to master in the same folder;
   - the safety-net commit fails.
3. **A clash the builder can't fix in 2 tries ends as `failed`** → the stall alert, and
   "It needs your call" on the whiteboard.
4. **No tests run before landing.** When main moved, the merge commit is a tree nobody
   built or tested, so master can break silently.
5. **`main` is whatever branch the folder had out when the task started**
   (`open()` reads `HEAD`). If the folder was on another branch then, the work lands
   there, not on master.

Today HQ has 15 `studio/*` branches with work master lacks. All but two are
"work in progress (kept on its branch)": failed, cancelled or interrupted tasks from
11-15 to 11-21. That is **unfinished** work, so it is not part of "always merged" (see
"Not doing").

## Decisions

- **When:** each task lands as soon as it is accepted. There is no goal-level merge.
- **Where the merge happens:** in the task's **own checkout**, never in the user's
  folder. Main is merged *into the branch* there, the tests run there, and only then is
  main moved forward. That move is always a fast-forward (or a plain ref move when main
  isn't checked out). No merge commits or half-merged files ever happen in the user's folder.
- **Clashes and failing tests:** they go back to the builder in the same checkout. If the
  builder can't fix them in its tries, the task goes back to Pixel to give to someone
  else, on the same branch. A landing problem never ends as `failed` and never goes to the user.
- **Parallel branches:** the per-project landing queue stays. The step "merge main into
  the branch, test, fast-forward" runs under the queue, so each landing sees the main
  the earlier ones left. If main moves outside the studio while tests run, the step
  repeats (up to 3 times).
- **Pixel is told after the landing, with the facts:** "merged into master as `abc1234`".
  The rule for every agent: the studio merges, so never tell the user that work waits for
  review, merge or push, and never ask them to do it.

## Phase 1: tell the truth (Pixel and builders)

- The `item.merged` commit is stored on the item (`mergedCommit`, migration). Report-in's
  task then says: "It is merged into <main> (commit abc1234). Anything the note says about
  branches, pushing or waiting for review is out of date: the studio has already done it."
- Report-in and the orchestrator chat prompt (`orchestratorChatPrompt`) get the rule: the
  studio reviews and merges every finished step by itself. Never tell the user work waits
  for review, merge or push. Never ask them to merge, push or review.
- Builder prompt (`dispatch.ts` ~495): "The studio reviews and merges it into <main> for
  you. Don't push, and don't write that it waits for review or merge in your summary."
- Published projects already push after every merge (`github.ts`), so "not pushed" is
  never true for long. The rule covers that too.
- **Tests:** report-in's task holds the merge fact and the rule (fake crew captures the
  task). A done item without a workspace (not a git project) has no merge line. The
  builder and orchestrator prompts carry the rule. A flow test: build → review → merged
  → report-in sees `mergedCommit`.

## Phase 2: land in the checkout, always fast-forward

`worktrees.land(repo, ws)` takes the place of `merge()`:

1. Safety-net commit in the checkout (as today).
2. If main has moved past the branch's base, run `git merge <main>` **inside the
   checkout**. A clash → `{conflict, files}`. The merge is aborted in the checkout, and
   the builder's `merge-fix` redoes it there (the task text stays the same).
3. Move main to the branch tip:
   - main checked out in the project folder → `git merge --ff-only` there. If the folder
     has unsaved edits in files the landing touches, they are first saved as a commit on main
     ("AI Studio: saved changes found in the project folder", never `.env*`,
     `node_modules`, …). Then the landing goes through step 2 again. Nothing is lost.
   - main not checked out anywhere → `git update-ref refs/heads/<main> <tip> <old>`
     (with the old-value guard; spike case 5).
   - The folder on another branch no longer blocks a landing.
4. `main` is the project's main branch, chosen once (the existing `main`/`master`, else
   the branch the folder had out at the first task) and kept on the project. It is not
   whatever happens to be checked out when a task starts.

Team sub-tasks land into the team task's checkout the same way. The captain's checkout
is idle while members work.

- **Tests** (`worktrees.test.ts`, `worktrees-flow.test.ts`):
  - fast-forward;
  - main moved with no clash: the merge happens in the checkout, main moves forward, and
    the user's folder has no merge commit of its own;
  - a clash is aborted in the checkout and main is untouched;
  - unsaved edits in another file still land;
  - unsaved edits in the same file are saved as their own commit, then the work lands;
  - the folder on another branch: main moves by ref;
  - a task started while the folder was on another branch still lands on main;
  - two parallel tasks land one after the other;
  - a restart mid-landing lands it again.

## Phase 3: tests before landing

- `.project` gets an optional `test: <command>` line, read like `run:`
  (`apps/run-command.ts`). Agents record it, and the builder prompt says so next to
  the `run:` line. No `test:` line means no test step. The studio never guesses a command.
- In `land()`, the test runs in the checkout after step 2, before main moves: with
  `PORT` from the project's spares, a 10-minute timeout, and output kept to the last 60 lines.
- If it fails, the task goes back to the builder with a new handoff kind `test-fix`
  (stage `merge`): "main + your work fails `<command>`: <tail>. Fix it in this checkout and
  commit." It counts against the same tries as clashes.
- If it passes, step 3 runs. If main moved meanwhile, step 2 runs again and so do the tests.
- **Tests:** a pass lands. A fail goes back to the builder with the output tail and main
  stays untouched. A timeout counts as a fail. Without a `test:` line the task lands
  as today. Main moving during the test leads to one more merge and one more test.

## Phase 4: never stops with the user

- When the builder has used its tries (clash or tests), the task goes **back to Pixel,
  waiting for a new owner**. This is the same path as `cant_do` and "same note twice"
  (`handover.ts`). Its note reads "<builder> couldn't land it: <reason>", and it stays on
  its branch. Pixel picks a new owner with `edit_task`, and that owner's first task is
  the merge-fix or test-fix in the same checkout. Bounded: one reassignment. A second
  failure goes back to Pixel again. It never becomes `failed`.
- Error messages that exist only for landing problems (`plain-problem.ts`: "project folder
  is on another branch", "Couldn't merge the work back") go away. A clash reads "Its
  changes clash with other work. <agent> is fixing it."
- A landing problem never raises "It needs your call". The stall alert goes to Pixel
  with "reassign it" as the next step.
- **Tests:** a clash that is never fixed goes back to Pixel, not `failed`. Reassigning it
  gives the new owner a merge-fix on the same branch, and the work lands. The stall text
  has no "your call". The whiteboard shows no landing problem as the user's.

## Phase 5: live check

On a sandbox project with two parallel tasks that edit the same file, plus a `test:`
line that fails once:
- both tasks land on master;
- Pixel's lines say "merged", never "waiting";
- the user's folder ends clean with no merge commit of its own.

Also run once on HQ.

## Not doing (add back if needed)

- **Merging unfinished work.** Failed, cancelled or interrupted tasks keep their work on
  their branch, and a retry picks it up there. It is not "finished", so it never lands
  unreviewed. The old HQ branches stay as they are: the user never sees branches, and
  nothing asks them to act.
- **A sweep of stale branches**, **merging per goal**, **`git merge-tree` pre-checks**
  (the checkout merge already tells us about clashes, without touching the user's folder),
  **a separate "integrator" agent** (the builder knows its own change best, and Pixel
  reassigns when it can't).

## Status

- Phase 0 (design + spike): done.
- Checked on master before building (11-23): only phase 0 existed; `merge()` still merged
  in the project folder, refused when it was on another branch, and ended clashes as `failed`.
- Phases 1–4: done (11-23).
  - `server/src/git/land.ts` `land(ws, test?)`: main merged into the checkout, `test:`
    line run there, main fast-forwarded (`merge --ff-only` where it is checked out, guarded
    `update-ref` where it isn't); unsaved edits the landing touches saved first. Shared git
    helpers in `git/run-git.ts`. `worktrees.merge()` is gone → `wt.land()`; `mainBranch()`
    picks `main`/`master`.
  - `.project` `test:` line (`apps/run-command.ts` `testCommandOf`), run by
    `apps/test-run.ts` `testStep` on a project spare port, 10 min, last 60 lines.
  - `dispatch.ts` `mergeBack`: landed → done + `mergedCommit` (migration 52) + `item.merged`;
    clash/tests → builder (`merge-fix` / `test-fix`, ≤ `MAX_MERGE_TRIES`); after that →
    back to the director, stage `merge`, stall kind `unlanded` ("Reassign it … not for the
    user"). A member's part that can't land on its team branch still fails (captain's call).
  - Report-in adds "It is merged into main (commit …) — branch/review talk is out of date";
    the orchestrator prompt and builder prompt say the studio lands it, never ask the user.
  - `plain-problem.ts`: folder-branch message removed; clash reads "Its changes clash with
    other work."
- Phase 5 (live check, 11-23, Elon): done — see `live-check.md`. Real agents on a sandbox repo: a plain task, a
  clash with a commit on master, and the user's unsaved edit in the same file all landed on master by themselves;
  the folder stayed clean; the director said "merged", never "waiting". Not forced live: a clash nobody fixes and a
  failing `test:` line (flow tests cover them).
