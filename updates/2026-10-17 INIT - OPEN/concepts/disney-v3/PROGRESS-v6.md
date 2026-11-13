# v6 progress — Builder C (project setup space)

Source: user-feedback-v6.md (N1–N4). Files: src/js/studio-new.js, src/css/studio-new.css,
src/js/studio.js (In-setup shelf), src/js/app.js (#new route), src/shell.html (#scene-new), src/css/base.css (pager padding).

- [x] N1 Standalone space at `#new/<draftId>` (studio page; nav shows Projects). Drafts in memory (NP_DRAFTS);
      leaving keeps the step (setup timer pauses, a Creator mint in flight still lands); a draft with no
      New/Adopt choice is dropped on leave. Projects shows an "In setup" shelf: tile, name, mode · step · orchestrator,
      step dots; click resumes; ✕ deletes with Undo in the toast. "Delete draft" also on the page.
- [x] N2 Team step: chat column beside the plan (office chat look: op-head front portrait, op-log, op-composer;
      no mic, no suggestions). Intents: why · captain question · swap/add/drop a team by name · "another team" ·
      add/drop a specialist (Cast fit, else Tinker designs one) · smaller/bigger · new team (Tinker designs it).
      Plan on stage redraws live.
- [x] N3 Plans are whole teams first (squads under their emblems). Specialists are a separate, labelled group;
      a "small/tiny/weekend…" brief (optional "What is it?" field, or saying "smaller") → two agents, no team.
- [x] N4 Captains come from TEAMS (captain medal = team.captain); orchestrator says so if asked. Brand-new team =
      Agent Creator designs name, emblem (unused), colour, captain (its lead) and mints its members; joins TEAMS.
      Office config passes teams without captains, so the office uses each team's own.
- [x] Pager add-on: `.scene` gets 120px bottom padding.

Verified: v6 click test 28/28 (scratchpad/builder-c/v6test.js), office ?demo=selftest ALL PASS, cast test no FAIL,
no console errors. Shots: shots/v6-*. Demo hooks: ?demo=new-<0..4> · adopt-<0..4> · new-chat · new-small · drafts.
