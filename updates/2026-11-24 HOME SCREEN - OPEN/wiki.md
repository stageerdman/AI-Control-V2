# Home Screen: wiki

- **"Today" means what the user did, not what agents did.** Agents keep projects live and edited all day, so
  status and `updatedAt` say nothing about the user's attention. The signal is the user's own words: thread
  messages, goals, chat follow-ups and answers to asks.
- **`chat_messages.role = 'user'` isn't always the user.** A run's opening brief from another agent is stored with
  role `user`. Only rows with `meta.followUp` were typed by the human.
- **One ordered-list route beats pin, unpin and move routes.** `PUT /projects/pins { ids }` covers all three and
  can't leave gaps or duplicate ranks.
- **Never put a button inside the card's button.** Put the pin next to it, inside a positioned slot.
