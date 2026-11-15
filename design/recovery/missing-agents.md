# Missing Cast agents — findings (read-only)

Checked 2026-11-15 ~08:30 UTC against the live studio database (`~/.ai-studio/studio.db`, schema v32), opened **read-only**.
Nothing was changed. I looked at: `trash`, `agents`, `roles`, `team_members`, `project_agents`, `project_guests`, `runs`,
`checklist_items`, `goals`, `thread_messages`, `thread_sessions`, `chat_messages`, `asks`, `desk_notes`, `comms`,
`crew_time`, `reports`, `features`, `creator_sessions`, the cast pack (`server/src/cast-packs/`), the seed
(`server/src/seed.ts`) and git (`git log --all -S 'Health Analyst'`, `-S 'r-code-reviewer'`).

## The short answer

- **21 agents** are gone from the Cast. **All 21 still have a trash snapshot.** Nothing is lost yet.
- **Only Health Analyst (`a-c`) was a working agent.** It had a seat on The Founders, 6 runs and 190 chat messages.
  It was deleted at 08:24:29, 2 seconds after a batch of six pack agents, so it looks like it was caught in that cleanup by mistake.
- The other 20 have no runs, no chats, no seats on a live team and no work. They were deleted in batches with their
  teams (the old demo cast) or right after being added from the cast pack. **They look like deliberate deletes. Don't
  restore them automatically.**
- **The trash snapshot is the only copy of Health Analyst's setup.** It is not in git, not in a cast pack and not in a
  Creator session. Its token expires **2026-11-22 08:24:29 UTC** (`TRASH_TTL_MS` = 7 days). Restore it before then.
- **Nothing is blocked right now.** No running run, open ask, open item or review gate points at a missing agent.
  One item is at risk (see "Work that points at a missing agent").

## 1. Health Analyst — restore this one

| Field | Value |
|---|---|
| id | `a-c` |
| name | Health Analyst (no nick) |
| kind | `agent` |
| role | `r-code-reviewer` → "Code Reviewer". The role still exists (not reporter, not toolsmith) |
| team / project | The Founders (`founders`), seat index 4, not captain, member instr "Code review". Founders now has 5 of 7 seats, so the seat fits again. Project AI Studio (`ai-studio`) through that team. Not a solo specialist or guest anywhere |
| created / last edited | 2026-11-15 06:12:51 / 06:16:25, made in the app (Agent Creator) |
| deleted | 2026-11-15 08:24:29.697Z, trash token `0d26b76e-2d01-44f0-aa24-b1257e8c676e` |
| setup | **trash snapshot only**: full `AgentRecord` (look `{"hat":"inventor","tool":"none","body":"bruiser","antenna":"tuft","face":"freckles","hue":"mint","decal":"Inventor"}`, 662-char prompt, position 20, `can_mail` 1) plus the seat above |
| tools | `tools: null` in the snapshot = the studio's full default kit. Nothing custom to lose; restoring the record restores the tools |
| cast pack | none (no archetype matches `a-c` or "Health Analyst") |
| git | none. `git log -S 'Health Analyst'` only finds two mentions in docs (`updates/…/spec-ux-team-rebuild.md`, `review-team-rebuild.md`), no setup |
| chat history | **still there**: 190 `chat_messages` across 4 runs (07:43 → 08:26). All 6 `runs` rows and 4 `checklist_items` are kept (no FK on `agent_id`). 11 `comms` entries. No `thread_messages` (nobody chatted with it directly), no desk notes, no reports. The 2 earliest runs (06:43, 06:47) have no transcript, but that happened before chat history was recorded. The delete did not cause it |

Restoring with the original id brings all of this back with no relinking, because every history table keys on `agent_id = 'a-c'`.

Its work (all finished):

| item | text | status | run |
|---|---|---|---|
| `ce0af96a…` | Review the rebuild work against the rules | done | `1d64a3b8…` succeeded |
| `3d7403ec…` | Review the saved chat history for safety and gaps | failed (turn cap) | `73f2a887…` failed. Its goal is done |
| `dec299e4…` | Check the whole thing works end to end | done | `9a06bd91…`, `d23bf109…` failed (turn cap) → `bb9655e3…` succeeded |
| `89b6259c…` | Review the change and confirm the normal chat flow is untouched | done | `2f7e8931…` succeeded |

**Side finding for item 3 ("stop deleting agents in a running session"):** run `2f7e8931…` started at 08:24:25 and Health Analyst
was deleted at 08:24:29, **while that run was still going**. The run carried on and finished at 08:26:57. This is the exact case the
third goal item has to block.

## 2. The other 20 — deleted on purpose (as far as the data shows), not to restore automatically

All 20 have a full trash snapshot, 0 runs, 0 chats, 0 work items and no seat on any team that still exists.
Each can be put back on request with `POST /trash/:token/restore` while its token lasts.

| id | name | role | deleted (UTC) | where it was | setup sources | expires |
|---|---|---|---|---|---|---|
| `a-maestro` | Maestro | orchestrator | 11-14 15:39 | orchestrator, handed over to `a-pixel` (0 projects, 0 drafts moved) | trash `71d3348c…`, seed.ts | **11-21 15:39** |
| `a-lint` | Sir Lint-a-lot | `r-quality` | 11-15 04:40 | captain of `polish` (team also deleted 04:40) | trash `0a5220f0…`, seed.ts | 11-22 04:40 |
| `a-prof` | Professor Prompt | `r-research` | 04:41 | demo teams (deleted) | trash `199edfa5…`, seed.ts | 11-22 04:41 |
| `a-pete` | Pixel Pete | `r-frontend` | 04:41 | demo teams (deleted) | trash `cdaf1dfe…`, seed.ts | 11-22 |
| `a-semic` | Captain Semicolon | `r-backend` | 04:41 | demo teams (deleted) | trash `431f09e4…`, seed.ts | 11-22 |
| `a-twinkle` | Twinkle | `r-design` | 04:41 | demo teams (deleted) | trash `370c9508…`, seed.ts | 11-22 |
| `a-scar` | Scarlett Scenario | `r-qa` | 04:41 | demo teams (deleted) | trash `e6464e48…`, seed.ts | 11-22 |
| `a-query` | Querious | `r-data` | 04:41 | demo teams (deleted) | trash `780a8f9d…`, seed.ts | 11-22 |
| `a-baron` | Baron von Backup | `r-devops` | 04:41 | demo teams (deleted) | trash `7a1eeeaf…`, seed.ts | 11-22 |
| `a-doc` | Doc Hollywood | `r-writer` | 04:41 | demo teams (deleted) | trash `3d6cafac…`, seed.ts | 11-22 |
| `a-merge` | Madame Mergeworthy | `r-release` | 04:41 | demo teams (deleted) | trash `cc48e7f2…`, seed.ts | 11-22 |
| `a-marigold` | Marigold Wishwell | `Fable` (Delight Writer) | 08:07 | Cast only | trash `cfd71acd…`, pack ARCHETYPES | 11-22 08:07 |
| `a-calliope` | Calliope Ridewright | `Showman` | 08:07 | Cast only | trash `8e8a145c…`, pack | 11-22 |
| `a-rivet-dash` | Rivet Dash | `Rogue` | 08:07 | Cast only | trash `7986eb95…`, pack | 11-22 |
| `a-bramble` | Bramble Fizzwick | `Alchemist` (toolsmith) | 08:24:16 | Cast only | trash `18af52b9…`, pack | 11-22 08:24 |
| `a-quillon` | Quillon Hollowbrook | `Archivist` | 08:24:17 | Cast only | trash `f817c069…`, pack | 11-22 |
| `a-sable` | Sable Quietstar | `Warden` (reporter) | 08:24:20 | Cast only | trash `868d303e…`, pack | 11-22 |
| `a-tally` | Tally Starboard | `Navigator` | 08:24:22 | Cast only | trash `1679e57e…`, pack | 11-22 |
| `a-brisk` | Brisk Ignis | `Moonshot` | 08:24:24 | Cast only | trash `823a4896…`, pack | 11-22 |
| `a-sola` | Sola Simplex | `Visionary` | 08:24:27 | Cast only | trash `515ba310…`, pack | 11-22 |

Notes:
- The 9 pack agents' snapshots include custom `tools` (set). The 11 demo agents' snapshots come from before migration 32, so they
  have no `tools` key (= default kit) and no `can_mail` key (defaults to 1 on insert).
- The 5 demo teams (`ship-it`, `polish`, `engine`, `expedition`, `f1c-web-crew`) are also in trash (04:40). Restoring a demo agent
  alone won't bring back its seat, because `restoreAgent` skips seats on teams that no longer exist.
- The cast-pack roles keep ids equal to the archetype key (`Fable`, `Showman`, …) and still exist, so a restore keeps their role.

## 3. Agents we can't find (lost)

**None.** I checked every `agent_id` / `from_id` / `to_id` in `runs`, `checklist_items`, `thread_messages`, `chat_messages`,
`asks`, `desk_notes`, `crew_time`, `comms`, `reports.author` and `thread_sessions`. Each one is either in `agents` or in `trash`.
No history points at an agent that has left no snapshot.
Caveat: an agent deleted more than 7 days ago that left no history would leave no trace at all. `file()` purges expired trash on
every delete, so we can't rule that out. The data has no sign of one.

## 4. Work that points at a missing agent

- **Running runs:** 3, owned by `a-h`, `a-jony`, `a-r`. None by a missing agent.
- **Open asks, thread sessions, desk notes:** none for a missing agent.
- **Open checklist items** (7, in goals `30dedc73…` "Fix chat history UX" and `701a764d…` this recovery): all assigned to
  `a-jony`, `a-r` or `a-uncle-bob`. Every `gates` list is empty and `projects.collaboration` is `null`, so no review gate names a missing agent.
- **At risk, not blocked:** `b8b95ec5-7765-47b8-9ee0-b334c8624ce7` "Build History in the agent chat panel". Jony is integrating it
  (`team_phase = integrate`, run `6cc42c39…` running). One of its member sub-tasks, `89b6259c…`, belonged to Health Analyst,
  whose review asked for one regression fix. If Jony sends a rework round back to the members, that sub-task would go to
  `a-c`, which doesn't exist. Restoring `a-c` with its original id removes the risk. Don't re-queue this item, because it's running fine.

So `blockedRuns` is empty for every agent.

## 5. For the restore (Uncle Bob) and the check (Jony)

- Restore **`a-c` from trash token `0d26b76e-2d01-44f0-aa24-b1257e8c676e`** (the existing `trash.restore` path). Expect: record back
  with role Code Reviewer, `tools` null, seat 4 on Founders (non-captain, instr "Code review"), and 190 chat messages / 6 runs
  showing under it again with no data changes.
- Leave the 20 others in trash unless the user asks. Their snapshots (and for 9 of them, the pack) are still there.
  Maestro's token expires first (11-21 15:39 UTC).
- `findMissingAgents(store)` built only from trash will return all 21. The filter in this report: a working agent has runs,
  chats or a live seat. Only `a-c` passes.

### Deliberately deleted (same shape, for reference — not to restore automatically)

```json
[
  {"id":"a-maestro","name":"Maestro","source":"trash","chatsFound":false,"blockedRuns":[]},
  {"id":"a-lint","name":"Sir Lint-a-lot","source":"trash","chatsFound":false,"blockedRuns":[]},
  {"id":"a-prof","name":"Professor Prompt","source":"trash","chatsFound":false,"blockedRuns":[]},
  {"id":"a-pete","name":"Pixel Pete","source":"trash","chatsFound":false,"blockedRuns":[]},
  {"id":"a-semic","name":"Captain Semicolon","source":"trash","chatsFound":false,"blockedRuns":[]},
  {"id":"a-twinkle","name":"Twinkle","source":"trash","chatsFound":false,"blockedRuns":[]},
  {"id":"a-scar","name":"Scarlett Scenario","source":"trash","chatsFound":false,"blockedRuns":[]},
  {"id":"a-query","name":"Querious","source":"trash","chatsFound":false,"blockedRuns":[]},
  {"id":"a-baron","name":"Baron von Backup","source":"trash","chatsFound":false,"blockedRuns":[]},
  {"id":"a-doc","name":"Doc Hollywood","source":"trash","chatsFound":false,"blockedRuns":[]},
  {"id":"a-merge","name":"Madame Mergeworthy","source":"trash","chatsFound":false,"blockedRuns":[]},
  {"id":"a-marigold","name":"Marigold Wishwell","source":"trash","chatsFound":false,"blockedRuns":[]},
  {"id":"a-calliope","name":"Calliope Ridewright","source":"trash","chatsFound":false,"blockedRuns":[]},
  {"id":"a-rivet-dash","name":"Rivet Dash","source":"trash","chatsFound":false,"blockedRuns":[]},
  {"id":"a-bramble","name":"Bramble Fizzwick","source":"trash","chatsFound":false,"blockedRuns":[]},
  {"id":"a-quillon","name":"Quillon Hollowbrook","source":"trash","chatsFound":false,"blockedRuns":[]},
  {"id":"a-sable","name":"Sable Quietstar","source":"trash","chatsFound":false,"blockedRuns":[]},
  {"id":"a-tally","name":"Tally Starboard","source":"trash","chatsFound":false,"blockedRuns":[]},
  {"id":"a-brisk","name":"Brisk Ignis","source":"trash","chatsFound":false,"blockedRuns":[]},
  {"id":"a-sola","name":"Sola Simplex","source":"trash","chatsFound":false,"blockedRuns":[]}
]
```

### Missing agents to restore

```json
[
  {"id":"a-c","name":"Health Analyst","source":"trash","chatsFound":true,"blockedRuns":[]}
]
```
