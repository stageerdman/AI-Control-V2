# User model

## Who
- One person running a local AI studio: they build a Cast of agents, put them on teams, and run work through them.

## Top goals (by how often × how much it matters)
1. Get work done through agents without it getting blocked.
2. Shape the Cast: add, edit, rearrange agents and teams.
3. Recover from mistakes fast. Deleting the wrong agent must never cost work.
4. See what's running in a project and stop it, one agent or all, right away, without losing their chats.

## What they do (observed)
- They accidentally deleted Health Analyst, an agent with chats and a team seat, and running work was blocked (Nov 2026). Getting them back needed manual recovery.

- They found whiteboard tasks hard to read, especially errors shown as raw technical text, and wanted to see who is on each task and who finished it (Nov 2026). The board now shows a status mark, an avatar and name, and one plain line when something goes wrong (design/whiteboard-task-card.md).

## Assumptions (guesses — check)
- Raw error text is rarely needed. It sits behind "Details". Check: do people open Details often? If they do, the plain messages aren't saying enough.
- Most restores happen within minutes (Undo) or within a few days (Recently deleted). 30 days is enough.
- "Stop all agents" should leave the project's app running (it's the user's, not an agent's). Check: do people stop the app right after Stop all?
- People restore one agent at a time, so no bulk restore is needed.
- A "kept until" date is reassuring and doesn't feel like pressure. Quick check: watch the first few restores.
