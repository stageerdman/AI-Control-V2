# Decisions

- Adding a person happens at once (Bring back, a "specialist" move): no confirm card. Taking people off needs a confirm, and Undo.
- Someone who left comes back as a solo specialist. Moving them onto a team is a separate Rearrange step.
- "Left this project" lists only people still in the Cast and not on the project now, newest first.
- A deleted agent comes back under its original id: trash snapshot first, cast pack second. Chats, work and team seat reconnect; blocked work is re-queued. Agents with no history stay in trash until someone asks.
- Deleting an agent hides it (`deleted_at`) for 30 days and lists it in the Cast's "Recently deleted". Restore is one tap. Past chats stay as history even after the purge.
- Code that creates an agent by id must check hidden rows too (`agents.hiddenRecord`), not only the live Cast.
