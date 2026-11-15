# History button on latest master: checked (2026-11-15)

Build from master `13c5ed4` (the hover-the-brand commit). All 427 app tests pass and `web:build` is clean.
I clicked through the built app in Chrome against the live studio, with Jony's chat open in the right panel.

| Check | Result |
|---|---|
| Hover the brand | `Build 13c5ed4 · 2026-11-15 12:17 UTC`, which matches master |
| 🕘 History button at the top of the agent's chat | ✅ top right of the panel header, next to the live "Message Jony…" box |
| Opens that agent's earlier chats | ✅ 42 past chats plus "Current chat" pinned on top |
| Open a past chat | ✅ its messages show under a "past chat" divider, with "‹ History" and "Back to chat" on top |
| Current chat stays open | ✅ "Back to chat" returns to the live chat. A half-typed message is still there. |

Not changed: Pixel's brief said past chats are "read-only". The user's own ask was "click an old one to return
to it", and the spec keeps a **Continue this chat…** box on past chats, so you can still write in them. The live
chat is never replaced. If the user wants past chats strictly read-only, removing that box is a one-line change.

## Check it yourself on the Mac (after running the clean-up script)
1. Open AI Studio from Spotlight. Hover **AI Studio** at the top left. The build should read `13c5ed4`, or
   whatever commit the script printed.
2. Open a project, click an agent, then **Open chat**. Their chat opens on the right with **🕘 History** at the top.
3. Click **History** to see their past chats, newest first, with **Current chat** on top. Click one and its
   messages show.
4. Click **Back to chat**. You're back in the live chat, and anything you'd typed is still there.
