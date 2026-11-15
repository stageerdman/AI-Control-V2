# Why History didn't show in the chat panel (2026-11-15)

**Cause: not built.** The work was merged and done properly. The app being used was an old build.

| Check | Result |
|---|---|
| Merged to master? | Yes. `dade6e9` "Build History in the agent chat panel (Jony)" is on master, and the main checkout `~/dev/AI-Control-V2` is on master. |
| In the app being run? | No. `/Applications/AI Studio.app` was built at 07:24 UTC and the History merge landed at 08:29 UTC. The dev build (`npm --prefix app run dev`, Vite on :1420) was not running. |
| Chats saved and loadable? | Yes. The live backend (:4319) answers `GET /agents/:id/chats` and `GET /chats/:runId/messages` with 200 for every agent and every chat. |
| Done properly? | One gap. The server sends chats in pages (20 by default), and the app only asked for the first page. Pixel has 35 chats and Jony has 38, so History showed only the newest 20. Fixed: the app now asks for page after page until it has them all (`collectChats` in `app/src/features/office/api.ts`, test `chat-pages.test.ts`). |

## To see it
- **Dev build:** `npm --prefix app run dev` from the master checkout. It always serves the current source.
- **Installed app:** rebuild with `npm run build` in `app/`. Copy `~/.cargo-shared-target/release/bundle/macos/AI Studio.app`
  over `/Applications/AI Studio.app`, then quit and reopen. Until then, the installed app predates History.
  A fresh bundle with History and the all-chats fix was built on 2026-11-15 at that path. It isn't copied into
  /Applications because overwriting a running app's binary can crash it. Quit the app first, then copy it.
