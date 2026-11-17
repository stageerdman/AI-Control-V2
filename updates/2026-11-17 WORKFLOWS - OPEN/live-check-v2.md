# Workflows v2 — Phase 6 live check as a first-time user (Elon)

In progress. Real backend + real web app on throwaway data, clicked through in a headless browser.

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
| Run a goal under each team shape and check order / no extra reviews | ⏳ next |
| Goal's way chip opens that way | ⏳ next |
| Remove a member from an adjusted way | ⏳ next |

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
