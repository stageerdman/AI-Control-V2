# Home Screen: wiki

- **"Today" means what the user did, not what agents did.** Agents keep projects live and edited all day, so
  status and `updatedAt` say nothing about the user's attention. The signal is the user's own words: thread
  messages, goals, chat follow-ups and answers to asks.
- **`chat_messages.role = 'user'` isn't always the user.** A run's opening brief from another agent is stored with
  role `user`. Only rows with `meta.followUp` were typed by the human.
- **The user's hand is the HTTP API, so stamp there.** `lastUserAt` is a stored column set when one of a short
  allowlist of user routes succeeds (thread message, goal, task, ask answer, chat follow-up, "Start it").
  Computing it from rows can't work: goals and ask answers are also written by agents (Pixel's board tool, an
  agent answering through `runtime.answer`, auto-answers). Reads and "seen" routes aren't on the list, so a visit
  never counts. The stamp doesn't touch `updatedAt`.
- **One ordered-list route beats pin, unpin and move routes.** `PUT /projects/pins { ids }` covers all three and
  can't leave gaps or duplicate ranks.
- **Never put a button inside the card's button.** Put the pin next to it, inside a positioned slot.
