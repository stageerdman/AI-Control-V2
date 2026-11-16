# Invite another — update v1

Feature: *Invite Multiple Cast Agents of Same Type*. Design: [`design.md`](design.md) (Blair).

## Goal
Invite the same Cast agent more than once. Each copy is its own Cast agent (own id, name, look, teams, projects,
memory, to-dos, chats) and shares **one set of instructions** (role, prompt, tools, mail right) with its kin.
Whiteboard, chats and history keep them apart because every one of those is keyed by agent id.

## Model (decided)
- `agents.kin_id` (migration 38): the kin group. `NULL` = alone. The first copy stamps the original with
  `kin_id = original.id` and the copy gets the same value. It is only a group key: nobody is the master, and
  deleting the agent whose id it is changes nothing.
- An `Agent` carries `kinId` and `kin` (the other live kin ids, first-made first). "like Blair" = `kin[0]`.
- Instructions live on each row (no new table) and are **kept equal**: a patch to `prompt`, `roleId` or
  `canMail` writes to every live kin in the same transaction. Name, nick and look stay personal.
- A copy's name must be free in the Cast (name or nick, case-insensitive), so "call Bea" always means one agent.

## API
- `GET  /agents/:id/copy-draft` → `{ name, look }`: a fresh suggestion each call (the card, its name dice and
  ↺ Family look use it).
- `POST /agents/:id/copies` `{ name?, look? }` → 201 the new agent. Missing fields are filled from a draft.
  409 for crew (system kinds) and for a taken name (`name_taken`).
- The office door is the same call, then the existing guest route brings the copy in.

## Phases
1. **Roadmap** — this file. ✅
2. **Domain (pure)** — `domain/kin.ts`: `familyLook(original, kinLooks, rand)` (hat/tool/decal pinned, a hue no kin
   wears, a different antenna, body/face re-rolled) and `suggestKinName(original, taken, rand)` (same first
   letter from the pool, else any free pool name, else `Name 2…`). Tests: hue rule incl. all 7 taken, antenna
   differs, pins kept, name rules incl. fallbacks.
3. **Store** — migration 38, `kinId`/`kin` on `Agent`, `agents.copy(id, {name, look})`, instruction sync in
   `update`, restore re-syncs from live kin. Tests: copy keeps prompt/role/tools/mail, kin lists, sync on edit,
   look/name stay personal, delete leaves kin alone.
4. **Routes + offices** — the two routes; edits tell every office of every kin what changed. Tests: 201/409/422,
   draft is free + family, `agent.changed` reaches the kin's offices.
5. **Kept apart** — the run prompt tells a copy who it is when the shared prompt names a kin; prove whiteboard,
   chats, to-dos and history stay per agent. Tests.

## Status
Server: phases 1–5 ✅ (2 `506a396`, 3 `84e93af`, 4 `fa36e56`, 5 `ca504f2`); full server suite green (766).
Phase 5 note: whiteboard items, chats, to-dos, desk notes and runs were already keyed by agent id, so a copy is
apart by construction; the test proves a copy runs as itself, and the prompt now names its kin
(`compose.ts` `kin`, filled in `service.ts`).

Front-end ✅ (Jony, branch `studio/build-the-invite-copies-flow-…`): app suite green (565), typecheck clean.
- **The card** (`app/src/features/cast/InviteCard.tsx`, `invite.css`): `useInvite` (draft from `copy-draft`, look
  dice, ↺ Family look, Change colour, name dice, taken check, makes the copy once) + `InviteStage` (the stage
  strip, name, shares line) + `InviteDialog` (the Cast door). Pure rules in `cast/kin.ts`.
- **Cast door:** `＋ Invite another` chip in the zoom panel's top row (regular agents only) and the **Kin** row
  (28 px bots, "Open Bea"). Adding opens the new copy's zoom.
- **Office door:** the bell's Who grid keeps the ones already here (`Here` tag + `＋ Another`); the others get a
  small ＋ in the corner. The card replaces the grid; "Pick someone else" brings it back with the brief kept;
  the button reads "Bring Bea in" (makes the copy, then brings it in; a retry reuses the copy).
- Tests: `cast/kin.test.ts`, `cast/invite.test.tsx` (card, panel, zoom end-to-end), `office/life-sheets.test.tsx`
  + `life.test.ts` (the ＋ Another path, the new "Everyone's here…" line).

Follow-ups (in the design, not built yet): kin side by side + one shared floor shadow in the lineup; the office
meta line "· like Blair"; the same-look line in the Cast zoom; Tinker's "Save for all N" + "share these
instructions" line; the voice path ("Bring in another Blair"). Not yet looked at in a real window (only DOM
tests): worth one visual pass of both doors.

## Risks / next
- Renaming an agent (PATCH name) is not checked for clashes — true before this work too. Worth a follow-up so
  names stay unique Cast-wide.
- Migration 38 may collide with another branch's 38 on merge: renumber whichever lands second.
