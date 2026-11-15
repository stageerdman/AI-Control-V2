# Chat history: confirmed live in the running app (2026-11-15)

## What caused it
1. **Not built.** The work was merged to master, but the app in use (`/Applications/AI Studio.app`) was built before
   History merged, so it didn't have it. (see `why-history-not-showing.md`)
2. **Not done properly, in two places:**
   - History showed only the newest 20 chats. Fixed: the app pages back until it has every chat (`collectChats`).
   - Tapping an agent and pressing **Open chat** skipped their normal chat. It dropped you into their latest past chat,
     where the History button doesn't show, so the feature looked missing. Fixed: Open chat opens the agent's normal
     chat. (see `history-button-check.md`)

## Checked in the running build
Master with both fixes, started with `npm --prefix app run dev`. The checks used real saved chats from the live studio
server, clicking through the UI in Chrome against the dev server (:1420). All 422 app tests pass.

| Step | Jony (via the agent's card → Open chat) | Pixel (director) |
|---|---|---|
| 1. Open their chat in the right panel, as normal | ✅ "Message Jony…" | ✅ "Message Pixel…" |
| 2. History button on top | ✅ | ✅ |
| 3. Lists every previous chat | ✅ 41 of 41 on the server | ✅ 35 of 35 |
| 4. Click an old one to return to it | ✅ 30th chat (past the old cap of 20), 7 messages, can keep writing | ✅ 30th chat opens |
| 5. Back to the current chat | ✅ Back to chat → live chat, History on top again | ✅ |

Side note, not a bug in History: many of Pixel's older entries are "Studio summary right now: …" runs. The server
saved no messages for them, so they open as "Nothing was saved in this chat." They make Pixel's list noisy. We could
hide internal runs from History later.

## To see it yourself
- `npm --prefix app run dev` from the master checkout, or
- rebuild the installed app (`npm run build` in `app/`), quit AI Studio, and copy the new bundle over
  `/Applications/AI Studio.app`. Any copy built before today's fixes won't show it.
