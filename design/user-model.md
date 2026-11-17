# User model

## Who
- One person running a local AI studio: they build a Cast of agents, put them on teams, and run work through them.

## Top goals (by how often × how much it matters)
1. Get work done through agents without it getting blocked.
2. Shape the Cast: add, edit, rearrange agents and teams.
3. Recover from mistakes fast. Deleting the wrong agent must never cost work.
4. See what's running in a project and stop it, one agent or all, right away, without losing their chats.
5. Start fresh with Pixel (the orchestrator) once work is done, keeping the old chat to look back at.

## What they do (observed)
- They accidentally deleted Health Analyst, an agent with chats and a team seat, and running work was blocked (Nov 2026). Getting them back needed manual recovery.

- They found whiteboard tasks hard to read, especially errors shown as raw technical text, and wanted to see who is on each task and who finished it (Nov 2026). The board now shows a status mark, an avatar and name, and one plain line when something goes wrong (design/whiteboard-task-card.md).

- They couldn't start a new chat with Pixel; one long thread made Pixel drift back to old ideas (Nov 2026). Design: a "New chat" pill that only works, and shines, when nothing runs (design/new-chat/new-chat.md).

- The Cast stored each agent's tools but never showed them, so "who can do what" was a guess (Nov 2026). The agent panel now lists Edit / Run / Reach straight from the runtime's rules (design/cast/tools.md).

- They couldn't find the workflow diagram: it was three hops deep behind small text links, and on teams it only appeared after the team was saved with members (Nov 2026). Review and redesign proposal: design/workflows/review.md.

## Assumptions (guesses — check)
- A live picture of the way (thumbnail) is found faster than a text link, and most teams keep the "Captain checks all" default. Check: time to open How we work; share of teams still on the default after a week.
- Three plain rows (Edit / Run / Reach) answer "can this agent do X?" without the old "works with" prose. Check: do people still ask what an agent can do after opening its panel?
- People want a fresh Pixel chat mostly right after a goal finishes, when nothing runs. Read-only old Pixel chats are enough. Check: taps on the dimmed pill; attempts to type in a past Pixel chat.
- Raw error text is rarely needed. It sits behind "Details". Check: do people open Details often? If they do, the plain messages aren't saying enough.
- Most restores happen within minutes (Undo) or within a few days (Recently deleted). 30 days is enough.
- "Stop all agents" should leave the project's app running (it's the user's, not an agent's). Check: do people stop the app right after Stop all?
- People restore one agent at a time, so no bulk restore is needed.
- A "kept until" date is reassuring and doesn't feel like pressure. Quick check: watch the first few restores.
