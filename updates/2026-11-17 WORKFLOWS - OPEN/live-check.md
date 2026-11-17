# Workflows — Phase 7 live check (Elon)

## Re-check 2 (2026-11-17, branch at 0949058): not signed off yet

**Verdict:** drawing, saving and reloading work for all three types, and the temporary type runs the way it's
drawn. Real work still ignores three parts of a drawing (gaps below, sent to Uncle Bob). Jony has nothing open.

### How it was run

- Server 828/828 and app 621/621 tests green.
- A real backend from this branch on a throwaway data folder (port 3569):
  `PORT=3569 AI_STUDIO_SELF_INSTALL=0 AI_STUDIO_HOME=<tmp>/home AI_STUDIO_SANDBOX=<tmp>/sandbox
  AI_CONTROL_HOME=<tmp>/control npm start --prefix server`, with `<tmp>/sandbox/aurora` created. First run with
  `AI_STUDIO_RUNNER=fake` (free), then with real agents on `AI_STUDIO_MODEL=claude-haiku-5-5`. Each real goal was
  cancelled once its plan was on the board. Cost: well under $1.
  **Watch out:** if `<tmp>` is inside this repo, run `git init` in `<tmp>/sandbox/aurora` first. Otherwise a real
  agent's `git commit` goes up to the repo around it. That happened here, and the stray commit was undone.
- `live-check-5b.mjs` (Jony's): all ok.
- `live-check-7.mjs`: draws with the editor's own model (`flow/model.ts`), saves the way the screens save,
  reloads, then runs a goal and checks its sign-offs and every task's text. `CHECK_WORK=0` stops after the drawings.
- `live-check-7-real.mjs a|b`: (a) a real planner plans a goal under the drawn office way; (b) the real director
  hears "Pixel Pete, take command of … and use Captain Semicolon".
- On screen: there's no headless browser here, so the screens were checked through their component tests
  (`WorkflowEditor.test.tsx`, `model.test.ts`), which exercise the same props and keyboard path.

### What works

| Check | Office (How we work) | Team (Cast → Ship-It) | Temporary (on top) |
|---|---|---|---|
| Draw: first, final, hand-offs with why, a branch ("only when") | ✅ | ✅ | ✅ read-only, drawn from lead + crew |
| Save → reload is the same drawing | ✅ same people, places, arrows, first/final | ✅ | — |
| Broken drawing refused, each problem pinned to its arrow | ✅ (5b script) | ✅ outsider | — |
| Sign-off arrows become the task's checks | ✅ Lint + Scar on Semic's tasks | ❌ gap 2 | ✅ Pete signs Semic's task |
| Signs last signs last | ✅ Scar's check is last | — | ✅ |
| Each task carries the drawing in words | ✅ "Pixel Pete starts. Pixel Pete hands to Captain Semicolon: … (only if …) … Scarlett Scenario signs last." | ❌ gap 2 | ✅ "Pixel Pete leads this goal: report to them" |

### Gaps (sent to Uncle Bob as work)

1. **A branch on a sign-off is ignored.** Scar's crash-test, drawn "only if it touches payments", was put on
   every Semic task, including "Set up the project stack" and a contact page. `gatesFor` never reads `when`.
   Fix: plan items say which branch labels hold (`branches`). A gate with a `when` applies only when its label is
   listed. If the planner leaves the field out, the gate applies as it does today.
2. **A team's drawing doesn't reach running work.** `teams.workflow` is saved and shown, but the captain's split
   prompt never sees it (or the goal's drawing), and members' sub-tasks get none of the team's sign-offs.
3. **"Starts here" on a team member can't be followed.** The planner may only assign captains, so "Pixel Pete
   starts" turned into two items for Semic. Gap 2 plus one planner line ("give it to the captain; the split puts
   that member first") covers it.
- Small: for a led goal, the director added its own "check and sign off" item for the lead, on top of the lead's
  automatic sign-off.

### Accepted on purpose (not gaps)

- A reload lists hand-offs before sign-offs and renumbers the arrows. Steps and gates are stored apart, so
  keeping the order you drew them in would need a field with no other use. Nothing the drawing means changes, and
  the editor doesn't show "unsaved" after a save.
- A branch is words on an arrow, not a decision box. The user asked for "light decision branches", and this is
  the lighter version.

## Re-check 1 (2026-11-17, at 9f41df8): not signed off

That check ran against the old nodes/edges build (since replaced). It found no editor on screen, a drawing that
reached nobody at run time, and `set_workflow` erasing a drawing. All three are fixed (see Status in `update v1.md`).
Its script, `live-check.mjs`, used the old shape and has been removed.
