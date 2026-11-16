# Cast look editor — design

States preview: [`states.html`](states.html). Roadmap: [`update v1.md`](update%20v1.md).

## User goal
"I open Blair in the Cast and change how she looks." Fast to try things, easy to see the choices, safe to
play with. And: "I ask Tinker to make her better," in words, without starting a new agent.

**Feeling:** a dressing-up game. Playful and brave to try, because nothing is lost.

## What stays (it already works)
The hero zoom stage: the big bot, ‹ › arrows at each slot's height, the slot tag beside ›, the dice above.
Changes crossfade on the bot and save at once ("Saved ✓" in the panel). This design adds three things and
moves nothing.

## What I cut (and why)
- **A separate "Edit look" screen or mode.** The stage *is* the editor. A mode would hide the bot behind a form.
- **A Save / Cancel bar for looks.** Looks save at once today, and that feels good. **↺ Undo look** covers the
  "oops" without adding a step to every change.
- **Locks on the dice ("keep the hat, shuffle the rest").** Clever, not clear. Roll, then fix one slot with
  the tray. Add later only if people ask.
- **A multi-step undo history.** One restore point (the look when you opened the agent) is enough to undo a
  play session. Step-by-step undo is a second thing to learn.
- **Part names under every thumbnail at all times.** The bot shows the part; the name shows on focus / hover
  and in the tray's title line. (Colour swatches are the exception: they always carry the name, because a
  colour has no shape to read.)
- **"Improve with Tinker" for crew.** The director, setter and Tinker have jobs the studio depends on; their
  prompts are not for chat edits. They keep the rig and the tray.

## 1. Parts tray — pick with a live try-on

### Opening it
The slot tag (`Hat: Beret`) becomes a button. Tap the tag, or focus it and press Enter / Space.
Arrows still step as before. The tag is the "see them all" door; the arrows are the quick nudge.

```
          ‹  [ bot ]  ›  Hat: Beret ▾        ← the tag, now a button (▾ shows it opens)
```

- Tag style: today's tag + a 1 px `--glass-line` pill border on hover/focus and a small `▾`.
- Tag name: "Hat: Beret — show all hats".

### The tray
A popover on the stage, beside the bot on the tag's side, top edge level with the row (clamped inside the
stage). It never covers the bot or the panel.

```
┌──────────────────────────────────────┐
│ Hat · Beret                       ✕  │  ← title: slot · the option in focus
├──────────────────────────────────────┤
│ [bot][bot][bot][bot][bot]            │  ← mini-bots, 5 per row
│ [bot][bot][bot][bot][bot]            │     current one: sun ring + ✓
│ [bot][bot][bot][bot][bot]            │
│ [bot][bot][bot][bot][bot]            │
└──────────────────────────────────────┘
```

- **Thumbnails** (hat, tool, body, antenna, face): the agent's own bot wearing that option, `hero()` at
  **56 px**, `facing: 'front'`, `props: true` for tool. Cell 64 × 64, radius 14, background
  `rgba(255,246,233,.06)`. Body thumbnails show the whole bot; the others show it too (one rule; the part
  you're choosing is the only thing that changes between cells, so it reads at once).
  - "None" options (`No hat`, `Empty hands`, `Plain`, `Classic`) come first, as today's option order.
- **Colour:** 7 round swatches, 40 px, in one row, the colour name under each (`Amber, Coral, Teal, Sky, Grape,
  Mint, Rose`, 11.5 px, `--cream-72`). Swatch = the hue with a 2 px `#241a44` ink ring, like the bots.
- **Current option:** 2 px `--sun` ring + a small ✓ badge top-right (sun disc, ink tick).
- **Focus / hover:** cell lifts (`translateY(-2px)`), background `rgba(255,246,233,.12)`, focus ring 3 px
  `--sun` (same as every Cast focus ring).
- Tray: `--glass` panel, 1 px `--glass-line`, radius 18, padding 12, width 5 × 64 + 4 × 8 + 24 = **376 px**
  (colour: auto). Max height = stage height − 32, scrolls inside.
- At **≤ 640 px** the tray is a bottom sheet over the panel area (full width, 6 cells per row at 52 px).

### Live try-on
- Hover or keyboard focus on a cell → the **big bot wears it** right away (crossfade 120 ms, the same
  `lk-out` crossfade as an arrow, shorter). Nothing is saved.
- Moving off all cells (or closing) → the bot goes back to the current look.
- The title line follows: `Hat · Captain's cap`.
- Touch has no hover: a tap picks.

### Picking
- Click / Enter / Space on a cell → that option is chosen: saved (existing debounce), tray closes, focus goes
  back to the tag, the row flashes (`flash`), the bot does one small **hop**, `announce("Hat: Captain's cap")`.
- Picking the current option just closes the tray.

### Closing without picking
- ✕, Esc, a click outside, or Tab past the last cell → closes, look goes back, focus returns to the tag.
- **Esc must not close the zoom** when it closes the tray (`preventDefault`; HeroZoom already skips a
  prevented Esc).

### Keyboard
- The tray is a `role="listbox"` with `aria-label="Hats"`; cells are `role="option"` with `aria-selected`
  on the current one. Roving tabindex: ← → ↑ ↓ move, Home / End jump, focus opens on the current option.
- Each option's name: the part name ("Captain's cap"), plus ", current" on the current one.

### Motion
- Open: scale from .92 at the tag's side + fade, 160 ms `--ease-out`. Close: 120 ms fade.
- Cells: on hover a tiny squash-and-stretch on the mini-bot (`scaleY .96 → 1.04 → 1`, 220 ms). One beat,
  not a loop.
- Reduced motion: no scale, no squash, no hop; the bot swaps without a crossfade.

## 2. Randomize (the dice) — unchanged, plus a way back
The dice stays where it is (above the antenna row) and does what it does: a new random hat, tool, body,
antenna, face and colour, a poof, a crossfade, saved.

### ↺ Undo look
- **When:** the agent's look differs from the look they had when you opened them (any arrow, tray pick or
  dice). Stepping to another agent with ‹ › / `[` `]` sets a new starting point.
- **Where:** a small pill right under the dice, same column.
- **Looks:** `.zp-chip` style (sun text on 10% sun, sun border at 30%), 12 px, `↺ Undo look`.
- **Name:** "Undo look changes — back to how {name} looked when you opened them".
- **Tap:** saves the opening look back (one save), bot crossfades + hop, pill fades out,
  `announce("{name}'s look is back")`, focus moves to the dice.
- Appears with a 160 ms fade; reduced motion: no fade.

```
            (🎲)
          ↺ Undo look          ← only after a change
      ‹  [ bot ]  ›  Antenna: Spring
```

## 3. Improve with Tinker (an existing agent)

### The door
In the agent's panel, top row (`zp-top`), next to the `AGENT` kicker: **✦ Improve with Tinker** (a
`.zp-chip`, sun). Regular agents only; not for crew, not on a new blank agent (that one keeps its
"Manual / With Tinker" choice).

```
AGENT                          ✦ Improve with Tinker   Saved ✓
Blair
Studio Design
```

If Tinker already has unsaved changes for this agent, the chip says **✦ Tinker's changes (waiting)** and opens
that chat.

### The improve stage (`#cast/agent/:id/tinker`)
Same layout as designing a new agent with Tinker (stage left, chat right, Chat / Details tabs). The
differences:

| | New agent | Improve |
|---|---|---|
| Title (sr-only) | New agent: design with Tinker | Improve Blair with Tinker |
| Tinker's first line | Hi, I'm Tinker. Who do you need? | What should Blair get better at — or wear? |
| Stage at start | ghost bot until the first draft | Blair as she is now |
| Corner of the stage | — | **Before**: Blair as saved, 72 px, bottom-left, 60% opacity, label "Before" |
| Main button | Add to the Cast | **Save changes** |
| Foot link | Discard draft | **Discard changes** |
| Back button | ← Cast | ← Blair |

- **Save changes** is disabled until the draft differs from the saved agent (title: "No changes yet").
- The look rig, tray and dice work here too (they edit the draft, not the agent). They hide while Tinker is
  thinking, as now.
- What Tinker changed is tinted and the changed look rows flash, as now.
- **Save:** sparkle + celebrate pose, "Saved ✓", then back to Blair's zoom (`#cast/agent/:id`). Teams,
  projects and access are untouched.
- **Busy agent:** under the button, one line: "Blair keeps working; the new version starts with their next
  task." Save still works.
- **Discard changes:** asks once inline ("Discard Tinker's changes? Discard / Keep"), then back to Blair,
  untouched.
- **Leaving** (← Blair, Esc) keeps the chat. Blair's lineup slot gets a **sun dot** (8 px, top-right of the
  nameplate, title "Tinker has changes waiting").

### Errors
- Tinker can't answer → the chat's existing error line, your text back in the box.
- Save fails (name taken, check failed) → the button says **Try again**, the reason in one line under it
  (`tk-err`), focus stays on the button.
- The agent was deleted meanwhile → the chat closes, back to the Cast, toast "Blair was deleted".

## Voice path
- "Tinker, give Blair a beret" / "Improve Blair" / "Change Blair's look" → opens Blair's improve stage with
  the sentence as the first message.
- "Shuffle Blair's look" → opens Blair's zoom and rolls the dice once (Undo look shows, so it's safe).

## Accessibility checklist
- Every new control is a real `button` / `listbox` with a name; focus is always visible (3 px sun).
- Esc closes the innermost thing only (tray → zoom).
- Each change is announced once (`announce`), the same way arrows and dice are now.
- Contrast: sun `#ffc24b` on the dark stage and `#4a2600` on sun both pass AA (existing pairs).
- Reduced motion: no scale, squash, hop or crossfade; state changes stay visible.

## Build notes
- `LookTray` takes `{ slot, look, onTry(look | null), onPick(look), onClose() }` and knows nothing about
  saving. HeroZoom and TinkerZoom own the look and the saving.
- Thumbnails are `hero()` strings; build them when the tray opens (≤ 24 per tray), not on every render.
- Keep `cycleLook`'s hat → decal rule in `trayOptions` (one helper, used by both).
- The big bot's `heroKey` must include `trying` so the try-on crossfades.
- Do not add new parts or colours in this update; the tray reads `LOOK_SLOTS` as it is.
