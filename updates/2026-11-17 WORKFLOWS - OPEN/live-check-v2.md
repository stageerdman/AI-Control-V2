# Workflows v2 — Phase 6 live check as a first-time user (Elon)

Run done, waiting on fixes, then a re-check. Real backend + real web app on throwaway data, clicked through in a
headless browser. Every check passes; 10 findings below (1 blocker, 1 medium), handed out 2026-11-17: Jony
(1, 2, 3, 4, 5, 6, 8, 9) and Uncle Bob (3, 8, 9, 10). Cost: about $2.5 of agent time; the fake runner costs nothing.

## How it's run

- Server: `PORT=3569 AI_STUDIO_SELF_INSTALL=0 AI_STUDIO_RUNNER=fake AI_STUDIO_HOME=<d>/home AI_STUDIO_SANDBOX=<d>/sandbox
  AI_CONTROL_HOME=<d>/control npm start --prefix server`, `<d>` = `v2-check/node_modules/.data` (gitignored;
  `sandbox/aurora` has its own `git init`). Project folder set with `PATCH /projects/aurora {"folder":"aurora"}`.
- App: `VITE_API_URL=http://127.0.0.1:3569 npx --prefix app vite app --port 3570 --strictPort`.
- Browser: `node v2-check/drive.mjs <name> <steps.json>` (playwright-core + headless Chromium in
  `v2-check/node_modules`; `--disable-web-security` because the server only allows origin :1420). Steps in
  `v2-check/steps/`, screenshots in `v2-check/shots/` (not committed). `v2-check/api.mjs METHOD /path [json]`.
- The 409s in the console are the seeded demo project's `/app` and `/health` with no folder: not Workflows.

## Results so far

| Check | Result |
|---|---|
| Find the office way cold: Projects → Aurora → whiteboard → "How we work" (thumb + label in board header) | ✅ 3 clicks, obvious |
| How we work opens on the drawing (empty state "Nothing drawn yet… Draw how we work") | ✅ |
| Draw: Pete starts → Captain (hand-off), Scarlett signs off Captain (crash test, only when it touches payments), Scarlett signs last | ✅ with the workaround below |
| Save → view mode, words line correct | ✅ |
| Reload → same drawing; board thumb now shows the 3 faces | ✅ |
| New team (Cast → Teams → + New team), 3 members → "How this team works" under Crew, default "Captain checks all" | ✅ |
| Switch to "Pass it along" → server `GET /teams/check-crew/workflow` = chain, `own:false`, `shape:"chain"` | ✅ |
| Run a goal under "Pass it along" (fake runner; captain answers `parallel:true`) | ✅ parts Brisk → Bramble, `parallel=false`, no extra sign-offs |
| Same goal, teams on the default "Captain checks all" (ship-it, polish) | ✅ captain's parallel parts stand, no extra sign-offs |
| Switch check-crew to "Captain checks all" and run again | ✅ parts parallel, no sign-offs |
| Team's own way (chain + "Bramble signs off Brisk") | ✅ chain order; Brisk's part gets Bramble's review; others none |
| v1 gap 2 (team way reaching the run) | ✅ closed: `split()` passes `teamWay()` to the captain, `orderedSubtasks` / `memberGates` apply it |
| Second office way "Hotfix", goal names it → chip on the goal card | ✅ "Open the way: Hotfix" → `#office/aurora/how/hotfix`, the Hotfix drawing; every item got Scarlett's crash test |
| Remove a member from an adjusted way | ✅ their arrows, sign-off, layout dropped; `final` back to the captain (finding 10) |

Setup notes: the sandbox repo needs one commit, else items get no checkout and a captain never splits
(`delegable()` needs a workspace). The fake director now picks a non-first way when the goal names it
("Hotfix: …"), so a fake run can show a way chip (`server/src/crew/fake-brain.ts`). By design the chip only shows
for a non-default or temporary way, and `final` only orders sign-offs (adds none). `v2-check/goal.mjs` prints a
goal's items and parts in one screen.

## Findings (to report)

1. **Can't add a second person (Jony, blocker for a first-time user).** After "Who starts", that card stays
   selected, so the toolbar shows that card's actions and "+ Add someone" is hidden. "Connect to…" is disabled
   with one card. Clicking empty canvas doesn't clear the selection: `.fe-board` covers the whole `.fe-canvas`
   (measured 760×220 vs 708×220), so `e.target === e.currentTarget` is never true (`WorkflowEditor.tsx:323`).
   Escape only clears connecting/draft (`:298`). Only re-clicking the same card deselects. Fix: deselect on a
   click on the board too (target is canvas or board), Escape clears the selection, and/or keep "+ Add someone"
   visible in the toolbar while a card is selected.
2. **"Add arrow" looks enabled while disabled (Jony, small).** With an empty Why it's disabled (`edgeReady`
   needs `why`; Phase 5 "optional why" not built yet) but the dark button looks clickable; nothing says why.
3. **"only it touches payments" (Jony + Uncle Bob, small wording).** Arrow list (`edgeWords`) and `inWords`
   read "only it touches payments"; should be "only when it touches payments".
4. **Branch label clipped (Jony, small).** In view mode the "only when" text on a short arrow is hidden behind
   the cards ("uches paym").
5. **Team panel: the way is below the fold (Jony, small).** After adding the crew, "How this team works" is
   off-screen at 1440×900; nothing hints it's there.
6. **Pass it along thumb: the way back is invisible (Jony, small).** Bramble → Sola is drawn straight over the
   two forward arrows, so the picture reads as a line, not a loop.
7. Stale `summary` on the office way ("no review gates yet") after drawing; the page shows `inWords`, so only
   in the API. Not a bug on screen.
8. **A "checks all work" sign-off is invisible (Jony + Uncle Bob, small).** Hotfix = Scarlett crash-tests every
   item (`after:"*"`). The page draws Scarlett alone ("Signs last"), and the words line says only "Scarlett signs
   last." — `drawingInWords` (`workflow-drawing.ts:131`) speaks only branched sign-offs. Show "Scarlett checks all
   work" in the words and a mark on her card ("Checks all work").
9. **Adjusting a default team way and adding one sign-off can't be saved (Uncle Bob + Jony, medium).** The
   default shapes set `final` = captain with no sign-offs; once any sign-off is added, the server
   (`workflow-drawing.ts:104`) and the editor (`flow/model.ts:230`) refuse: "Sola signs nothing off here — who signs
   last must be one of the reviewers". The user drew nothing wrong. `final` only orders sign-offs, so a `final`
   who signs nothing is a harmless no-op: drop the rule (both sides), or clear `final` when it isn't a reviewer.
10. **Removing a chain member leaves the chain open (Uncle Bob, small).** Sola → Brisk → Bramble → Sola minus
    Bramble = "Sola hands to Brisk", no way back to Sola. When the removed member sat between two arrows
    (in → them → out), join in → out ("Brisk → Sola: Brings it back to be pulled together"). The own way's
    `summary` stays "Chain with a check" (same as 7).
