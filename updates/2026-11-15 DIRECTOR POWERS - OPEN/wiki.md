# DIRECTOR POWERS — wiki

- **"I can't" is a missing answer field, not a model problem.** Every time Pixel said "I can't from here", the
  answer contract simply had no field for it. Add the field + one prompt line ("do it instead of offering to").
- **The Director only knows the summary.** It guessed "he never got the briefing" because the summary didn't say
  todo items wait in order. Put the *why* (waitsFor) in the data, not in hopes.
- **Reuse room.call for director → agent.** It already logs comms, emits office events and needs no approval when the
  caller is the orchestrator.
- **Report-in is a decision, not a broadcast.** Every finish reaches the Director, but the user only hears what the
  Director chooses (page sparingly / chat / keep). The whiteboard is updated by dispatch regardless.
- **Prefer an existing free-form table over a migration** when another branch is mid-flight on the same DB.
- **Voice mangles names** ("Ivy"): tell the Director to map to the closest person and say so.
