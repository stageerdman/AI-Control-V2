# Audit 2: what was fixed

Each item from `audit-2-full-text.md` that was Partly or Not done, with the commit that fixed it.
Items already Done (1, 5, 9, 24, 28, 29, 37, 40) are left out. Every commit comes with tests.
All server and app tests pass, and both typechecks are clean.

| # | Request | Fix | Commit |
|---|---|---|---|
| 2 | Pixel can use everything in the office | Mail, pager, proposing agents, studio-wide asks, stop with a message, tell_agent, to-dos | 01ace3e, 0bce3df, 6224833, 0e6976d |
| 3 | …chat with any agent | `ask_person` reaches anyone in the studio; people from outside the project join the room | 6224833 |
| 4 | …hire any agent | Pixel proposes new agents from chat (Cast draft) | 01ace3e |
| 6 | …call the user | `page_user` (now, or when a goal ends) is the studio's line to the user | 01ace3e |
| 7 | …send the user a message | `page_user` from chat and from every agent run | 01ace3e |
| 8 | Resolve, don't relay | `ask_person` tells Pixel to act on the answer, not repeat it | 0bce3df |
| 10 | Stop with a message | `stop_work` takes a message and leaves it on the desk | 0bce3df |
| 11 | Any leader can stop | Captains get stop_work/tell_agent for their own team | 63da394 |
| 12 | Only leaders stop; others wait | Leaders' rule in every room: others ask their contact and wait | 9617a68 |
| 13, 14 | Own task page, kept after the session | To-do lists (stored in the DB) for every agent and the director: my_todos/add_todo/done_todo | ad166fb, 0e6976d |
| 15, 16, 17 | Phased roadmap, written by one leader Pixel names | ROADMAP_RULE in Pixel's prompt; ROADMAPS_ARE_FOR_LEADERS for everyone else | e54757e |
| 18 | HTML how-to of every object | `GET /projects/:id/how-to`, linked from the Communication drawer | da17832, 7bb533a |
| 19, 32, 38 | Any agent can file a report | Every agent run may use `file_report` | b9d9201, e54757e |
| 20 | Agent can "page me when done" | `page_user` in every agent run | 01ace3e |
| 21, 27, 30, 36 | Work asked for in a call gets done | `work: true` on a call puts it on the whiteboard as the callee's task and on their to-do list | 1fff805, 0e6976d |
| 22 | Check before reassigning a step | Rebuild keeps a step whose run just delivered | ac1deb2 |
| 23, 31 | Agent recognises its own earlier work | Calls carry the callee's latest delivery and desk note | 1fff805 |
| 25 | Pixel reads HQ email | Mail tools in Pixel's chat | 01ace3e |
| 26 | Side quest straight to Elon | Ask anyone in the studio; `work: true` hands them the side quest | 6224833 |
| 33, 34 | Any agent can call Pixel | The orchestrator can be called; the room and call approval use one rule | 1fff805, 9617a68 |
| 35 | Talk to a running agent | A message to a busy agent becomes a note for its run (read after its next step) | 80e4a26, b9d9201 |
| 39 | Know your contact | Every room names your contact (your captain, else the orchestrator) | 9617a68 |
| 41 | Communication drawer in Reports | Reports → Communication shows who talked to whom, what agents use, and the how-to link | 7bb533a |
| 42, 43 | See which objects agents use | Every tool call is logged as a `tool.used` event; `GET /projects/:id/tool-use`; shown in the drawer and on the how-to page | da17832, 7bb533a |
| 44 | Take turns on the same agent | One call at a time per callee | 1fff805 |
| 45, 46 | Callers' requests go on the agent's list; a to-do paper on the desk | Work calls are queued on the callee's to-do list; TodoPaper on the desk sheet | 0e6976d |
| 47 | Agents schedule things and read the list before finishing | To-dos plus the memory rule: check my_todos before you finish | 0e6976d |
| 48 | "Notify me when it's done" | `page_user` with a goal is saved as a notify to-do and fires when the goal ends | ad166fb, 01ace3e |

## Known limits
- For a director's `ask_person` with `work: true`, the to-do text is the full wrapped request, not a short title.
- `file_report` and `ask_user` go through the MCP ask-server, not the bridge, so the use log doesn't count them.
- Pixel can only propose a new agent. The user still adds it in the Cast (on purpose).
- A message to a running agent is read after its next step. It doesn't interrupt mid-step.
