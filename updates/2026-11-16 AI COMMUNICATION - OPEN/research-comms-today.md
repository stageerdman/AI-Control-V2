# How AI communication works today, and where it breaks

Research for the AI COMMUNICATION update (Elon Engineer, 2026-11-16). Sources: the studio comms log (the last 184
entries, 2026-11-15 06:28 to 2026-11-16 02:48), the code on master (`1e2027f` + roadmap `10fd542`), HR's
`updates/2026-11-15 HR - OPEN/comms-review.md`, and what I could see from my own tools today.

## 1. The parts and how they talk

| Channel | Who → who | How it really works | Can the receiver *act*? |
|---|---|---|---|
| **Office chat** | user ↔ Pixel | A "big picture" run. Every message carries a fresh summary. Pixel ends with JSON answer fields (`work`, `staff`, `rebuild`, `ask`, `resume`, `stop`) that run **after** the reply is written, plus the whiteboard tools (live since 2026-11-15). | Partly: board yes, features no, answering agents' questions no |
| **Pixel's `ask`** | Pixel → agent | `threads.ts:495-535` → `room.call`. A **new, separate model call** with the agent's prompt and **read-only** file tools (`room.ts:35`, `:302`). It does *not* see the agent's running session. Answer clipped to 600 chars (`threads.ts:531`). | No, read-only |
| **`call_agent`** | agent → agent | Same stand-in call as above. Callable kinds are only `agent` and `creator` (`room.ts:44`): **the orchestrator can't be called**, but `room` lists it as "in the room". | No, read-only |
| **Split / handoff** | captain → members → captain | The whiteboard starts members' real runs. Delivery text goes back as a `handoff`. | Yes (the only channel that does work) |
| **Pager** | Pixel → user | `office/pages.ts`: only the director's report-ins become pages. | n/a |
| **`ask_user`** | agent → user | `mcp/ask-server.ts`: blocks the run until the user answers. If the HTTP call fails, the agent gets an error and goes on. | User only. Pixel can't answer for them. |
| **Reports** | reporter → Reports tray | `file_report` only on reporter runs (`app.ts:236`), never in calls. | n/a |
| **Agent's past chat** | user ↔ agent | `chat-reply.ts`: one call with no tools. "You cannot change files or run anything now." | No |

**The rule underneath:** there's only one way to get work done (a whiteboard step that starts a real run).
Every *conversational* channel goes to a stand-in that can only talk. Nobody is told this clearly, so people
and agents keep using talk to ask for action.

## 2. Where it breaks, with real examples

### B1. "Two of me": a call is answered by a stand-in that doesn't know what the real agent is doing (most serious)
- **09:05:23**, Uncle Bob to Jony: *"Stopped. I haven't started or changed anything… I couldn't have made any
  changes."* Meanwhile his real session kept going and committed `797c5f2`. At 09:08 he corrected it himself:
  *"that was a separate call with no view of my running work, and it was wrong."*
- **09:03:07**, Jony to Pixel: *"I won't brief anyone."* But Jony's working session split new work at
  09:02:55 and again at 09:03:47 (to Uncle Bob, Elon and Health Analyst).
- **08:13:07**, Blair: *"I didn't make any design files for this step"*. Thirteen seconds earlier, Blair's real
  session had delivered `spec-ux-chat-history.md`.
- **Effect:** the user gets confident, wrong status reports at exactly the moment they matter most (a stop order).

### B2. Asking for action through talk goes nowhere
- 10 of the 16 call answers in the log say some form of "in this call I can only read".
- **09:16 and 09:17**: Pixel asked Jony twice in one minute to "start the front end now". Second answer:
  *"No, I'm not working on it yet. I can only read files in this call."*
- 08:12, 08:44, 09:02 and 09:03: Pixel asked Jony through a call to take steps off the whiteboard, stop Uncle Bob,
  or start Elon. Each time the answer was "please do it yourself".
- Uncle Bob's fix ("calls are for questions", `CALLS_RULE` in `797c5f2`) **never reached master**. It's still on
  branch `studio/calls-are-for-questions-only-and-work-go-3fb7118c`.

### B3. Stopping by message doesn't stop anything
- 09:02 to 09:09: the user ordered a stop four times through Pixel. Work kept starting, because each order was a
  *message* to a read-only stand-in, while the captain's real session kept splitting.
- 09:09:41, two minutes after "stop all work": the page said *"the next steps of HR's goal are still running
  under Jony. Do you want me to have Jony fix the team name and retry?"*
- **Since then:** the stop service, Running-now panel and whiteboard `force` exist. The stop now works as a *tool*.
  But nothing stops Pixel from still trying "tell X to stop" through `ask`.

### B4. Agents can't reach Pixel or the user, and the room says they can
- `room` lists Pixel under `inTheRoom` (I saw it myself today), but `call_agent` refuses: *"Nobody called 'Pixel'
  can be called"* (HR, 2026-11-15; cause `room.ts:44`).
- Only the director pages. HR was asked by the user to "page me when done" and couldn't.
- 12:32: Uncle Bob: *"my question to you didn't go through (the request failed)"*. An `ask_user` failure that
  the user never saw. The agent carried on with a guess.

### B5. Reports can only be filed by "reporters"
- 08:28: HR, asked by the user to put a review in the Reports tray, couldn't. HR called me to file it, and in a
  call I had no `file_report` either. The report never reached the tray; it went out as mail instead.

### B6. Pixel can't do things the user expects from the chat
- The trigger case: the user asked Pixel to add a feature, and Pixel couldn't. There are no features tools, and the
  prompt says to *"offer to put it on the whiteboard as a feature"* (`threads.ts:107`), which mixes up two things.
- Pixel can't answer an agent's open `ask_user` question for the user.
- Captains can't edit the whiteboard or stop a member's step either (Jony, 09:03 and 09:05). So every change
  waits on Pixel.

### B7. Noisy or misleading signals to the user
- **Duplicate failures:** *"Unknown team 'founders'"* was delivered 5 times between 09:09:36 and 09:10:38.
- **The same question every time:** 6 of the 14 pages end with "not pushed, want it pushed?". The user's answer is
  never remembered as a standing rule.
- **Gaps lost:** 08:01: "team-rebuild goal is fully done", while the captain's notes listed animations not wired
  and an unchecked overlay (HR's point 5).
- **Stale context:** the 09:16 call about a new goal also carried seven old failed HR steps in "Your steps on the
  whiteboard now".

## 3. Root causes (first principles)
1. **One brain, two bodies.** An agent's running session and its call stand-in are separate, unconnected brains.
   Whatever one says about "what I'm doing", the other doesn't know.
2. **Talk and action are separate channels, but they look the same.** Everyone can *talk* everywhere. Only the
   whiteboard *acts*. Nothing in the prompts, tools or UI makes that boundary visible.
3. **Actions run after the words.** Pixel's answer fields run after it speaks, so its reply can't say what really
   happened (Uncle Bob's root cause 3).
4. **Who may do what is uneven.** Only reporters report, only the director pages, only the director edits the
   board, and nobody can call the director. Each restriction made sense alone. Together they force long relays
   through Pixel.

## 4. Fixes, in priority order

| # | Fix | Breaks it solves | In the roadmap? |
|---|---|---|---|
| **F1** | **Calls reach the real agent when it is running.** If the callee has a live run, put the question into that session (the PostToolUse hook in `runtime/nudge-hook.ts` already injects text) and return its answer. If no live run exists, the stand-in gets a snapshot: current run, its latest delivery, branch commits since start, open steps. It also says plainly "I'm answering from notes, not from my running session." | B1, B3 | **No, add it** |
| **F2** | **Talk asks, tools act. Say it, and enforce it.** Merge `CALLS_RULE` from `797c5f2`. Pixel's `ask`/`ask_person` refuses or redirects imperative requests ("stop", "start", "remove") to the matching tool (`stop_work`, `edit_task`, `add_task`). | B2, B3 | Partly (#2, #3). Add the rule and the redirect |
| **F3** | **Features tools for Pixel** + fix the "whiteboard as a feature" wording. | B6 | Yes (#1) |
| **F4** | **Act first, then speak** (`ask`/`resume`/`stop` → tools, then `work`/`staff`/`rebuild`). | B3, B7 | Yes (#3, #4) |
| **F5** | **Everyone can reach Pixel, and through Pixel the user.** Make the orchestrator callable (answered by its big-picture brain, shown in the office chat), or add a small `tell_director` tool. A failed `ask_user` becomes a pager line "X tried to ask you: …". Until then, `room` must not list Pixel as callable. | B4 | **No, add it** |
| **F6** | **Pixel answers agents' questions for the user.** | B6 | Yes (#5) |
| **F7** | **Any agent can file a report when the user asked for one** (give `file_report` to every work run, and to calls whose request came from the user). | B5 | **No, add it** (the HQ email review folded it into this feature, but the roadmap left it out) |
| **F8** | **Honest pages:** drop identical deliveries within a minute; every delivery has a "Not done" line and the page passes it on; remember standing answers like "don't ask about pushing". | B7 | **No, add it** |
| **F9** | **Captains act on their own team's steps** (edit/stop/reassign within their team, using the same whiteboard tools, scoped). | B6 | No. Lower priority, a candidate |
| **F10** | **Honest capability list + conversation checks** (the replay suite should include the 09:02–09:09 stop sequence and the 09:05 "stopped" stand-in answer). | all | Yes (#2, #8). Add these two cases |

**F1, how:** the nudge hook already asks the studio after every tool use and can add text to the live session
(`hookSpecificOutput.additionalContext`). It is the same path that delivers the "forget" reminder. A call to a
running agent queues the question for that run. The hook delivers it after the agent's next tool use, the agent
answers with a small `answer_call` tool, and the caller waits up to a timeout (say 90 s). After that it falls back
to the snapshot stand-in and says so.

**Order (agreed with Uncle Bob, 2026-11-16):** F2 first, because it's nearly free (commit `797c5f2` already
exists) and it stops the "start now" loops right away. Then F1, the only bug that makes the studio *lie* to the
user during a stop. For F5 we prefer a `tell_director` tool to making Pixel callable. A call to Pixel would be
answered by a stand-in too, which is the same bug again. F3/F4/F6 are already well specified in the roadmap. F5/F7/F8 are small
and remove the long relays. F9 can wait until F4 lands, because it reuses the same tools.

## 5. What I'd delete
- **Answer fields** once their tools exist (roadmap #4). That's one path instead of two.
- **"Your steps on the whiteboard now"** for goals that are stopped *and* unrelated to the question. It's noise
  that the stand-in repeats back.
- **The 600-char clip** on relayed answers (`threads.ts:531`). It cuts long, careful answers mid-sentence. Ask for
  two to four sentences and trust it, or let the UI fold long ones.
