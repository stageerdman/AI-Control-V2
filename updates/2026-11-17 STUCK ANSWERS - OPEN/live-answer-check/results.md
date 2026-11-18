# Live test: answer a real agent question — results (2026-11-18)

**Verdict: passes.** A real agent (Claude Code, claude-opus-5-5) asked the user a question with `ask_user`. I
answered it in the office chat of the running app, in a real browser. The agent got the answer and kept working
with it. The question closed. The chat showed the question first and the answer second, and it still did after a
reload. I ran it twice: once answering by typing in the message box, and once with a page reload between the
question and the answer, answering by clicking the card. Both fixes (Jony's chat order and the stranded-question
withdrawal) were on master under this branch (5638168, 673e7d1).

## How it was run
```
PORT=3569 AI_STUDIO_SELF_INSTALL=0 \
  AI_STUDIO_HOME=<worktree>/server/node_modules/.liveans/home \
  AI_STUDIO_SANDBOX=<worktree>/server/node_modules/.liveans/sandbox \
  AI_CONTROL_HOME=<worktree>/server/node_modules/.liveans/control \
  npm --prefix server start
VITE_API_URL=http://127.0.0.1:3569 npx --prefix app vite app --port 3570 --strictPort
npm --prefix <this folder> install --no-package-lock      # playwright-core
node drive.mjs typed     # answer typed in the message box
node drive.mjs reload    # reload between question and answer, answer clicked on the card
```
`npm --prefix app run dev` starts the Tauri desktop shell, which a script can't drive. So the same app ran in
headless Chromium through vite, against a throwaway server (real agent runner, sandboxed home), so the real
studio was never touched.

Each run uses a fresh agent and project. The agent is told (through the same endpoint the composer uses) to ask
"Which colour should the button be?" (Red/Blue). After the answer, it must write `colour.txt` in its folder holding
the answer, then reply `COLOUR=<answer>`. Then, as the user would: open the office, press `!` (jump to whoever
needs you), press Enter to open their chat, and answer. After the reply, reload the page, open the agent from the
stage → "Open chat", and check everything again.

## What I saw
Both runs showed the same chat, live and after the reload:
```
You:    Use your ask_user tool to ask me exactly "Which colour should the button be?" …
Asker:  Which colour should the button be?
You:    teal-e56965            (typed run)   /   Blue   (reload run)
Asker:  COLOUR=teal-e56965                   /   COLOUR=Blue
```

| Check | Typed answer | Reload, then card |
|---|---|---|
| Question shows as an open card with Red / Blue | pass | pass (after the reload too) |
| Agent got the answer and kept working: `colour.txt` written with the exact answer, then the reply | pass | pass |
| Question closed on the server (`answered`, by the user, with that answer); pager empty | pass | pass |
| No open card left in the chat | pass | pass |
| Order: question, then answer, then reply (live) | pass | pass |
| Question once, answer once (no duplicates) | pass | pass |
| All of the above after a page reload | pass | pass |

Answer to reply took about 8 s in both runs. No page errors.

## Notes
- The first typed run reported 2 failures on "question shows once". The check counted my own instruction message,
  which quotes the question. Counting only the agent's lines fixed that. The chat itself was right, and the output
  above shows it. I re-ran the typed path after the fix: all pass.
- Screenshots go to `node_modules/shots/` (not committed): `<mode>-asked`, `-replied`, `-reloaded`.
- The restart case (a question left open across a server restart) is covered in `../stranded-check/results.md`.
