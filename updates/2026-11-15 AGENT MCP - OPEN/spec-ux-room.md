# UX spec — the setup room (M5)

One idea: **the floor is the room, the cards are the plan.** Whoever is *present* stands bare on the stage floor
beside the orchestrator; whoever is *proposed* stays inside the plan's squad cards. Speech lives in the side chat;
the stage only shows who is here and what they're doing. No new panels, headers or buttons.

## 1. The room on the stage
**Where.** Wrap the lead in a new cluster at the left of `.np-planstage`, before `.np-groups`:
`<div class="np-room" role="group" aria-label="In the room: Pixel, Tinker, Twinkle">` → the orchestrator `Actor`
(unchanged, 116), then one `.np-guest` `Actor` per joined agent in join order (size 84, `dir="left"` — they face
the orchestrator). The old trailing `np-creator` Actor in `PlanStage` goes away: Tinker is now a guest like any other.
- `.np-room`: `display:flex; align-items:flex-end; gap:6px; flex:none;` plus a soft floor glow (`::before`,
  `radial-gradient` of `--sun` at 0.10, under the feet only). No border, no card, no caption — the absence of a card
  *is* the difference from the plan.
- A guest who is also in the plan stays in both (bare on the floor = here now; in the card = on the team). That's
  honest, not a duplicate; their card copy keeps its normal pose.
- More than 3 guests: show the latest 3, then a plain plate `+2` (`.np-plate`, `title` lists the names).
- ≤640px: guests drop to size 64; the room stays on one line, the plan wraps below as today.

**Joining** (on `room.joined`): reuse the existing `np-in` keyframe (slides in from the right, 0.6s — walking
toward the orchestrator) with `pose="walking"`, then `waving` for 900 ms, then their working pose. Class while it
plays: `.np-guest.is-joining`. `title` on the guest = the event's `why` (hover only).

**Plate.** Name (nick) always. The `<small>` kind line shows only what they're doing *right now*, else nothing:

| moment | pose | `<small>` |
|---|---|---|
| Tinker working on briefs | `pressing` (as today) | `designing` |
| Tinker asking | `talking` | `asking Pixel` |
| orchestrator deciding (approver) | `thinking` | `Orchestrator` (unchanged) |
| guest working for someone | `writing` | `for Tinker` |
| answered / failed / idle | `idle` | — |

After accept, everyone in the room stays (idle) next to Pixel; the plan's new members celebrate in their cards as
today. Tinker does not celebrate — the work does.

## 2. The ask-and-allow moment
Chat (`op-log`) carries the speech. All lines come from server `chat.message`s; the client only labels them.
Agent-to-agent lines get `.bubble.them.np-aside` — same bubble, inset 16px left, `--cream` at 0.6 instead of the
full fill — so the user can see "they're talking to each other, not to me". `who` = the speaker's nick
(`ChatMessage` gains `from: 'agent'` + `agentId`; `who()` resolves `agentId` via the Cast).

Copy (server-side strings, nicks substituted; `{task}` is a ≤6-word noun phrase from the call's request):
- `asking` — **Tinker:** `Pixel, may I bring in Twinkle to design {task}?` → e.g. "…to design the costume?"
- `approved` — **Pixel:** `Yes — go ahead.`
- `declined` — **Pixel:** `Not this time — {note}` (note ≤1 sentence, e.g. "Tinker can dress them from the
  brief.") then **Tinker:** `Okay — I'll do it myself.`
- `working` — no line (the stage shows it).
- `answered` — **Twinkle:** `Done — {one-line summary}` (e.g. "Done — a teal visor and a tool belt."). Never the
  full answer; detail goes into the minted agent.
- `failed` — **Tinker:** `Twinkle couldn't finish — I'll carry on.`
- Callee already in the room (no approval needed): only **Tinker:** `Twinkle, could you design {task}?` then the
  answer line.

Stage during the ask: the callee is **not** on stage yet (no ghost, no silhouette — a ghost would read as "proposed").
Tinker `talking`, Pixel `thinking`; on `approved` Pixel `talking` for 900 ms, then Twinkle joins. On `declined`
Pixel `talking` 900 ms → `idle`, Tinker back to `pressing`. The user is never asked; no Allow/Deny buttons.

## 3. Waiting, errors, motion, a11y, reload
**Long wait.** The primary button keeps `Tinker is designing…` for the whole accept (don't cycle copy). After 20 s
with no new event, one quiet line under it in `.np-sub`: `Real agents can take a few minutes.` Only add
`— you can leave, it keeps going.` if the accept run survives the request closing (server dependency — check M3).
No timers, spinners or per-call progress bars; the poses are the progress.
The chat composer stays read-only during accept (as today); chat header `op-status` → `With Tinker` while any guest
is working, else `Planning {name}'s teams`.

**Errors.** Accept fails → existing `acceptErr` + `Try again`; the room keeps whoever joined (they did join), all
`idle`. A failed call is just the `failed` chat line; the guest stays, `idle`. Stream drops → nothing visible; the
accept response + the existing `drafts.get` refetch are the truth and rebuild the room.

**Reduced motion** (`reducedMotion()` / the existing media block): no `np-in`, no walking or waving — the guest
appears in its working pose with a 150 ms opacity fade. Add `.np-guest` to the `prefers-reduced-motion` list.

**Screen readers.** The stage stays decorative except `.np-room`'s `aria-label` (kept current). One visually hidden
polite region on the stage, `<p class="sr-only" aria-live="polite">`, says only joins:
`Tinker joined the room.` / `Twinkle joined the room, for Tinker.` Speech is already announced by the chat log
(`role="log"`); asides read as normal lines. Focus never moves on room events; it still moves to the primary
button only when minting is done (as today).

**Reload.** Room = a pure fold of the draft's events: `roomFold(state, ev)` in `flow.ts`
(`{ guests: {agentId, by, why}[], calls: Record<callId, status> }`) — `room.joined` adds once (dedupe by agentId),
`room.call` updates status. On mount, fold the stream's replay (no `t0` filter for room events, unlike the Setter);
chat lines come back with `draft.chat`. If accept isn't running after reload, any call still `asking`/`working`
renders as `idle` (stale), no line added. Guests persist until the project is finished.
Tests: fold dedupe, stale-call → idle, `who()` for `from:'agent'`, aside class only on agent-to-agent lines.

## 4. Later — the office
A guest called during project work walks in through the office door, stands beside the caller's desk in `writing`
with a `for {caller}` plate, and after answering takes a spare seat (or leaves on finish) — the same `room.joined`
fold, rendered by the office scene.

## Do NOT add
- An "In the room" heading, legend, list or counter; a separate room panel or tab.
- Approve/deny controls for the user, toasts, sounds, confetti for joins.
- A ghost/placeholder for the agent being asked; leave/exit animations.
- Join notes as chat bubbles (the stage + sr-only region carry joins); full call answers in the chat.
- Timers, elapsed clocks, per-call progress bars, avatars inside bubbles, a new font, colour or size.
