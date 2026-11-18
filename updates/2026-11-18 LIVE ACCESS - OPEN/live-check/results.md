# Live check: share an access with a busy agent — results (2026-11-18)

**Verdict: passes, on both paths.** I shared an access with a real agent while it was in the middle of its work.
It got the note right after its current step and reached the service the access opens in that same run. On the
live path it used the access straight away. On the restart path it restarted itself with `forget` and then used it.
The secret value never showed up in the chat.

## How it was run
- The studio server from this branch (commit 488cb5a) ran on :3568 with a throwaway sandbox, so nothing touched
  the real studio or any real `.env`:
  `PORT=3568 AI_STUDIO_SELF_INSTALL=0 AI_STUDIO_HOME=<here>/node_modules/home AI_STUDIO_SANDBOX=<here>/node_modules/sandbox AI_CONTROL_HOME=<here>/node_modules/control npm --prefix server start`
- Real Claude Code agent runs (default model), started through the studio's normal `POST /projects/:id/runs`.
- `drive.mjs` here does the rest: `node drive.mjs live` or `node drive.mjs restart`.
- **What "reach it" means:** the script runs a small local "lab API" on :3570. It only answers a caller holding the
  access's token, and its answer is a random word. If the agent reports that word, it really used the access. The
  token is a fresh random test value each run.

## Steps (both paths)
1. Create a project, an agent, and an access "Lab …" with one token field. The access is **not** granted yet.
2. Start the agent on a task: "wait 8 seconds, check whether an access arrived, repeat. When one arrives, call the
   lab with it and reply with the word."
3. Wait until the agent has made a real tool call, so it is busy.
4. Grant the access to the project, the same request the Safe's switch sends (`PUT /projects/:id/access/:accessId`).
5. Wait for the run to finish, then check the chat, the lab's log and the run list.

## Live path: passed
The studio could write the access into the agent's working folder `.env`.

| Check | Result |
|---|---|
| Agent busy before the grant | running, 1 tool call done |
| Notice reached the agent after its current step | "a new access (Lab …) was shared with you … You can use it now: it is in the .env file of your working folder" |
| Lab saw the right token | yes, 11 s after the grant |
| Agent reported the lab's word | `WORD=word-85d7966d` (matches) |
| Same run, no restart needed | yes, 1 run |
| Token value in the chat | never |

## Restart path: passed
To force this path, the agent's `.env` was a folder, so the studio couldn't write it.

| Check | Result |
|---|---|
| Agent busy before the grant | running, 1 tool call done |
| Notice told it to restart | "… Restart your session to use it: commit your work, then call `forget` …" |
| Before restarting | the agent checked its environment: the access wasn't there yet |
| Agent restarted | called `forget` after the notice and continued in a fresh session from its own desk note |
| After the restart | the fresh session had the token in its environment and the lab saw the right token |
| Agent reported the lab's word | `WORD=word-cd0c64e2` (matches) |
| Same run, chat kept | yes, 1 run, one chat throughout |
| Token value in the chat | never |

## Notes
- Each path was run twice. The first versions of two checks were too loose: "busy" matched the task text, and
  "restarted" matched the word `forget` in the notice. After tightening them (a real tool call before the grant, a
  real forget record after the notice), both paths still passed. The tables above are from the strict runs.
- Port 3569 was taken by another worktree's check server, so this check used 3568.
- Each check run needs its own env var name (`LAB_TOKEN_<tag>`), because the cabinet won't let two accesses share one.
