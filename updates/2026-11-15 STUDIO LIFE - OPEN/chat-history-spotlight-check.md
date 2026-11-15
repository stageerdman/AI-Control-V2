# Chat History in the Spotlight-opened app: what was checked (2026-11-15)

## Checked
- **Chat History is in the code that gets installed.** master has the History pill on the agent's chat
  (`app/src/features/office/Panel.tsx`, `data-testid="history-pill"`) and the past-chats list
  (`ChatHistorySheet.tsx`, which loads every chat page by page through `/agents/:id/chats`). Office tests: 169/169 pass.
  All app tests: 427/427 pass. `web:build` (tsc + vite) is clean.
- **There was no way to tell which build is open.** The version is always `0.1.0`. So now every build carries
  its commit and build time. **Hover "AI Studio" (top left) → `Build <commit> · <date time> UTC`.** It's set in
  `app/vite.config.ts` and shown via `app/src/shell/build.ts`. Checked in the built bundle (`commit: 88ce2d2`).

## Not checked live
The agent doing this check can only work inside its own checkout. It couldn't open Spotlight, read
`/Applications`, or read `~/.ai-studio/logs/self-install.log`. These 5 steps (about 1 minute) close it:
1. Quit AI Studio (⌘Q). Spotlight → "AI Studio" → open.
2. Hover the "AI Studio" brand. The commit should match the `commit` on the last `done` line of
   `~/.ai-studio/logs/self-install.log` (or `git rev-parse --short HEAD` in `~/dev/AI-Control-V2`).
3. If it doesn't match, or there's no tooltip, the app is an old build. Run `npm --prefix app run install:mac` in
   the main checkout, look at the log's last line (`done` or `failed: <step>`), then go back to step 1.
4. Open a project → click an agent → the **🕘 History** pill should be in the chat header.
5. Click it → past chats are listed. Open one and its messages show.
