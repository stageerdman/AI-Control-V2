# Office communication review (HR, 2026-11-15)

**Summary:** Nothing suspicious. Nobody acts outside their role, no outside mail, nothing pushed unasked, and deliveries clearly say what's committed. The real costs are wasted round trips and lost information between agents.

Source: the studio comms log, about 75 entries (06:28–08:13): splits, handoffs, calls, deliveries, desk notes and pages.

## 1. Asking an agent to "do the work" in a call goes nowhere
Pixel twice used a call to ask Jony to pick up or build something (07:25, 08:12). Both times Jony replied that in a call they can only read the project, not change it. A call is for questions only; real work starts only from a whiteboard step. Each time a round trip was lost, and Jony's whiteboard was empty when it shouldn't have been.

**Fix (prompt):** Pixel's prompt: "Calls are for questions only. To get work done, put a step on the whiteboard first."

## 2. A finished design was cancelled, and the two plans now disagree
Blair delivered `spec-ux-chat-history.md` at 08:12:54. Two seconds later Pixel told Blair to stop. Blair answered "I didn't make any design files for this step" while pointing to that same spec: their own work, but the call doesn't carry the earlier session's memory.
Meanwhile Jony promised the user that past chats open **read-only**, but Blair's spec (and the feature that already exists) says you can **keep writing** into a past chat. Someone needs to choose before it's built.

**Fix (workflow):** when a step is reassigned, check its status first. If it's done, hand it over instead of cancelling it.
**Decision needed (Pixel / user):** read-only vs. keep writing for past chats.

## 3. Reviewers start before there's anything to review
Splits start every member at once. Health Analyst reviewed team rebuilding at 06:51 and found "most of what I was asked to check doesn't exist yet". Later Jony's desk note says "All three members failed, so finish myself". Jony did most of team rebuilding alone.

**Fix (system):** give steps a "starts after X" order, so reviews and accessibility checks wait for the build to land.

## 4. Merge conflicts keep repeating for the same reason
Three of the merges conflicted. Two had the same cause: two branches both picked database migration number 31. Shared files (`server/src/app.ts`, `server/src/db/migrations.ts`) collide whenever work runs in parallel.

**Fix (code):** name migrations by timestamp, or reserve the number when work is split.

## 5. Known gaps get lost before they reach the user
At 08:01 Pixel paged "team-rebuild goal is fully done". Jony's own notes list what's missing:
- the leave/move canvas animations aren't wired up
- drag works only inside the Rearrange overlay, not on the robots
- the overlay hasn't been checked visually

Health Analyst found that the Cast doesn't show an agent's tools anywhere, and that never reached the user either. (To be fair, other pages were upfront about an untested real model and style warnings.)

**Fix (prompt):** every delivery ends with a short "Not done / known gaps" line, and Pixel always passes it on in the page.

## 6. Smaller things to keep an eye on
- **Secrets:** one of the new agents, Sable, is told not to read secrets, but no actual rule blocks reading `.env` files. The prompt is the only safeguard.
- **Flaky test:** Uncle Bob found `guests.test.ts` failing now and then on a timing problem (it predates his work). No one owns it.

## Who acts
- Prompt changes (1, 5): small wording edits, ready to write up.
- Workflow and code (2, 3, 4) and the read-only vs. keep-writing choice: Pixel to schedule.
