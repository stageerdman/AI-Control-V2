# Decisions

- Adding a person happens at once (Bring back, a "specialist" move): no confirm card. Taking people off needs a confirm, and Undo.
- Someone who left comes back as a solo specialist. Moving them onto a team is a separate Rearrange step.
- "Left this project" lists only people still in the Cast and not on the project now, newest first.
- A deleted agent comes back under its original id: trash snapshot first, cast pack second. Chats, work and team seat reconnect; blocked work is re-queued. Agents with no history stay in trash until someone asks.
- An agent in a running session can't be deleted. The server is the source of truth (409 `agent_busy` with the sessions). The app keeps Delete visible and focusable but marks it aria-disabled, with one line naming the session. A failed busy check counts as free, because the server checks again.
