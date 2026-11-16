# Invite another — design

By Blair (Studio Design). States preview: [`states.html`](states.html) (open it in a browser).
Feature: *Invite Multiple Cast Agents of Same Type*: "invite several agents of the same kind, rename them or
fully randomize their look, but keep their prompt identical."

## User goal
"I need two designers on this. Give me another Blair." Then, in the office: "Which one is Blair and which one is
the new one?" One quick step to make the copy, and copies that are easy to tell apart at a glance.

**Feeling:** *a new sibling arrives.* It's the same family, but its own person. Copies should look related and
still be clearly different.

## The one idea: same kit, new identity
The bot already splits into two halves (see the header of `hero-svg.ts`):

| Half | Slots | For a copy |
|---|---|---|
| **Kit** (what they do) | hat, tool, decal (+ its badge) | **kept**, so you can see they're the same kind |
| **Identity** (who they are) | colour, antenna, face, body | **re-rolled**, so you can tell them apart |

This is the **family look**, and every copy gets it by default. At office size the colour is what tells copies
apart: it's the biggest flat shape on the bot, and it also paints the desk plate (`.d-acc`). The antenna gives a
second silhouette cue. The shared hat and tool show that they're kin. **No new slot or part is needed.**

### Family look rule (for the builders)
`randomLook()` with `hat`, `tool` and `decal` pinned to the original's values, then:
1. **Colour:** one of the 7 hues not worn by any kin (the original or any other copy). If all 7 are taken, use any
   hue except the original's.
2. **Antenna:** different from the original's.
3. **Face and body:** re-rolled as `randomLook` already does (they may match the original by chance, which is fine).

"Kin" = every Cast agent that shares this prompt (see *Instructions* below).

## What I cut (and why)
- **A multi-step wizard** (pick kind → name → look → confirm). It's one card: the new bot, its name, a dice.
- **"Copy 2", "Blair (2)" as the default name.** It's hard to say out loud, and the studio is voice-first. "Bea, take the
  empty states" works, but "Blair two, take…" doesn't. A number is only the fallback (see *Names*).
- **A choice between "Same look / Family look / Random look".** Family look is the default, the dice is "random", and
  **↺ Family look** brings it back. Same look needs no button (see *Same-look warning*).
- **Editing the role, tools or prompt while inviting.** That's the whole point of a copy. Change them afterwards
  with Improve with Tinker, which changes them for all kin.
- **"Make independent" (split the instructions off from the kin).** Leave it until someone asks.
- **A number badge or name ribbon on the bot.** That would be a new slot. Copies are already told apart
  without it. Noted below as a possible HQ idea, not part of this design.
- **Copies of crew** (director, setter, Tinker). They have one job each. They don't get the door, just as they don't get Improve.

## 1. The doors
Both doors open the same **invite card** (§2).

### a. Cast: the agent's zoom panel
Top row (`zp-top`), next to **✦ Improve with Tinker**: **＋ Invite another** (`.zp-chip`, same sun style).
Regular agents only.

```
AGENT                 ＋ Invite another   ✦ Improve with Tinker   Saved ✓
Blair
Studio Design
```
Name: "Invite another agent like Blair". The card ends with **Add Bea to the Cast**.

### b. Office: the bell (Bring someone in)
Today, agents who are already in the office drop out of the "Who" grid. With this change they **stay in the grid** with
a small `Here` tag (11 px, `--ink-soft`). Their card gets a **＋ Another** button instead of being a radio choice.

```
Who
[ bot ]  [ bot ]  [ bot ]
 Ada      Blair    Moss
 UX       Here     Research
          ＋ Another
```
- Tap **＋ Another**. The grid folds away (160 ms) and the invite card takes its place at the top of the form.
  The brief and the "Director may give them work" switch stay below as they are now, and the button
  reads **Bring Bea in**.
- **＋ Another** works on agents who aren't here yet too (on hover/focus, in the card's corner). Most of the time,
  though, it matters for the ones who are already here.
- "Everyone in the Cast is already here" stops being a dead end. The line becomes
  "Everyone's here. Need another pair of hands? Pick someone and tap ＋ Another." and the grid stays.

## 2. The invite card
One card for both doors: a stage strip, a name and one button. Glass panel like the look tray, radius 18.

```
┌──────────────────────────────────────────────┐
│  (Blair)          [ NEW BOT ]       (🎲)     │  ← Blair small + faded; the new bot big; dice
│  Blair                               ↺ Family look   (after a roll)
│                                              │
│  Name  [ Bea              ] (🎲)             │  ← suggested, editable; small dice re-suggests
│  Same role and instructions as Blair.        │
│                                              │
│               [ Add Bea to the Cast ]        │
└──────────────────────────────────────────────┘
```

- **The original** (bottom-left): `hero()` 72 px, `facing: 'three-quarter'` turned toward the new bot, 60%
  opacity, name under it. It's the same "Before" corner as the Tinker improve stage, used again. It tells you
  *who this is a copy of* without a sentence.
- **The new bot**: 160 px, `facing: 'front'`, pose `idle`, already in the family look when the card opens. It enters with
  a **poof** (the dice's existing poof) and one **hop**, like being born.
- **Look dice** (top-right, the same 🎲 button as the look editor): a fully random look (`randomLook()`, nothing
  pinned). Crossfade + poof, the same as the editor.
- **↺ Family look** (`.zp-chip`, under the dice, only after a roll): brings back the family look the card opened
  with. Name: "Back to the family look".
- **Fine-tuning a single slot is not done here.** After it's added, the copy opens in the Cast zoom like any agent
  (arrows, tray, dice). One place for detail, one card for speed.
- **Name field** (`ui` TextField, label "Name"): pre-filled with a suggestion, all text selected on open so typing
  replaces it. The small dice beside it suggests another name (name: "Suggest another name"). Changing the name
  never changes the look, and the reverse holds too.
- **Line under the name** (`--ink-soft`, 13 px): "Same role and instructions as Blair." With other kin:
  "Same role and instructions as Blair and Pip." With 3+: "…as Blair and 2 others."
- **Button:** "Add {name} to the Cast" (Cast door) / "Bring {name} in" (office door, after the brief). Disabled with
  an empty name.
- **Errors:** name taken → the field shows "There's already a Bea in the Cast." under it (`bi-err` style), focus
  stays in the field, and the name dice is the quick fix. Save fails → the button says **Try again**, the reason in one line.

### Names
- The suggestion is a **short, sayable name that starts with the same letter as the original** (Blair → Bea, Bix,
  Bo…). It sounds like family, it's easy to say aloud, and it's easy to tell apart in a list.
- The name must not be in use in the Cast, and should not be the same as a kin's name. If the letter runs out,
  use any free name from the pool. If the whole pool is taken, use `{Name} 2`, `{Name} 3`…
- Pool (invented, short, no famous characters; 2–3 per letter):

  Ada · Alba · Bea · Bix · Bo · Cleo · Cub · Dot · Dex · Echo · Elm · Fen · Fig · Gus · Gem · Hal · Hazel · Ivo · Iris ·
  Jun · Juno · Kit · Kip · Lark · Lou · Moss · Mabel · Nell · Nico · Ollie · Opal · Pip · Pia · Quill · Remy · Rue · Sol ·
  Suki · Tam · Tilly · Uma · Uno · Vik · Vida · Wren · Wim · Xan · Yuki · Yara · Zed · Zia

  (Cast names already in use are skipped automatically.)

### Motion
- Card opens: scale .92 → 1 + fade, 160 ms `--ease-out` (same as the tray).
- New bot: poof + hop on open, crossfade + poof on each dice roll, hop on ↺ Family look.
- The faded original does one small **wave** when the card opens: an old sibling greeting a new one. One beat, no loop.
- Reduced motion: no poof, hop, wave or crossfade. The look just swaps.

## 3. Telling copies apart
### In the office (small bots, the hardest case)
1. **Colour first.** The family look guarantees a different colour for up to 7 kin. The desk plate takes the colour too,
   so even a seated, half-hidden bot has a colour patch you can read.
2. **Antenna second.** It's a different silhouette on top of the head. It reads even when two kin pass each other in the room.
3. **Same kit.** The matching hat and tool show they're the same kind at a glance. Everything is working as intended.
4. **Names on demand.** The hover card and aria label show the agent's own name. The meta line adds the kin:
   `Bea · Studio Design · like Blair` (the first-made kin who's still in the Cast). The aria label follows: "Bea, Studio Design,
   like Blair, UX team — writing".

### Same-look warning
If the user picks or rolls a look that's identical to a kin's look (all 6 slots), the card shows one line under the
bot: **"Looks just like Blair. Hard to tell apart in the office."** next to a **Change colour** chip, which
applies the next free hue. It doesn't block anything. If they really want twins, they can have them.
The same line shows in the Cast zoom if someone later dresses a copy back into a kin's exact look.

### In the Cast lineup
- Kin **stand side by side**, the first-made on the left and copies in the order they were made.
- They share **one floor shadow** (one long ellipse under the group instead of one each), a quiet "these belong
  together" with no label. Mary Blair would group shapes, not draw boxes.
- Each keeps their own nameplate and name.

### In the zoom panel
Under the role, a **Kin** row: the other kin as 28 px mini-bots (front-facing), each a button that opens that agent
(name: "Open Bea"). The row hides when there are no kin.

```
Bea
Studio Design
Kin  (Blair) (Pip)
```

## 4. Instructions stay identical
- All kin share **one** set of instructions (role, prompt, tools). Each has their own name, look, teams, projects,
  memory and to-dos.
- **Improve with Tinker** on any kin changes all of them. The improve stage shows it:
  - the button reads **Save for all 3** (or "Save changes" when there's no kin),
  - one line under it: "Blair, Bea and Pip share these instructions."
  - Look changes made in that chat apply **only to the agent you opened** (the look is personal). The line says so
    when the draft changes the look: "The new look is just for Bea."
- **Deleting** a kin never touches the others. Nobody is "the master copy". If Blair is deleted, "like Blair" becomes
  "like Bea" (the next-oldest).

> For Pixel / the Founders: I designed "one shared set of instructions" because the feature says *keep their
> prompt identical*. If the build stores a copy per agent instead, the UI stays the same, but Save must write
> to every kin, and §4's lines must stay true.

## Voice path
- "Bring in another Blair" (in an office) → opens the bell with the invite card ready for Blair. "Call her Bea" fills
  the name, "Shuffle her look" rolls the dice, and then the brief comes as usual.
- "Invite another Blair" (in the Cast) → opens Blair's zoom with the invite card open.
- "Two more Blairs" → makes two cards one after the other. Each gets the next free colour and name.

## Accessibility checklist
- The invite card is a dialog (`aria-labelledby` = "Invite another agent like Blair"), focus starts in the name field,
  Esc closes only the card, and focus goes back to the door.
- Both dice are real buttons with names. Each roll is announced once: `announce("New look: Teal, Spring antenna")`,
  `announce("Name: Bix")`.
- Identity never relies on colour alone. The antenna shape, the name and the "like Blair" line also carry it, for
  colour-blind users and screen readers.
- Contrast: same pairs as the look editor (sun on the dark stage, `#4a2600` on sun), all AA.

## Build notes
- **No new parts, slots or colours.** The family look is `randomLook()` with three pins and a hue rule.
- The invite card is one component taking `{ original, kin, onDone(agent) }`. It doesn't know which door opened it.
  The office door adds its brief form below; the Cast door doesn't.
- Before showing the card, check that the suggested name is free.
- The kin floor shadow is one ellipse spanning the group. Use the existing floor-shadow fill.

## Idea for HQ later (not in this design)
A tiny **name ribbon** (a new optional slot, a short pennant on the antenna carrying an initial) would let
identical twins be told apart. Story: *the studio ties a ribbon on every newcomer so the others can find them on
the first day.* It's only worth proposing if people really keep identical looks. Agents look complete without it.
