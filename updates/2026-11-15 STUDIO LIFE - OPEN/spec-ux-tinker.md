# UX spec — New agent: Manual or Design with Tinker (L6/L7)

One idea: **Tinker builds the robot on the same stage you'd build it on by hand.** No new screen,
no new editor. The hero zoom stays; only the right column changes from the panel to a chat.

## 1. Where the choice lives
- The existing ghost slot "New agent / + Recruit" (Lineup `Slot`, `#cast/agent/new`) — unchanged.
- In the new-recruit `AgentPanel`, the `zp-top` row gets a two-option radiogroup in place of the
  "New recruit" kicker: `Manual` · `With Tinker` (reuse `Radios.tsx` / `.cx-radio`; class `.tk-mode`).
  Default **Manual**, focus stays in the name field (today's flow is untouched).
- Show `.tk-mode` only while the manual name is empty (a valid name already creates a real agent).
- `With Tinker` → `go('cast/agent/tinker')` (same zoom session, no camera move; the panel swaps).
- `+ Another orchestrator` and "Recruit “x”" stay manual-only. Crew kinds never get Tinker.
- Voice: "design a new agent with Tinker" / "Tinker, I need a Swift dev" → opens `#cast/agent/tinker`
  with that sentence sent as the first message.

## 2. Layout (`.zoom.zoom-tinker`)
- **Stage (left, as today):** `z-cone`, `z-floor`, the big bot, `LookRig` arrows + dice (direct look
  edits work exactly as manual). Before any draft: `<Hero ghost agent={{hue:'sun'}}>`.
- **Nameplate** under the bot (`.tk-plate`): `.tk-name` (name, 22px/900), `.tk-role` (caption style
  of `.zp-caption`), `.tk-sum` (the one-line summary, `--cream-72`, 2 lines max, ellipsis).
- **`z-nav` slot** (empty for new agents) holds the primary `btn btn-hero` "Add to the Cast".
- **Side column:** `<aside className="np-chat tk-chat">` — reuse `op-head` / `op-log` / `bubble` /
  `typing` / `op-composer` and the `ChatLog` component from `TeamStep.tsx` (lift it to `features/collab`).
  `op-head`: Tinker's `Hero` (size 72, `props={false}`), `<b>Tinker</b>`, `op-role` "Agent Creator",
  `op-status` (see copy). Under the head, `lib-tabs`: `Chat` · `Details`.
- **Details tab** = `AgentPanel` in draft mode (name, `RoleCombo`, Brain textarea) — no Teams section,
  no delete, no `.tk-mode`. Edits save to the session draft (needs `PATCH /creator/sessions/:id
  {draft}` → `{draft}`, no AI turn); Tinker sees them on his next turn. `Saved ✓` pip as today.
- Foot of the chat column, small: `zp-link danger` "Discard draft".

## 3. Copy (exact)
| State | Where | Copy |
|---|---|---|
| Opening (local, no AI turn) | Tinker bubble | "Hi, I’m Tinker. Who do you need?" |
| Composer placeholder | input | "Describe them — what they do, how they work…" |
| No draft yet | `.tk-plate` | name "New agent", sum "Tinker sketches here as you talk." |
| Thinking | typing dots; `op-status` | "Thinking…" (pose `thinking`) |
| Researching | `bubble them np-aside tk-research`; `op-status` | "Looking up “{query}”…" (pose `reading`) |
| Slow (20 s, nothing new) | `np-sub` under log | "Real AI can take a minute — you can leave, I’ll keep the draft." |
| Idle | `op-status` | "Designing {name}" / "Ready when you are" |
| Chat error | `bubble np-chaterr` role=alert | "Tinker couldn’t answer — {message}" (your text goes back in the box) |
| Add disabled (no name) | `title` + `zp-hint` | "Needs a name first" |
| Adding | button | "Adding…" |
| Add error | `np-err` role=alert | "Couldn’t add {name} — {message}" · button "Try again" |
| Accepted | Tinker bubble, then route | "{name} joined the Cast." |
| Discard confirm (inline) | foot | "Discard {name}? · `Discard` · `Keep`" |

Research comes from a server event (`creator.research {query}`, via `openEventStream` like the room).
At most one research line per lookup; no links, no sources list.

## 4. Showing what changed
- Each reply returns the whole draft; diff it against the previous one (pure fn in `model.ts`, tested).
- Changed text fields (`.tk-name`, `.tk-role`, `.tk-sum`, Details fields) get `.tk-changed`: a sun
  tint (`rgba(255,194,75,.14)` background, 6px radius) that fades out over 1.6 s.
- Changed look slots reuse the rig's existing `.lk-row.flash` tag flash + one `hop()` of the bot.
- Screen readers: `announce('Draft updated: role, look')` (fx.ts) — field names only, not values.
- First draft arriving: the ghost bot cross-fades to the drafted bot (260 ms), pose `waving` once.

## 5. Save + resume
- Create the session lazily on the **first send** (no empty sessions). Route becomes
  `#cast/agent/tinker/:sid`. Leaving (← Cast, Esc) keeps it; the server owns the chat.
- **The draft card is a lineup slot:** each open session renders just before the ghost "New agent"
  as `.slot.slot-ghost.slot-draft` — the drafted look at 60% opacity, name, role line "Draft · Tinker".
  Click → resumes. Aria-label: "{name}, draft with Tinker. Resume". No shelf, no list page.
- Accept → `invalidate('agents')`, `sparkle()`, bot `celebrating` (900 ms), then
  `location.replace('#cast/agent/:id')` — the normal hero zoom; focus `#zhTitle`.

## 6. Keyboard & a11y
- Open → focus the composer. Enter sends; while busy the input stays typeable, submit is ignored.
- `Esc` = ← Cast (draft kept). `[` / `]` stepping is off in Tinker mode. Tabs are real `role=tab`.
- `op-log` is `role="log" aria-live="polite"`; the research line is read once; typing dots are `sr-only`
  "Tinker is thinking". `.tk-plate` is `aria-live="off"` (the announce covers it).
- "Add to the Cast" keeps its place; after accept-error focus returns to it.

## 7. Reduced motion
- No `.tk-changed` fade: a static 2px sun underline that clears on the next turn. No hop, no
  cross-fade (instant swap), no celebrate beat (250 ms like setup). Typing dots static (setup.css).

## 8. Width
- ≤1100px: stage over chat (same rule as `.with-chat .np-grid`), chat `height:460px`.
- ≤640px: bot at `md` (160px), look arrows stay; `.tk-sum` 1 line; `lib-tabs` full width;
  "Add to the Cast" full width in `z-nav`; composer stays visible (log scrolls). 16px gutters.

## 9. Don't add
Model/temperature pickers · tool or secret grants (those live on the agent after it exists) ·
suggestion chips · a progress bar or step count · source links · a second "preview" editor ·
avatar upload · a drafts page or studio-wide drafts list · confirm modals · Tinker settings ·
plan-usage numbers · switching back to Manual mid-chat (Details covers direct edits).

## Server asks (beyond the given shape)
- Draft shape: `{name, role, summary, prompt, look}` (summary = one line, ≤90 chars).
- `PATCH /creator/sessions/:id {draft}` for Details/arrow edits; `GET /creator/sessions` for the lineup.
- Event `creator.research {query}` on the session stream.
