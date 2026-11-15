# Restore note: missing Cast agents

Checked on 2026-11-15 at about 08:40 UTC. I read the live studio database (read-only) and the running backend (`GET /agents`, `GET /agents/a-c/chats`).
I compared them with `missing-agents.md` (Elon Engineer) and Uncle Bob's restore (`server/src/office/restore-missing.ts`).

## Who came back

**Health Analyst (`a-c`)**: back under its original id, restored from its trash snapshot.
- **Setup:** back. Role is Code Reviewer, with the same look (Inventor, mint), the same 662-character prompt, position 20 and mail on. It is again seat 4 on The Founders (not captain, note "Code review"), so it is on AI Studio again.
- **Tools:** back. It has the studio's default kit (`tools: null`), the same as before the delete.
- **Chats:** back. All 6 earlier runs show under it again. The Cast shows them in its chat list, and the 190 messages are there. The 4 work items it did and its 11 comms entries are linked again.
- **Works again:** a test chat at 08:36 ("are you back?") succeeded, so it now has 7 runs and 193 messages.

## Who stays deleted (on purpose)

The other 20 agents on Elon's list are still in trash, and this is on purpose. They had no runs, no chats, no work and no seat on a team that still exists. Each one has a trash snapshot and can be restored from Trash if the user asks:
Maestro, Sir Lint-a-lot, Professor Prompt, Pixel Pete, Captain Semicolon, Twinkle, Scarlett Scenario, Querious, Baron von Backup, Doc Hollywood, Madame Mergeworthy, Marigold Wishwell, Calliope Ridewright, Rivet Dash, Bramble Fizzwick, Quillon Hollowbrook, Sable Quietstar, Tally Starboard, Brisk Ignis, Sola Simplex.

## What we could not recover

- **No agent is lost.** Every agent on the list is either back or still in trash with a full snapshot.
- Health Analyst's first 2 runs (06:43 and 06:47) have no transcript. They ran before chat history was recorded, so the delete did not cause this.

## Work

- **No work is blocked.** No open item on a live goal belongs to an agent that is missing. The only run going now is Jony's.
- The item that was at risk, "Build History in the agent chat panel" (`b8b95ec5…`), is done. If it is ever reworked, its review sub-task would go to `a-c`, which exists again.
- Health Analyst's one failed item, `3d7403ec…`, does not need re-queuing because its goal is done.

## What to do

Trash still keeps deleted agents for only 7 days, so ship the 30-day trash (goal item 2) before Maestro's snapshot expires on **2026-11-21 15:39 UTC**. The others expire on 11-22.
