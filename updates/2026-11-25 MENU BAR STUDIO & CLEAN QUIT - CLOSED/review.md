# Live check: close, Open, Quit, nothing left running (Eraser)

Build under test: master at `5f3565c` (25 Nov 2026, 23:35). **The live test was not run.** See "Why it is blocked" below.

| # | Check | Result | What I saw |
|---|-------|--------|------------|
| 1 | Red cross hides; menu bar icon stays; agents keep working | BLOCKED | I can't click the window or see the menu bar from the agent shell. |
| 2 | Open brings back the same window, same state | BLOCKED | No way to drive the menu bar icon. |
| 3 | Quit (menu bar / Dock) shows the calm stopping line; every live agent gets a studio note | BLOCKED | No way to trigger Quit or watch the window. |
| 4 | Nothing left running after Quit (no server, agents or opened apps) | BLOCKED | `ps -axo pid,command` is refused in the agent shell, and Activity Monitor is out of reach. |
| 5 | Next launch: boot sweep finds nothing; agents resume from notes | BLOCKED | Depends on 3 and 4. |
| 6 | Only one clear way to quit | NOT CHECKED LIVE | From the code notes (`update v1.md`): menu bar Quit, ⌘Q and Dock Quit all go to one exit; the red cross and app-menu Close Window only hide. That matches `principles/magic-ux/quit-and-close.md`. Still needs a live look for a second "Quit"-like label or a hide that looks like a quit. |

Installed app: **unknown.** Reading `/Applications/AI Studio.app` is refused (it's outside the project folder), so I couldn't tell whether it is the new build.

## Why it is blocked
- `ps` is denied in the agent shell. The same limit is noted in `update v1.md` ("`ps` isn't in the agent shell").
- There is no GUI control: no clicks on the red cross, menu bar icon, Dock, ⌘Q or Close Window.
- Running `ps` or `osascript` through `node` would get around the refusal, so I didn't.

## What it needs to run
One of these:
- The user runs the six steps above on the Mac (about 5 minutes). Before quitting, start one agent that runs `npm run dev`, or Start a desktop project.
- An agent is given `ps` plus a way to drive the app, for example `osascript`, or a test-only local hook for close / open / quit.

## Failures to fix
None found yet. None of the checks above could be run, so none of them is a pass either.
