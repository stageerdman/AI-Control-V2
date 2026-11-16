# Audit 2: the feature's own words, line by line (2026-11-16)

Elon Engineer, on master `b52feee`. Scope: only the feature **Revision of AI Communication**
(`f-revision-of-ai-communication`): its full description and vision, read from the live studio
(`GET /projects/ai-studio/features/f-revision-of-ai-communication`, port 4319). Nothing from other features.

**How I checked:** I read the code on master. I checked the live studio: the project's people, the Reports list
and the comms log. Code hasn't changed since the first audit earlier today (only docs commits), so its test run
(672 server and 451 app tests pass) and its three live Pixel turns still apply. I quote them where they're relevant.

**Score:** 48 separate requests. 8 done, 15 partly done, 25 not done. The feature says **Shipped 100%**, and that's wrong.

## A. From the description

| # | What the user asked | Verdict | Evidence |
|---|---|---|---|
| 1 | Pixel adds a feature from chat without touching the whiteboard (the red-phone example) | Done | `add_feature` (`office/feature-tools.ts:85`). Live: "Red phone by the safe" added as Planned, no goal |
| 2 | Pixel isn't "limited": a tool update so it can use everything in the office | Partly | Pixel has the board, features, ask, stop, resume, staffing, rebuild and questions (`app.ts:381-386`). It has no mail, pager, reports or studio-wide calls |
| 3 | …chat with any agent | Partly | `ask_person` only reaches people on the project (`action-tools.ts:37-46`). The live AI Studio project has Blair, Jony, Uncle Bob and R, so Pixel can't ask Elon |
| 4 | …hire any agent | Partly | `staff_project` brings in agents already in the Cast. Pixel can't create a new one |
| 5 | …remove any agent | Done | `rebuild_teams` (`team-tools.ts:83`) |
| 6 | …call the user | Not done | No such tool |
| 7 | …send the user a message | Partly | Report-ins page the user automatically (18 pages in the live log), but Pixel can't send one when asked. Live: "I can't … send pages" |
| 8 | Don't tell me what people said, just resolve it | Not done | `ask_person` tells Pixel to "pass their answer on" and returns "Nick answered: …" (`action-tools.ts:74,112-114`). Live: "He says it hasn't been started…" |
| 9 | Hard stop any AI in the team | Done | `stop_work` (`action-tools.ts:144`) |
| 10 | …and tell them something to interrupt them | Not done | `stop_work` takes no message (`action-tools.ts:148-153`) |
| 11 | Any leader can do that | Not done | Captains can only `cancel_run` their own runs (`running/tools.ts`) |
| 12 | Only leaders can; all other AIs wait | Partly | Non-leaders can't stop anyone (nobody but Pixel can). There's no "wait for the leader" step |
| 13 | Leaders, Pixel and single agents each get their own page of tasks or a big roadmap | Not done | Only desk notes from `forget` |
| 14 | Those pages are kept after the session ends | Partly | Desk notes are kept. There's no task or roadmap page to keep |
| 15 | Every feature or update has a big phased roadmap (research, then …) | Partly | The update template has a `## Roadmap` section (`blueprint/templates.ts:53`), and this feature's `update v1.md` had one. Nothing requires it or links it to a feature |
| 16 | Only leaders create that roadmap | Not done | No rule |
| 17 | Pixel decides who writes it | Not done | No rule or tool |
| 18 | An HTML how-to in the app: all objects and how the AIs use them | Not done | No such page in `app/src` |
| 19 | An agent asked to "put it in Reports" can do it (the HR case) | Not done | `canFile` is still for reporter roles only (`reports/reports.ts:132`). The live Reports list has 3 reports, all by Elon |
| 20 | An agent asked to "page me when you're done" can do it | Not done | Agents have no page tool |
| 21 | HR 1: telling an agent to do work in a call works, and the whiteboard tracks it | Partly | Calls are still read-only (`room.ts:35,302`). The "Start it" button works only in the user's own chat with an agent (`office/chat-work.ts`). Live: the callee said he'd do it only "if it goes on the whiteboard" |
| 22 | HR 2: when a step is reassigned, check whether it's done; if so, hand it over, don't cancel | Partly | A rebuild moves only to-do and running steps (`rebuild.ts:173`). But a step still marked running is stopped without checking whether it just delivered (`rebuild-service.ts:140-143`) |
| 23 | HR 2: the agent recognises its own earlier work | Not done | A call's task has only the request and project name (`room.ts:294-299`) |
| 24 | HR 2: pick read-only or keep-writing past chats before Jony builds | Done | Built as keep-writing (`ChatHistorySheet.tsx:1,510`) |
| 25 | Pixel can read the HQ email | Not done | Pixel's chat has no mail tools (`app.ts:381-386`). Live: "I can't check the HQ email" |
| 26 | For a side quest, Pixel asks Elon directly, not through the whiteboard and Jony | Not done | Elon isn't on the project (#3), and a call can't start work (#21) |
| 27 | The whiteboard is for Pixel's tracking and owners tick it off; agents mainly talk face to face | Partly | Steps are ticked off when delivered. But the whiteboard is still the only way to get work done (#21) |
| 28 | Pixel gives tasks to everyone, and to individuals when there are no teams | Done | `add_goal` / `add_task` with an owner (`whiteboard/tools.ts`) |
| 29 | Pixel can take a goal off the board | Done | `remove_from_board`, `clean_board`, `undo_board` |
| 30 | HR list: the callee gets a real working run | Not done | See #21 |
| 31 | HR list: a call carries the agent's latest delivery or desk note | Not done | See #23 |
| 32 | HR list: every agent run and call can use `file_report` | Not done | See #19 |
| 33 | HR list: any agent can call Pixel, and Pixel pages the user when asked | Not done | `CALLABLE = {agent, creator}` (`room.ts:44`), and Pixel has no page tool |
| 34 | HR bug: `room` lists Pixel, but `call_agent` refuses Pixel | Not done | Listed at `room.ts:105`, refused at `room.ts:160` |
| 35 | Talk to an agent while it runs and give suggestions ("Uncle Bob is already running") | Not done | `service.ts:365` still throws "already running on this project" |

## B. From the vision

| # | What the user asked | Verdict | Evidence |
|---|---|---|---|
| 36 | Agents in a team talk to one another | Partly | `call_agent`, but only for questions |
| 37 | All communication is recorded somewhere | Done | The comms log (`comms/comms.ts`) has 207 entries in the live project: calls, answers, handoffs, splits, pages, mail and desk notes. It's kept in the studio database, not in files |
| 38 | They talk through reports and requests | Partly | Work runs have mail. Reports are for reporter roles only |
| 39 | They know their hierarchy and their main contact above them | Partly | Briefs say "Goal from Pixel (your orchestrator)", and `room` shows captains (`room/context.ts`). The contact point isn't named, and Pixel can't be called (#34) |
| 40 | The job is done when they log progress and tell their authority | Done | Members deliver to their captain. Steps on the whiteboard report in to Pixel (`report-in.ts:1-8`) |
| 41 | A Communication drawer next to Reports: who talked to whom about what | Not done | `api.comms` exists (`app/src/api/studio.ts:212`), but no screen uses it |
| 42 | "I see almost no reports": review how agents use the features they're meant to use | Partly | One research report did this for communication. The live studio still has only 3 reports, all by Elon |
| 43 | Show which objects and capabilities agents use (snippets, visuals), or one report on it | Not done | Nothing logs object use, and no such report exists |
| 44 | When two agents want the same agent, they take turns | Not done | Calls run at the same time. There's no queue |
| 45 | The agent writes each caller's request into its own task list and works through it | Not done | No per-agent task list |
| 46 | A to-do paper on the agent's desk the user can open | Not done | The desk shows only the desk note (`DeskNoteSheet.tsx`) |
| 47 | Agents can schedule things and read their schedule before they finish | Not done | No schedule anywhere in `server/src` |
| 48 | "Notify me when it's done": Pixel schedules it and pages the user | Partly | A report-in can page if the request is in Pixel's last 4 chat lines and the work is a whiteboard step (`report-in.ts:66-89`). It isn't saved anywhere, and Pixel says it can't do it |

## C. Gaps and what to fix (in order)
1. **Fix the status.** Set the feature back to Now, about 30%.
2. **Resolve, don't relay (#8).** Change `ask_person`'s `can` line and description to "use the answer to act; tell the user the result, not who said what". Drop the "X answered:" wrapper. Add a conversation check.
3. **Pixel's office tools (#2, 3, 6, 7, 25, 26).** In Pixel's chat: `read_mail` / `send_mail`, `page_user`, and `ask_person` for anyone in the studio (it brings them into the room).
4. **Calls can carry work (#21, 23, 26, 30, 31).** If a call asks for work, start a real run for that agent and put it on the board for tracking. Every call includes the agent's latest delivery and desk note.
5. **Pager and Reports for everyone (#19, 20, 32, 33, 34).** `file_report` and `page_user` for every run. Make Pixel callable, which also fixes the room bug.
6. **Interrupt and leader powers (#10, 11, 12, 35).** `stop_work` takes a message. Captains get stop and interrupt for their own team. A message to a running agent is queued and reaches it through the nudge hook, instead of an "already running" error.
7. **Take turns, task lists and schedules (#13, 14, 44, 45, 46, 47, 48).** One saved task list per agent: callers' requests are added in turn, and it's read before the agent finishes. It holds "notify when done" items, so a page follows when the work ends. Show it as a to-do paper on the desk.
8. **Roadmaps (#15, 16, 17).** Every feature gets an update with a phased roadmap, written by a leader Pixel names.
9. **Seeing it (#18, 41, 42, 43).** A Communication drawer in Reports built on `/comms`. Log which objects agents use. Add an HTML how-to page showing the objects and how the AIs use them.
10. **Reassignment safety (#22).** Before stopping a running step, check whether it just delivered. If it did, hand the work over.
