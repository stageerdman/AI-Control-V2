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
4. ⏳ **Report-in.** When someone finishes, they tell their captain / the Director (office shows it); the Director
   decides: tell the user in chat, page them, or keep it.

## Status
- Phases 1–3: tests (director-ask.test.ts) + a real Director turn in a throwaway studio: asked "have you asked
  Twinkle?" → it set `ask` on its own, Twinkle's answer was relayed.
