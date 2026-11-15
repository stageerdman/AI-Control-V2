# Review · Recently deleted (delete → list → restore → unchanged)

Reviewer: Health Analyst (Code Reviewer, The Founders) · 2026-11-15
Branch reviewed: `studio/keep-deleted-agents-restorable-for-30-da-ed16cab7` at `ecd2f63`
(soft delete `54dc601`, tests `5f4b155`, Cast UI `9ff3785` + `7ea9a13`).

## Verdict

**The done test passes.** It's safe to merge after the one must-fix below, which only hits the recovery tool and
cast-pack install, not the Cast's own delete and restore.

## How I checked

- I ran a throwaway end-to-end probe on a seeded studio. It was not committed. The agent was Captain Semicolon
  (`a-semic`), set up with a **custom prompt**, **custom tools**, the **captain seat** on Ship-It, a **guest
  spot** on Aurora (orchestrator may use them) and **a past chat**. The probe ran DELETE → `GET /trash/agents` →
  restore → compare.
  - The agent left `GET /agents` and their guest spot was hidden. Roles' `agentCount` dropped while they were
    deleted. The list row showed `expiresAt − deletedAt = 30 days` and `chats: 1`.
  - After restore, `GET /agents/a-semic` was **identical**: prompt, tools, look, role, position (their old lineup
    spot), canMail, teamIds and projectIds. The team roster (index 0, captain) was back, and so were the guest
    spot (brief + orchestrator flag), the chats and the role counts.
  - The only difference was the team's `updatedAt`. That's expected because the roster was saved again.
- Delete → restore → delete again shows **one** row in Recently deleted. The restore token is used up, so
  nothing shows twice.
- After the 30-day purge, the agent's chats are **still in the database**. Runs, chat_messages and
  thread_messages have no foreign key to `agents`. **Nothing hard-deletes chats inside 30 days, or after it.**
- Tests: `test/db/trash-agents.test.ts`, `test/office/restore-missing.test.ts`, `test/office/guests.test.ts` and
  `app/src/features/cast/RecentlyDeleted.test.tsx` (10/10) all pass. The full server suite: 579/580 pass. The one
  failure was `test/crew/flow.test.ts`, which passes when run alone. It's a timing flake under load, not this
  change.
- I went through every raw SQL statement that touches `agents`, `team_members`, `project_agents` and
  `project_guests`, and every `store.agents.*` lookup in `crew/`, `office/`, `room/` and `routes/`.

## Where hidden agents could leak (the query sweep)

| Place | Hidden agent shown? | Why |
|---|---|---|
| Cast / `GET /agents`, `agents.get/require/ref` | No | `records()`/`record()` filter `deleted_at IS NULL` |
| Team rosters, seat counts, captain | No | the seat is removed on delete and put back on restore |
| Project specialists | No | the link is removed on delete (`unlink`) and relinked on restore |
| Guests (rosters, orchestrator pick list) | No | `guests.ts` `LIVE` filter; the row is kept for restore |
| Orchestrator pick / project orchestrator | No | projects and drafts are handed over on delete and handed back on restore |
| Role agent counts | No | `roles.ts` subquery filters `deleted_at` |
| Feature owners | No | `features.ts` filters `deleted_at` |
| Office dispatch / room / staffing / threads | No | they all go through `store.agents.get`, so a hidden agent reads as "not there" |
| `runs.ts:220`, `office/work-time.ts:100` (LEFT JOIN agents) | Name only | historical rows: the name of a deleted agent still shows on past asks and work time. That's fine and arguably right |
| `exists(db, 'agents', id)` (new-id picking, `bringBackRecord`) | Yes, on purpose | stops a new agent from taking a hidden agent's id |

## Must-fix

1. **The recovery tool and cast-pack install crash on a hidden id** (`UNIQUE constraint failed: agents.id`).
   - **How it happens:** a hidden row stays in place until the *next* delete runs `purge()`. It can sit there
     longer than 30 days.
   - **Recovery tool:** if the token has expired but the row hasn't been purged, `office/restore-missing.ts`
     `findMissingAgents` lists the agent as missing. `putBack` then finds no live snapshot and falls through to
     `fromPack` → `store.agents.create(..., id)`, which throws.
   - **Reproduced:** with ARCHETYPES installed, delete `a-sola`, backdate the token 31 days, then run
     `restoreAgent(store, 'a-sola')`.
   - **Cast-pack install:** `cast-packs/pack.ts:41` (`installPackIfNeeded`) has the same hole. It checks
     `store.agents.get(id)`, which skips hidden rows, so a new pack whose id matches a hidden agent breaks the
     startup install.
   - **A test hides it:** in `test/office/restore-missing.test.ts`, the `deleteTrashRows` helper now also
     hard-deletes the row, which covers up this path.
   - **Fix, smallest first:**
     - (a) In `fromPack` and `installPackIfNeeded`: if `agents.hiddenRecord(id)` exists, unhide it (or
       hard-delete it first) instead of `create`.
     - (b) Run `trash.purge()` at server start and before `deletedAgents()`/`restore`, not only inside `file()`.
       Then "kept 30 days" really means 30 days, and an expired hidden row can't linger.
     - Add a test for each case.

## Nice-to-have

1. **The "seat was taken" toast never fires.** The UI reads `seatsLost` from the restore reply
   (`app/src/features/cast/store.ts:189`, spec state "Seat taken meanwhile"). The server returns only
   `{ restored }`, so a seat skipped because the team filled up is silent. **Reuse what exists:**
   `notBack()` in `office/restore-missing.ts` already works out lost seats. Move it into `trash.ts`, return
   `seatsLost` (team names), and the recovery tool and the Cast will share one function.
2. **The copy and code comment don't match what happens.** `DeletedAgent.expiresAt` says "when the agent and its
   chats are gone for good", but the purge removes only the agent row and its links. The chats stay, orphaned,
   and `routes/chats.ts:27` can still serve them. Pick one: keep the chats (and fix the comment and any UI copy),
   or purge them too. Keeping them matches the founders' "history outlives the agent" schema notes.
3. **A team deleted while the agent is in the trash.** The agent's seat was already taken off the roster, so the
   team's own snapshot doesn't include them. If the team is restored first, the agent's later restore does put
   the seat back (the team exists again). If the agent is restored first, the seat is skipped for good. It's
   rare, but it should go in the "lost" list once item 1 exists.
4. **There's no end-to-end test of the brief's full done test.** `trash-agents.test.ts` covers captain + chats,
   and checks prompt and tools only through record equality on seed values. Add one case with a *changed*
   prompt, a *custom* toolset, a guest spot and a specialist link. The probe above does exactly this: about 30
   lines.
5. **Spec drift.** `design/cast/recently-deleted.md` says "a chat count on each row" was removed, but the API
   still computes `chats` for every row (`runsRepo(db).countByAgent` per row). It's cheap, but either use it in
   the UI ("comes back with 6 chats" adds confidence) or drop it from the payload.
6. **Flaky test.** `test/crew/flow.test.ts` fails under full-suite load and passes alone. It's not from this
   change. Someone on the crew side should make its wait loop time-independent.

## Health notes (principles)

- **Modularity is good.** All agent reads go through two functions (`records`/`record`), which is why the leak
  sweep came back clean. The one leak class found (must-fix 1) is code that *creates* by id while checking only
  the live view. A single `agents.idTaken(id)` helper (live or hidden) used by `create`, cast packs and
  restore-missing would close that whole class.
- **Reuse is good.** Undo and Recently deleted share `bringBack(token)` and one server restore path, and
  restore-missing goes through `trash.restore` too. Nice-to-have 1 is the one spot where logic is duplicated
  instead of shared.
- **Debuggability:** the recovery tool's `lost[]` list is a good pattern. The Cast restore should report the same
  way.

## For the orchestrator

All of these can be fixed **inside the team**. Must-fix 1 and nice-to-haves 1, 2 and 4 belong to the backend
owner of this item (`server/src/db/trash.ts`, `server/src/office/restore-missing.ts`,
`server/src/cast-packs/pack.ts`). Nothing here needs HQ. The flaky `flow.test.ts` (nice-to-have 6) is the
only item outside this team's lane. Decide whether to hand it to the crew-dispatch owner or file it with HQ as
a ticket.
