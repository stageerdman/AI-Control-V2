# HR office review: every point (Jony, 2026-11-15)

Source: `comms-review.md` in this folder, read in full (the mail was cut off).
HR's verdict: nothing suspicious. The cost is wasted round trips and information lost between agents.

**Named** = one of the five points already in Pixel's goal. **EXTRA** = goes beyond those five; the last step must cover it.

## The five named points
1. **Calls are for questions only** (HR §1). Pixel twice asked Jony to do work in a call (07:25, 08:12). A call can only read, so both were lost round trips. Fix: say it in Pixel's prompt, and have the studio point anyone asking for work in a call to the whiteboard. — *Named*
2. **Check status before you cancel or reassign** (HR §2). Blair's finished `spec-ux-chat-history.md` was cancelled two seconds after it was delivered. Fix: if the step is done, hand it over instead of cancelling it. — *Named*
   - Calls should carry the agent's latest delivery as context. Blair denied making a file they had just made, because the call didn't have that session's memory. — *Named (in Pixel's goal 2)*
3. **"Starts after X"** (HR §3). Every member of a split starts at once, so reviewers found nothing to review yet (Health Analyst, 06:51) and Jony finished team rebuilding alone. Fix: steps can wait until the build lands. — *Named*
4. **Migration number clashes** (HR §4). Two of three merge conflicts came from two branches both taking migration 31. Fix: timestamp names, or reserve the number at split time. — *Named*
5. **Gap check before saying "done"** (HR §5). Pixel paged "team-rebuild fully done" at 08:01 while Jony's notes listed gaps. Fix: read the captain's notes and pass on the gaps. — *Named*

## Extra points (for the last step)
- **E1. Decision: are past chats read-only, or can you keep writing in them?** (HR §2) Jony told the user read-only. Blair's spec and the feature that already exists allow writing. Someone has to pick before it's built. Owner: Pixel / the user. — **EXTRA**
- **E2. Every delivery ends with a "Not done / known gaps" line** (HR §5). This is the sender's half of point 5. Pixel's check only works if deliveries name the gaps. Prompt change for every agent, not just Pixel. — **EXTRA**
- **E3. Gaps that never reached the user** (HR §5). Pass these on now:
  - leave/move canvas animations aren't wired up
  - drag works only inside the Rearrange overlay, not on the robots
  - the Rearrange overlay hasn't been checked visually
  - the Cast doesn't show an agent's tools anywhere (found by Health Analyst)
  — **EXTRA**
- **E4. Shared hot files collide** (HR §4). Besides migrations, `server/src/app.ts` and `server/src/db/migrations.ts` conflict whenever work runs in parallel. The migration fix helps with one file but not with `app.ts`. — **EXTRA** (worth a look, may be small)
- **E5. Secrets are guarded only by the prompt** (HR §6). Sable is told not to read secrets, but no rule actually blocks reading `.env` files. Needs a real block in the tool rules. — **EXTRA**
- **E6. Flaky test without an owner** (HR §6). `guests.test.ts` sometimes fails on timing (Uncle Bob; it was there before his work). Needs an owner and a fix. — **EXTRA**

## Who acts (HR's split)
- Prompt edits: points 1 and 5, E2.
- Workflow and code: points 2, 3, 4, E4, E5, E6. Pixel schedules them.
- Decision: E1, for Pixel / the user.
- Pass on now: E3.
