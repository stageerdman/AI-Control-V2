# Features list review (2026-11-19)

Reviewed by Elon Engineer from the live features folder (2 Now, 20 Planned, 28 Shipped). I changed nothing; every item below is a suggestion for Pixel or the user to decide.

## The short version

- **8 features belong to 3 underlying problems.** If we merge them, Planned goes from 20 items to about 12.
- **4 Planned items can't be built yet** because they have no description or the description is "TBD". Each needs a "done when" line (drafts below).
- **3 Shipped items have open gaps.** One of them, Workflows, isn't signed off, so it should move back to Now.
- **One decision is stuck:** should past chats be read-only? The two shipped features disagree, and the code follows neither.
- **Suggested order:** first fix things that lose work or trust, then safety, then the multipliers (thinking power, estimates), then UX, then office polish.

---

## 1. Duplicates and overlaps

### A. Measuring work: Agent Performance, Time estimates, Feature Work Track, Thinking Power

| Feature | What it really is |
|---|---|
| Agent Performance (Shipped) | **Records** time, tokens and requests per agent, per office. |
| Time estimates (Now, 0%, no owner) | **Adds up** those same numbers per task and feature, then **predicts** from the averages. |
| Feature Work Track (Planned, empty) | Three requests in one: (1) the work and reasoning behind each shipped feature, (2) a "follow-up / fix" button on a feature with a special tag, (3) a copyable feature code. |
| Agent Thinking Power (Now, 33%) | A **control**: model plus effort per run. It isn't a measurement. |

From first principles, all the data already exists. Performance records each run, and since "Agents keep features up to date" shipped, goals link to features. So "Time estimates" needs no new tracking. It's a roll-up (feature → goals → runs → time and tokens) plus an average.

**Suggestion:**
- Merge **Time estimates** with part (1) of **Feature Work Track** into one feature: **"Feature actuals and estimates"**. Each feature shows what it actually cost (time, tokens, runs, who worked on it, links to the reports and roadmap behind it), and new features get a predicted range based on similar past ones.
- Move parts (2) and (3) of Feature Work Track into a small UI feature, **"Feature card actions"**: copy the feature code, and "Ask for a fix / follow-up", which creates a linked feature tagged `follow-up`. Those tags are what later lets us measure how good our reasoning was.
- Keep **Thinking Power** separate, but add one dependency: Performance should record each run's thinking level. Otherwise we can never tell whether "Deep" was worth what it cost.
- Fix the typo in the name ("imrpoving").

### B. Agents who stop before the work is done: Fix "Stopped" Bug, Fix: Agent not Finishing, Agent Self Notes

All three share one root cause: **a turn ends while work is still open, and nobody owns the next step.**
- "Stopped" is the turn cap (30). Since then a carry-on was added (migration 30: an item stopped at its cap picks up where it left off). So the visible symptom may already be fixed. This needs checking against the runs table, as HR asked, not rebuilding.
- "Agent not Finishing": Pixel *describes* the next step ("Jony should update the editor…") and doesn't send anyone to do it.
- "Agent Self Notes": a note left on the desk means the work isn't finished. The agent can set a wake-up to check back.

**Suggestion:** merge them into one feature, **"Nothing left hanging"**. Done when:
1. A reply that names a next step either sends it to someone or puts it on the agent's to-do list with a wake-up time.
2. An agent with a note still on its desk isn't counted as finished, and wakes itself on a timer.
3. Turn-cap and failed stops always carry on or report why they can't (this covers HR's "captain left finishing alone" point).

The vision text in "Stopped" ("as soon as a feature is done, the orchestrator asks the user what they want next") also fits here.

### C. The orchestrator as product thinker: Add Steve Jobs Development Leader, Project Creation Improvement

Both ask for the same thing: *someone who works out what the user needs, so the user doesn't have to explain the vision.* Project Creation is the concrete version: a long project description becomes the first features, tasks, team and a short description.

**Suggestion:** build **Project Creation Improvement** first, as Pixel's behaviour. Then decide whether a separate "product lead" agent is still needed. If it is, give it an original name: studio rules don't allow real people's names for agents. The shipped Visionary & Worlds pack may already have a product-visionary style that could be reused.

### D. Smaller overlaps
- **Right Clicking Agent in Cast** only needs shortcuts to two things that already shipped: *Duplicate* is "Invite another" (with rename) and *Delete* is "Safe Agent Delete & Restore". It's a small item. Bundle it with **Improved UX of Agent Creation** as "Cast: one-view agent editor", or treat it as a quick side quest.
- **Drop sync to .env button**: since **Live Access Sharing** shipped, accesses are written into `.env` live, so the "Sync to .env" button in `ProjectAccessPanel.tsx` is redundant. Delete it (about 15 minutes).
- **Reliable Reports Tray** is what's left of a request inside "Revision of AI Communication" (every agent can file reports). Keep it separate. It's a real, focused bug.
- **Research: Off-Board Work** recommended "side errands". **Main Quests & Side Quests** delivered that (work calls become side quests). Nothing is left to do, so it's correctly Shipped.

---

## 2. Empty or vague features: what each one needs

| Feature | Problem | Proposed "done when" (needs the user's OK) |
|---|---|---|
| **Team List Feature Improvement** | No description. It doesn't say which list. | The office team list groups every agent by what they're doing now: *Working on X*, *Waiting for an answer*, *In a call*, *Idle*, *Stopped*, and updates live. |
| **Feature Work Track** | No description. Three requests mixed together. | Split it as in 1A above. |
| **Right Clicking Agent in Cast** | No description (the vision is clear). | Right-clicking a Cast agent shows **Duplicate** (opens the invite-another card, and a new name is required) and **Delete** (safe delete with 30-day restore; blocked while the agent is busy). |
| **Add Steve Jobs Development Leader** | Description is "TBD". | Decide after Project Creation (see 1C). Before it's built, the user must decide: a new agent or Pixel's behaviour, when it steps in, and what it produces. |
| Improve Office Movements & Barriers | "TBD", and it contains an unrelated bug. | Move the bug *"Orchestrator's chat bubble shows while I chat with another agent"* into its own Fix. What's left: agents don't walk through the glass wall, tables or solid objects. |
| Time estimates imrpoving | Marked Now, but at 0% with no owner and no vision. | Merge as in 1A, or move back to Planned until someone owns it. |
| Question: What happens on shutdown | A question, not a feature. | Answer it in one short research report (what happens to runs on quit or force-quit, and what resumes). Then remove the feature, or turn the gaps it finds into a Fix. |

---

## 3. Shipped features with known gaps

1. **Workflows** (marked Shipped, 100%). Its own description says *"Not signed off: a branch on a sign-off is ignored, and a team's drawing (including who starts) doesn't reach running work."* **Move it back to Now (~85%)** until the Phase 7 re-check passes. I have that re-check on my to-do list, waiting on Uncle Bob's fixes.
2. **Fix: Chat History UX** and **Agent Chat History** contradict each other and the code:
   - Agent Chat History says "past chats are read-only".
   - The follow-up on Fix: Chat History UX says the user decided read-only, but `ChatHistorySheet.tsx` still shows a reply box.
   - The code today shows a reply box on every chat that isn't running, and **"A reply in an agent's chat can start work"** *depends* on being able to write there.
   - **The user needs to decide once:** read-only past chats, or "reply continues the chat". Then make the descriptions match.
   - Also not built: the vision's **"Start new session" with Pixel** when the office is idle.
3. **Team Rebuilding** has known gaps listed by HR and still undecided: canvas animations aren't wired up, drag only works inside the overlay, and nobody has checked the overlay visually. Either do those or write "won't do".
4. **Invite Multiple Cast Agents**: the description still says "Front-end card still to do", but the next line says it was done. Cosmetic: delete the stale line.
5. **Revision of AI Communication** is huge (about 20 requests). Its main gaps landed (Comms drawer, objects view, to-do lists, file_report for everyone, leader stop). The one still visibly open is reports not always showing up, which is now **Reliable Reports Tray**. No other action.
6. **Smoother Studio Teamwork** (Planned, 14%): one of its four points is clearly still open. Migrations are still numbered in order (`/* 30 — … */`), not by timestamp, so parallel branches can still collide.

---

## 4. Suggested priority order

The rule I used: first fix what loses work or trust, then what stops the AI damaging things, then what makes every later feature cheaper, then UX, then charm.

**P0: trust and correctness (do now)**
1. **Workflows**: finish the sign-off branch and make team drawings reach running work. Already in progress.
2. **Nothing left hanging** (merged Stopped, Agent not Finishing, Self Notes).
3. **AI Safety**, starting with the concrete hole: reading has no path limit (`server/src/runtime/permissions.ts`: "Reading is always allowed") and `.env` is copied into every checkout. Add a deny rule for secrets and stay-in-folder rules. The studio edits its own code, so this risk grows with every feature.
4. **Reliable Reports Tray.**
5. **The chat-history decision** (one question to the user, then a small fix).
6. **Fix: Flaky Guests Test**: cheap, and it keeps the test suite trustworthy.

**P1: multipliers**
7. **Agent Thinking Power** (already Now; follow its 6-phase roadmap).
8. **Feature actuals and estimates** (merged Time estimates and Work Track part 1). It also records thinking level.
9. **Project Creation Improvement**, then decide on the product-lead agent.
10. **Smoother Studio Teamwork**: what's left (timestamp migrations, "start after" steps, a "Not done / known gaps" line on every delivery).

**P2: UX**
11. **Notifications** (system notifications for pager messages when the app isn't in focus).
12. **Cast: one-view agent editor** (Improved UX of Agent Creation plus the right-click menu).
13. **Team list grouped by activity.**
14. **Feature card actions** (copy code, follow-up and fix with a tag).

**P3: office charm**
15. **Improve Office Movements & Barriers** (with the chat-bubble bug split out).
16. **Red Phone on a Wall.**

**Quick wins (under an hour each; batch them as side quests anytime)**
- Delete the "Sync to .env" button.
- Move "Add new feature" to the top of the list.
- Make the message box grow as you type.
- Fix the orchestrator's chat bubble showing during other chats.
- Answer "What happens on shutdown" in a report.
- Clean up the Invite Multiple description, and move Workflows back to Now.

## What I deleted from the plan (on paper)
**7 items go away as separate features:** Time estimates, Feature Work Track, Fix "Stopped" Bug, Agent not Finishing, Agent Self Notes, Right-click (folded into the Cast editor) and Drop-sync (it becomes a quick win). **3 are added in their place:** Feature actuals and estimates, Nothing left hanging, and Feature card actions. Net: 4 fewer items, and each one left has a clear "done when".
