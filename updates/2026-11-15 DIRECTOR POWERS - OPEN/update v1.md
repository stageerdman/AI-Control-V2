# DIRECTOR POWERS — v1

**Goal:** the Director does what the user asks from chat instead of "I can't from here". Triggered by a real chat
(2026-11-15) where Pixel couldn't ask Jony, guessed he "never got the briefing" (he was queued behind Blair), didn't
know "Ivy" (voice mis-hearing), and couldn't rebuild teams.

**Out of scope (the studio is building it on its own whiteboard):** team rebuild — remove / split / move / specialist,
confirm card, undo (Blair's spec-ux-team-rebuild.md, Jony + Uncle Bob's goal in HQ).

## Phases
1. ✅ **Ask anyone on the project.** Director answer field `ask: {to, question}` → `room.call` from the director (no
   approval, read-only, comms-logged) → `Jony: “…”` in the director's chat; failure: "Couldn’t reach Jony just now —
   want me to try again?". Office: "…" director → them on `working`, back on `answered` (UX agent's call).
2. ✅ **Queue truth.** Summary items carry `waitsFor` (same rule as dispatch's orderGate) and the captain's `team`
   sub-tasks; the prompt explains briefed = running, todo = waiting its turn.
3. ✅ **Capabilities + voice.** Prompt lists what the Director can do (do it, don't offer it); misheard names map to
   the closest person on the project.
4. ✅ **Report-in.** A whiteboard step done/failed → its owner tells the Director (`deliver` handoff — the office walks
   it over; members already deliver to their captain). The Director decides in one crew call (`report-in`): **page**
   (chat line + pager "Pixel has news", until the office is visited), **chat** (a line), or **keep** (comms note).
   Pages live in `comms` (kind `page`) — no migration, so it can't collide with the studio's rebuild branch.

## Status
- Phases 1–3: tests (director-ask.test.ts) + a real Director turn in a throwaway studio: asked "have you asked
  Twinkle?" → it set `ask` on its own, Twinkle's answer was relayed.
- Phase 4: report-in.test.ts + a real goal in the throwaway studio: Twinkle finished → delivered to Pixel → Pixel
  paged ("…That goal is done, so tell me what you'd like next.") → in the chat and on `GET /asks` as news.

## Next
- Restart the backend + reinstall /Applications/AI Studio.app to get all of this (front end: room.call bubbles,
  "has news" pager line). Wait until the studio's team-rebuild goal has merged so no run is cut off.
- Each finished step costs one small Director call (plan usage). If it gets chatty, batch per goal.
