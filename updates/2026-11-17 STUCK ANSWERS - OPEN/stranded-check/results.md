# Stranded questions — live check (2026-11-18)

Real Claude Code runs (claude-opus-5-5) on a sandboxed server from this branch.

## How to run
```
PORT=3569 AI_STUDIO_SELF_INSTALL=0 \
  AI_STUDIO_HOME=<worktree>/server/node_modules/.stranded/home \
  AI_STUDIO_SANDBOX=<worktree>/server/node_modules/.stranded/sandbox \
  AI_CONTROL_HOME=<worktree>/server/node_modules/.stranded/control \
  npm --prefix server start
node drive.mjs ask      # A: question → answer → reply; B: a hand-started run asks and waits
# stop the server while B waits, start it again with the same command
node drive.mjs after    # after the restart
```
B's question must be a real choice: a yes/no question is answered by the studio itself (auto-approve), so it
never opens. The first try used "Ship it today? Yes/No" and got exactly that.

## Result: ALL PASS (both phases)
```
PASS  A: answer accepted
  07:33:55 user text: Use your ask_user tool to ask me exactly "Which colour should the button be?" …
  07:33:58 agent text: Which colour should the button be?
  07:33:59 user text: teal-e23e26
  07:34:02 agent text: COLOUR=teal-e23e26
PASS  A: the agent got the answer (quotes it back)
PASS  A: chat reads you → question → answer → reply — you,question,answer,agent
PASS  A: the answer is in the chat once
PASS  A: question closed (answered by user) — answered
      B: asked "Which release name should we use?" — server stopped and started again

PASS  A: still answered after the restart, never open again — answered
PASS  B: withdrawn at boot (nothing resumes a hand-started run) — cancelled
PASS  no open questions left on the screen
PASS  pager has none of them
PASS  answering B says it is closed (409) — "This question is already cancelled"
PASS  typed words start a real chat turn (not swallowed as an answer)
  07:34:28 user text: Alpha. Reply with exactly GOT=alpha and nothing else.
  07:34:31 agent text: GOT=alpha
PASS  the agent replied to it
```
