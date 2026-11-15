# History button: checked in the real app, part by part

Checked on this branch's UI against the live studio server (real saved chats), clicking through in a browser. Jony's chats used as the example.

| Part | Before | After |
|---|---|---|
| 1. Open a chat with an agent in the right panel, as normal | **Wrong.** Tapping an agent → "What they did" → **Open chat** didn't open their normal chat. It jumped straight into their *latest past chat*, so you landed in History, not in the conversation. (The director's chat was fine.) | **Fixed.** Open chat opens their normal live chat in the right panel ("Message Jony…"), the same as tapping the director. |
| 2. History button at the top | Present, but you skipped past it because of part 1. | 🕘 **History** sits top-right in the chat header, every time. |
| 3. Lists every previous chat | Only the newest 20 (fixed earlier today by Uncle Bob). | All of them: 40 past chats for Jony, grouped by day, newest first, with **Current chat** pinned on top. |
| 4. Click a past chat to open it | Worked. | Works: opened the 30th chat (past the old cap). It shows all its messages, and you can keep writing in it. |
| 5. Way back to the current chat | Worked. | **Back to chat** (top of History and of a past chat), the **Current chat** row, or Esc. All return to the live chat with the History button back on top. |

**Why you didn't see it:** the app you have open is an older build (see `why-history-not-showing.md`). To get this fix, rebuild after it merges.

**What changed:** `OfficePage.tsx` (Open chat now opens the live thread), and `Panel.tsx` loses the unused "open straight into a past chat" path. Office tests pass (169).
