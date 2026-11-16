# Invite another — wiki

Decisions and why, for whoever picks this up next.

- **`agents.kin_id` is only a group key.** The first copy stamps the original with `kin_id = original.id`; every
  later copy joins that value. Nobody is the master: deleting the agent whose id is the key changes nothing.
- **Instructions live on each row, kept equal.** No shared table: a patch to `prompt`, `roleId` or `canMail` is
  written to every live kin in one transaction (`db/agents.ts` `update`). Name, nick and look stay personal.
  A kin restored from the trash takes the group's current instructions (`rejoinKin`).
- **Copy names are unique in the Cast** (name or nick, case-insensitive; 409 `name_taken`), so "call Bea"
  always means one agent. Renames (PATCH name) are not checked yet — known gap.
- **Family look and name drafts are server-side and pure** (`domain/kin.ts`): hat and tool kept, a hue no kin
  wears, a different antenna; names keep the first letter when they can. The card just asks `copy-draft` again.
- **Crew (system kinds) can't be copied** (`domain/cast.ts` `assertCanCopy`, 409).
- **Kept apart by id.** Whiteboard, chats, to-dos, desk notes and runs were already keyed by agent id, so no
  change was needed there. Because the shared prompt may name the original, the run prompt tells each copy
  who its kin are and to read their names as itself (`runtime/compose.ts` `kinLine`).
- **Edits redraw every kin's offices** (`office/agent-edits.ts` emits `agent.changed` per kin).
- Migration 38 may collide with another branch on merge: renumber whichever lands second.
