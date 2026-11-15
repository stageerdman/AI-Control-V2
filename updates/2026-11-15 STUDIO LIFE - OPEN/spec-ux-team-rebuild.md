# UX spec — rebuilding teams (STUDIO LIFE)

One idea: **rebuilding is rearranging the room.** The director (or the user) moves robots between team tables, to a
solo desk, or out of the door. Adding people stays instant (as `staffing.ts` does today); **anything that takes
someone off the project or touches work in progress shows one confirm card first**, then gets an Undo.

Built on what exists: `staffing.ts` (all-or-nothing apply in `store.tx`, `staff.changed`), `domain/teams.ts`
(≤ 7 members, captain ∈ members, removing the captain promotes the next), `db/trash.ts` (restore tokens),
checklist items carrying `agentId` + `teamId`.

## 1. The five moves

| Move | What it means | Confirm? |
|---|---|---|
| **Remove a person** | They leave *this project* (team seat or specialist desk). They stay in the Cast. | Yes |
| **Remove a team** | The team leaves *this project*. The Cast team and its people are untouched. | Yes |
| **Split a team** | One team becomes two (or more), each with a name and a captain. Everyone keeps a seat. | Only if rule 2.2 or 2.3 applies |
| **Move a person** | Team A → team B, keeping their job line (editable). | Only if rule 2.2 or 2.3 applies |
| **Make a specialist** | A team member steps off the team and works solo on this project (`project.agentIds`). | Only if rule 2.2 or 2.3 applies |

"Remove" never deletes an agent or a Cast team. Deleting is the Cast's job (it has its own trash).

## 2. Rules the builders must keep

1. **All or nothing.** One rebuild is one plan, applied in one `store.tx`. If any step breaks a rule, nothing
   changes and the reply says which step failed, in plain words.
2. **Shared teams get a copy, not a surprise.** Cast teams can be on several projects. When a move would change a
   team that is also on another project, the project gets its own copy (`"The Founders · AI Studio"`, same emblem,
   next free hue). The original stays as it is everywhere else. The confirm card says so: *"The Founders also work
   on Garden App, so this project gets its own copy."* A team used only here is edited directly.
3. **Work in progress is never dropped.** If someone leaving or moving has open checklist items (not done), the
   card lists them and picks a default:
   - Team member leaving/moving → their items go to **their captain** (the captain re-splits).
   - Whole team leaving → their items go back to **the director** to reassign (status `waiting`, shown on the
     whiteboard as *"needs a new owner"*).
   - Specialist leaving → items go to the director, same as above.
   - Someone **running right now**: default is *"finish this item, then leave"* (seat stays until the run ends);
     the other choice is *"stop now and hand over"*. Never kill a run without saying so on the card.
4. **Captains.** Removing or moving a captain promotes the next member (existing rule); the card names the new
   captain and lets you pick another. A split names a captain per new team (director proposes, user can change).
5. **Team size.** A team left with one person isn't a team: the card offers *"Make Uncle Bob a specialist"*
   (default) or *"Remove Uncle Bob too"*. A move that would push a team past 7 is refused with the reason.
6. **Guests are separate.** Guests are sent home with the existing guest flow; rebuild doesn't touch them, except
   that someone who becomes staff stops being a guest (as `staffing.ts` already does).

## 3. What the user sees

### Voice / chat path (first-class)
User: *"Take Elon off the Founders and make Humanitarian a solo specialist. Split the rest into Design and Build."*

- The director answers with a new optional field next to `staff`: **`rebuild`** (shape in §4).
- If the plan only moves people with no open work → it applies at once; the reply says what changed, with an
  **Undo** link (10 min).
- Otherwise the chat shows a **confirm card** under the reply, not applied yet:

```
 Rebuild the team?
 ─────────────────────────────────────────────
 Leaves this project     Elon Engineer
                         → 1 open item goes to Jony (captain)
 Becomes a specialist    Humanitarian
 New teams               Design  · captain Jony   (Jony, HR)
                         Build   · captain Uncle Bob (Uncle Bob, Health Analyst)
 The Founders also work on Garden App — this project gets its own copy.
 ─────────────────────────────────────────────
            [ Keep as is ]        [ Rebuild ]
```

  - One line per person or team, **names and faces** (`Portrait`), grouped by what happens to them.
  - Removals come first and use the warm `--coral` accent; everything else is neutral.
  - Each work line has a small "change" menu (hand to captain / to director / let them finish).
  - Voice: *"yes"* / *"rebuild"* confirms, *"no"* / *"keep"* cancels. The card is the only place this plan
    can be confirmed; a new message makes it stale (greyed, *"Plan changed — ask again"*).
  - Primary button is the safe-looking one only in weight: `Rebuild` is filled, `Keep as is` is outline.
    Keyboard: focus lands on `Keep as is`; Enter on `Rebuild` confirms.

### Office path (click)
- A **Rearrange** button in the existing team sheet (opened from the captain's binder): robots can be dragged
  between team tables, to an empty solo desk (= specialist), or onto the **door** (= leaves). Keyboard: each
  robot has a "Move to…" menu with the same three choices.
- Nothing applies while dragging. A bar at the bottom reads *"3 changes"* with `Cancel` / `Review`; `Review`
  opens the **same confirm card** as the chat path. One card, two ways in.

### After it applies
- Leavers wave and walk out of the door; movers carry their chair to the new table; a new specialist gets a
  solo desk. (Animation notes in §5.)
- The director posts one line in chat: *"Done — Elon left, Humanitarian works solo, the Founders are now Design
  and Build."* plus **Undo**.
- **Undo** restores the whole plan (lineup, captains, item owners) from a snapshot, while nobody has started new
  work under the new lineup. After that, Undo is gone and you rebuild again instead.

## 4. Shape (for Uncle Bob)

```ts
rebuild: {
  remove?:      string[];                                  // people leave the project
  removeTeams?: string[];                                  // teams leave the project
  move?:        { agent: string; to: string | 'specialist'; job?: string }[]; // to a team on this project
  split?:       { team: string; into: { name: string; captain: string; members: string[] }[] }[];
  captain?:     { team: string; agent: string }[];
  handover?:    { agent: string; to: 'captain' | 'director' | 'finish-first' | 'stop-now' }[];
}
```
- Names only from what's **on this project** (a `projectLineup()` next to `castAvailable()` for the prompt).
- Server: `planRebuild(project, rebuild) → { steps, needsConfirm, card }` (pure, testable) and
  `applyRebuild(planId)` (tx + snapshot for Undo). `needsConfirm` = any remove/removeTeams, any open work
  touched, or any shared-team copy.
- Events: `room.left {agentId, by}` per leaver, then one `staff.changed {teamIds, agentIds, added, removed,
  moved}`. The office reloads on `staff.changed` as it does now.
- Director prompt line (in `DIRECTOR_ANSWER`): *REBUILD: the user asks to take people off, split, merge or
  reshuffle teams. Set "rebuild" with names from the project's lineup. Never claim it's done when it needs a
  confirm — say "Here's the plan, confirm below."*

## 5. Looks and motion (Blair)
No new look slots; every robot still reads complete.
- **Leaving** — feeling: warm goodbye, not fired. A small hop (squash 0.92 → stretch 1.06), one wave of the tool
  hand, walk to the door. 900 ms. Reduced motion: fade out at the desk.
- **Moving** — feeling: busy, cheerful. The robot lifts its chair (stretch up), walks, sets it down (squash).
  The team table's emblem hue tints the chair cushion, so who-is-where reads at a glance.
- **Specialist** — feeling: proud, independent. The solo desk has no team hue; the robot keeps its own hue.
  A tiny desk tent card with their role (existing `tent` desk item) — no badge slot needed.
- **Split** — the table slides apart into two; each half takes its team's emblem and hue. 600 ms.

## 6. Out of scope
Deleting agents or Cast teams; editing Cast teams from inside a project beyond the copy rule; guests; moving
people across projects (that's "remove here" + "staff there").
