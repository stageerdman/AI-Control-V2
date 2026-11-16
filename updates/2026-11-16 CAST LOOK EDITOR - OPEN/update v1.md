# Cast look editor — update v1

## Goal
"Let me change an agent's look in the Cast — and ask Tinker to improve them."

The user opens an existing agent in the Cast and changes how they look: hat, tool, body, antenna, face and
colour, with a live preview and a randomize option. From the same place they can open **Tinker (the Agent
Creator)** on that agent and ask for improvements in words ("give her a beret", "make him better at SQL").

## Where we start (what already exists)
The hero zoom (`#cast/agent/:id`, `app/src/features/cast/HeroZoom.tsx`) already has the in-game look rig
(`LookRig.tsx`): ‹ › arrows beside the bot at each slot's height, a tag per slot, and a dice. Every change
saves at once (250 ms debounce). Tinker (`TinkerZoom.tsx`, `server/src/crew/creator-chat.ts`) can only design
**new** agents.

What's missing:
1. **Pick, not just step.** 20 hats and 24 tools means up to 12 taps to reach one. There is no way to see the
   options side by side.
2. **A way back.** One dice tap replaces an agent's whole look and saves it. There is no undo.
3. **Tinker on an existing agent.** The feature's vision. Today the "With Tinker" choice only shows on a
   blank new agent.

Full design: [`design.md`](design.md). States preview: [`states.html`](states.html) (open in a browser).

## Roadmap

Each phase ends with tests that lock in what it built, and a real run of the app before the commit.

### Phase 0 — Roadmap + design ✅
- This file, `design.md`, `states.html`, `wiki.md`.

### Phase 1 — Parts tray: pick with a live try-on (app only)
- `model.ts`: `trayOptions(look, slot)` → every option for a slot as `{ value, name, look }` (the look with
  that option tried on; the hat keeps its decal, as in `cycleLook`).
- `LookTray.tsx` (new, isolated): the grid popover. Mini-bot thumbnails for hat / tool / body / antenna /
  face, round swatches for colour. Roving focus (arrow keys, Home / End), Enter or click picks, Esc closes.
- `LookRig.tsx`: the slot tag becomes a button that opens the tray for that slot (`onOpen(slot)`).
- `HeroZoom.tsx`: holds `trying: Look | null`. The big bot shows `trying ?? look`. Pick → the existing
  `setLook` (saves). Close without picking → `trying = null` (nothing saved).
- Same tray in `TinkerZoom.tsx` (it shares `LookRig`).
- **Tests:** `trayOptions` for every slot (count = options, current marked, hat → decal). Component: the tag
  opens the tray; hover / focus tries on and **does not save**; click saves once and closes; Esc closes, puts
  the look back and does **not** close the zoom; arrow keys move focus; the colour tray has 7 named swatches.

### Phase 2 — Undo look
- `HeroZoom.tsx`: remember the look the agent had when the zoom opened (reset on `[` / `]` stepping).
  While the look differs from it, show the **↺ Undo look** chip under the dice. Tap → saves the opening look
  back, the chip goes.
- `model.ts`: `sameLook(a, b)` (pure; ignores key order and a missing decal).
- **Tests:** `sameLook`. Component: no chip on open; chip after an arrow, a tray pick or the dice; tap
  restores the opening look in one save and hides the chip; stepping to another agent clears it; a dice then
  picking back by hand hides it.

### Phase 3 — Server: Tinker sessions for an existing agent
- `creator_sessions` gets `agent_id TEXT NULL` (migration). One open session per agent.
- `POST /creator/sessions { agentId }` → returns that agent's open session, or makes one with the draft
  seeded from the agent (name, nick, role, prompt, look, summary = role line) and Tinker's first line.
- `say()`: with an `agentId`, the task says "you are improving the existing agent …, change only what the
  user asks"; the name-taken check leaves out the agent's own name.
- `accept()`: with an `agentId`, **updates** that agent (same checks as `PATCH /agents/:id`) instead of
  minting a new one; returns the agent; deletes the session.
- `GET /creator/sessions` lists `agentId` so the app can mark agents with changes waiting.
- Deleting the agent drops its session.
- Only regular agents (`kind: 'agent'`). Crew → 409 "Studio crew are changed by hand".
- **Tests:** create seeds from the agent; second create returns the same session; keeping the own name
  passes, taking another agent's name fails; accept updates in place (same id, teams kept), does not add an
  agent, deletes the session; deleting the agent removes the session; crew → 409.

### Phase 4 — App: "Improve with Tinker"
- `AgentPanel.tsx`: a **✦ Improve with Tinker** chip in `zp-top` for regular agents (not crew, not drafts).
- New route `#cast/agent/:id/tinker` → `TinkerZoom` in improve mode (`agentId` prop):
  - Tinker's first line: "What should {name} get better at — or wear?"
  - Stage: the draft bot big; a small **Before** bot (the saved agent) in the stage's bottom-left corner.
  - Bottom button: **Save changes** (disabled until the draft differs from the agent) and the foot link
    **Discard changes** (asks once, like "Discard draft").
  - Save → `accept`, sparkle + celebrate, back to `#cast/agent/:id` with "Saved ✓".
  - If the agent is busy in a session: the Save button stays, with the line "{name} keeps working; the new
    version starts with their next task."
- `#cast` lineup: an agent with a waiting improve chat gets a small sun dot on their slot (title: "Tinker has
  changes waiting"). No extra draft slot.
- **Tests:** chip shows for agents, not for crew; the route opens improve mode seeded from the agent; Save is
  disabled with no change and enabled after a look change; Save updates the agent and returns to the zoom;
  Discard drops the session and leaves the agent untouched; the sun dot shows only while a session waits.

### Phase 5 — Voice path
- `tinker.ts`: `improveWithTinker(agentId, text?)` (same read-once opener as `designWithTinker`).
- The clarifier maps "Tinker, give Blair a beret" / "improve Blair" / "change Blair's look" to it.
- "Shuffle Blair's look" → opens Blair's zoom and rolls the dice once (Undo look then shows).
- **Tests:** the phrase routes to `#cast/agent/:id/tinker` with the sentence as the first message; "shuffle"
  opens the zoom with a new look and the Undo chip; an unknown name falls back to the Cast with a toast.

### Phase 6 — Final check
- Run the app on the studio port. Walk every state in `design.md` by mouse, by keyboard only, with reduced
  motion and at 640 px. Screenshots into `shots/`. Notes into `final-check.md`.
- Full test suite green.

## Status
- **Done:** Phase 0 (this roadmap, the design, the states preview).
- **Done:** Phase 1 (parts tray: `LookTray.tsx`, in the hero zoom and in design-with-Tinker) and Phase 2
  (↺ Undo look) — Jony. Plus the office side of Uncle Bob's `agent.changed`: the office reloads the roster
  and `OfficeEngine.restyle` swaps the robot in place (chair, nameplate and mug colour too), with one hop.
  Tests: `cast/look-editor.test.tsx`, `office/restyle.test.ts`, `model.test.ts` (trayOptions, sameLook).
  - Deviation: the Undo chip sits **left of the dice** in the same row, not under it (the antenna row's ›
    arrow is under the dice). The tray is portalled onto `.z-stage` (the rig has a transform).
  - `sameLook` treats a missing decal and `'none'` as the same (picking a hat then "No hat" hides the chip).
  - Not covered by a test yet: stepping to another agent resets the Undo point (by code: keyed on the agent id).
- **Next:** Phase 3 (server: Tinker sessions for an existing agent), then 4–6.

## Decisions
- Look edits from the rig / tray / dice save at once (as today). Tinker's changes wait for **Save changes**.
  Clothes are cheap and visible; Tinker can rewrite the prompt, which changes how the agent works.
- No new look slots, parts or colours in this update. (Studio Design owns parts; none were asked for.)
- Crew (director, setter, Tinker) keep the rig and tray but not "Improve with Tinker".
