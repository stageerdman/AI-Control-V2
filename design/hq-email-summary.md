# HQ email review — one-page summary

*Team note from The Founders, 2026-11-15. Full verdict table: [hq-email-review.md](hq-email-review.md). The email: [comms-review.md](../updates/2026-11-15%20HR%20-%20OPEN/comms-review.md).*

HR's "Office communication review" made 17 suggestions. **We kept 15 and dropped 2.** Of the 15, 14 were already part of a feature on the board, so we added them to its description. One needed a new feature. No feature's status changed. Where you had already said what you want, your view won over HR's proposed fix.

## Added to existing features

| Feature (Features board) | What we added | Why |
|---|---|---|
| **Revision of AI Communication** | Work asked for in a call actually gets done. A call includes the agent's latest delivery. Any agent can file reports. Any agent can call the orchestrator, who can page you. Fix the bug where `room` lists the orchestrator but `call_agent` refuses them. | You asked for all of this already. The HR request failing is quoted in this feature. The orchestrator bug is confirmed in code (`server/src/room/room.ts:44`). |
| **Smoother Studio Teamwork** | Check a step's status before cancelling it, and hand over finished work. Steps can "start after" another step. Migrations are named by timestamp. Every delivery ends with "Not done / known gaps", and the orchestrator passes that on. | Each one happened this week: a finished spec was cancelled, a review ran before the build existed, two branches both took migration 31, and you were told "fully done" while gaps were still open. |
| **AI Safety** | A real rule in code that blocks agents from reading `.env` and other secret files. | Today any agent can read any file, and `.env` is copied into every checkout. A prompt is the only thing stopping them. |
| **Agent Description** | The Cast panel shows the agent's tools: what they can edit, run and reach. | A project rule says what an agent can reach must be visible. Right now it isn't. |
| **Fix: Chat History UX** | Past chats open read-only, with no reply box. | You decided this, but the app still shows a reply box. |
| **Fix "Stopped" Bug** | Also covers members who end as "failed" and leave the captain to finish alone. | Probably the same cause as the turn-cap stops. *Guess:* we'll check the run end reasons to confirm. |
| **Team Rebuilding** | Lists its known gaps: canvas animations aren't wired up, drag only works inside the overlay, and nobody has checked the overlay visually. | It's marked shipped, but you were never told about these gaps. You decide whether to finish them. |

## Changed

- **Smoother Studio Teamwork**: we removed "questions-only calls". It went against your wish for agents to work face to face.
- **Agent Chat History**: "open their chat and keep talking" now says "keep talking in the current chat; past chats are read-only", to match your decision.

## New feature

- **Fix: Flaky Guests Test** (Planned): `server/test/office/guests.test.ts` sometimes saves after the database has closed. A flaky test makes every "all tests pass" less trustworthy, and nobody owned it. It's done when the test passes 20 runs in a row.

## Dropped

- **"Calls are for questions only" prompt rule**: this makes the wasted round trip official instead of fixing it. The opposite fix (calls can start real work) is kept above.
- **Restructure shared files to avoid merge conflicts**: once migrations use timestamps, the remaining conflicts cost less than the rework would.

## Open checks (guesses, not facts)

- Were the three "failed" member runs really turn-cap stops? Read their end reasons in the `runs` table.
- How often does the guests test fail? Run it 20 times and count.
