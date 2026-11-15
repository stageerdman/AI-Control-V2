# UX spec — the office, STUDIO LIFE (L7)

One idea: **everything new is a thing in the room.** A note is paper on a desk, principles are a binder on the
captain's desk, mail is a letterbox by the door, a guest rings the doorbell. Every one opens a `Sheet` (like the
safe, the clock and the portrait) — no new zoom layers, routes, panels or top-bar buttons. Copy stays short;
details appear on hover/click only.

## 0. Shared plumbing
- `layout.ts` `ObjectId` += `'mailbox' | 'bell'`. Both sit in the free wall above/beside the ship corner, so `W`
  and every existing coordinate stay as they are (layout tests only gain cases):
  - `mailbox: { x: 190, y: 128, w: 72, h: 96, label: 'Mail' }` — wall-mounted above the outbox (ends at 262; the
    portrait starts at ≥ 288). No `stand`: nobody walks to it.
  - `bell: { x: 164, y: 216, w: 30, h: 48, label: 'Bring someone in' }` — on the door frame's right side. Art is an
    18×26 brass plate with a round `--sun` button, centred in the box; hit area grows with
    `.o-hot[data-obj="bell"]::before{content:"";position:absolute;inset:-8px}`.
- `OfficePage.tsx` `HOTS` += `{ id: 'mailbox', label: 'Mail — letters from other projects' }`,
  `{ id: 'bell', label: 'Bring someone in' }`; `act()` opens `MailSheet` / `BringInSheet`.
- Desk-level hotspots (note, binder) are the same `.o-hot` buttons with `data-obj="note:<agentId>"` /
  `"binder:<teamId>"`, positioned from `plan.seats` × `depth()` and portalled into `world` with the others.
  Roving keys: `note:<id>` right after its robot, `binder:<team>` right after the captain. Padded hit area:
  `.o-hot.o-deskhot::before{inset:-6px}`.
- `theme.ts`: `DeskOpts.item` += `'binder' | 'tent'`; `DeskState.tray` = `null | 'note' | 'new'` (the existing,
  unused `.d-tray` paper is the desk note); `BoardFacts` += `newMail: number`; `officeArt` ctx += `hq: boolean`.
- New sheets (one file each, in `features/office/`): `DeskNoteSheet`, `PrinciplesSheet`, `MailSheet`,
  `BringInSheet`. Lists reuse the reports row classes (`rp-rows`, `rp-row`, `rp-r1`, `rp-dot`, `rp-title`,
  `rp-when`, `rp-by`, `rp-sum`, `rp-chev`, `rp-ph`, `rp-empty`, `rp-error`) and `ob-back`; markdown is `Markdown`
  from `features/reports`; times are `relWhen`; faces are `Portrait`/`AuthorLine` from `reports/parts`.
- Reduced motion: add `.o-actor.r-reset .hero, .o-desk .d-tray.drop` to the existing reduced-motion list.

## 1. Desk notes (willing forget)
**On the desk.** One sheet of paper (`.d-tray`) on the robot's desk while it has ≥ 1 note in this project —
one sheet however many notes; no count on the desk. `tray: 'new'` (two soft glows, the existing `o-tray`) until
the user opens that robot's notes. Hotspot hover label (`.o-hot-l`): `Note to self`.
aria-label: `Pixel's notes to self — 3` (+ `, 1 new`).

**The moment** (`desk.note {agentId, noteId, runId}` → `engine.forgot(id)`, ≈ 2 s, robot stays seated):
1. pose `writing` 600 ms; 2. the paper drops onto the desk (`.d-tray.drop`: `translateY(-10px)→0`, 300 ms) and
glows; 3. a reset blink: monitor glyph → `off` for 400 ms, the robot gets `.r-reset` (`filter:brightness(1.5)`
+ `scaleY(.97)` and back, 500 ms) — a reboot, not a faint; 4. back to its working pose. No bubble, no chip, no
chat line. Skip steps 1–3 if the robot is walking or held (paper just appears). Reduced motion: paper appears,
glyph flip only. Polite region: `Pixel left a note to self and started fresh.`
Hover card (`.o-cact`) right after, until the next status: `↺ Fresh start — reading my note`.

**The sheet** — `DeskNoteSheet`, `label="{nick}'s notes to self"`:
- `<h2>Note to self</h2>`, `.dn-by` `{nick} · {relWhen}`.
- `<dl class="dn-note">`: `Where I am` / `What I'm doing` / `Next step` → plain text (`white-space:pre-line`).
- `Earlier (n)` (`h3.dn-h`) then `rp-rows`: `rp-title` = the note's `Next step` clipped to 60, `rp-when`. A row
  swaps the view; `ob-back` reads `Latest note`. Newest 20; nothing older shown.
- Opening marks this robot's notes seen (the desk stops glowing). Loading `Reading the note…`; error
  `Couldn't read the note.` + `Try again`. Read-only: no edit, delete or "make it forget" button.

## 2. Team principles
**On the desk.** The captain's desk item (left slot, where the mug/plant goes) becomes `binder`: two upright
binders, the front one with a team-hue spine. Every team has one (even empty — it invites); solo and director
desks don't. No captain → the team's first seat. Hover label: `Principles`. aria-label:
`{Team} principles — 4 files, kept by Pixel` / `{Team} principles — none yet`.

**The sheet** — `PrinciplesSheet`, `label="{Team} principles"`:
- `<h2>` team emblem (16) + `{Team} principles`; `.hint` `Kept by {captain}. The team reads these first.`
- Files as `rp-rows`: `rp-title` = first `# heading` (else the file name, `-`→space, no `.md`), `rp-when` =
  updated, `rp-sum` = first paragraph clipped to 90. Sorted by file name (the captain orders with `01-` prefixes).
- Read: `ob-back` `All principles`, `<Markdown source>`, `.rp-meta` `principles/{team}/{file} · {relWhen}`.
- Empty (`rp-empty`): `No principles yet. {Captain} writes them down as the team learns what works.`
- Footer, one ghost button: `Talk to {captain}` → closes the sheet, opens the captain's thread with context
  `{ title: '{Team} principles' }` (the voice path: "add a rule that…"). Hidden when there's no captain.
- `principles.changed {teamId}` refetches silently — no glow, no line. The user doesn't edit files here.

## 3. Mailbox (+ HQ)
**On the wall.** A rounded steel letterbox (`OT.metal`) with an `OT_INK` slot. Unread = envelopes peeking out
of the slot (`#mailSlot`, 0–3 like the tray's `_otSheets`; the top one has a coral seal). That is the badge — no
number on the art, no flag (the outbox already owns the flag). Hover label: `Mail` / `Mail · 2 new`. aria-label:
`Mail — letters from other projects` (+ ` — 2 new`). In the HQ office only: a small cream plaque under the slot,
`HQ` (900 weight, `--ink`); sheet label `HQ mail`. Nothing else changes for HQ.

**Triage, no new UI.** On office open with new mail the director's run is `mail-triage`: his hover card says
`✉ Reading the mail`, pose `thinking`; he does not walk. Each `mail.triaged {mailId, outcome}` takes one envelope
out of the slot (`syncFacts`). Outcomes:
- `board` → a goal appears on the whiteboard like any goal; its row's `title` = `From {project}'s mail`.
- `discuss` → a director chat line: `{project} wrote: "{subject}". {one-line why}. Shall we take it on?`
- `file` → nothing.
When done, one line only if ≥ 1 letter: `I read the mail — 1 on the board, 1 to talk about, 2 filed.` (drop zero
parts). The panel never pops open; the chat's existing unread behaviour carries it.

**The sheet** — `MailSheet`, `label="Mail"`:
- `rp-rows`, `new` first then newest. `rp-r1`: `rp-dot` if new, `rp-title` = subject, `rp-when`. `rp-by`:
  `LogoTile` 16 + `{project} · {agent nick}` (`HQ` for the studio). `.ml-meta`: kind tag only when not plain mail
  (`Ticket`, `Idea` — `Chip`), then status text: `New` · `On the board` · `Discussed` · `Filed`.
- `Sent (n)` at the bottom swaps to this project's outgoing letters (rows read `To {project}`) — the same
  pattern as `Archived (n)`; `ob-back` `Mail`.
- Read: `ob-back` `Mail`, `<h2>` subject, `.rp-meta` `From {nick} in {project} · {relWhen}`, `<Markdown>` body,
  `.ml-status`: `New — {director} reads it while you're here.` / `On the board — {goal}` (the goal name is a
  link → closes the sheet, `goSub('board')`) / `Discussed with you` / `Filed by {director}`.
- One button: `Talk about it` → closes, director thread with context `{ title: subject, mailId }`
  (`FollowUpContext` += `mailId`, like reports' follow-up).
- Empty: `No mail yet. When another project writes to {name}, it lands here.` HQ: `No mail yet. When an agent
  has an idea for AI Studio, it lands here.` Loading: three `rp-ph` rows. Error: `Couldn't load the mail.` +
  `Try again`. The user doesn't change status or compose here (agents send; the director triages).

## 4. Bring someone in
**Where.** The doorbell (people come in through the door; the door itself still means "leave"). Click → the bell
plate gets `o-wiggle` once (art, so reduced motion already drops it) and `BringInSheet` opens.

**The sheet** — `BringInSheet`, `label="Bring someone in"`:
- `Here now` (`h3`, only if guests): one row each — `Portrait` + nick, brief clipped to one line (full in
  `title`), `.hint` `Director may give them work` only when on; ghost small button `Send home` → inline confirm
  in the row: `Send {nick} home? What they made stays.` [`Send home`] [`Keep`].
- `<h2>Bring someone in</h2>`, then:
  - `Who` — `role="radiogroup"`, `.bi-pick` grid of Cast agents not in this project (`Portrait` 40, nick, role).
    Arrow keys move, Space picks. Empty: `Everyone in the Cast is already here.`
  - `TextArea` `Their brief`, placeholder `Analyze the team's communication and report to HQ`, required.
  - `Switch` `Director may give them work`, default off, hint (`describedBy`): off `They work only on your brief.`
    / on `{director} can plan work with them too.`
  - Primary `Bring {nick} in` (disabled until who + brief; before a pick: `Bring them in`). Busy
    `Calling {nick}…`. Error inline: server message, else `Couldn't bring {nick} in.`
- Voice path: telling the director "Bring in Ada: analyze…" does the same (switch stays off unless said); he
  confirms `Ada is on the way.`

**Arrival** (`guest.joined {agentId, brief, orchestratorMay}`). Guests are a solo block in the layout
(`LayoutConfig.guests`) on hot desks (`kind: 'hot'`, item `tent` — a small folded sun card, no text). The office
re-lays out the way a staffing change does; then the door opens (`setDoor`), the guest appears at the door
`stand`, walks to the desk, the door closes, `waving` 900 ms, then the brief's pose. Reduced motion: appears
seated with a 150 ms fade. Polite: `Ada came in to help.`
Hover card: `.o-cmeta` `{role} · Guest`; new line `.o-cbrief` `"{brief, clipped 80}"`. aria-label gains
`, guest — brief: {brief}`. Clicking a guest opens their chat like anyone's.

**Leaving** (`Send home` → `guest.left`): the robot stands, walks to the door, the door opens and closes, the desk
goes with the next layout. Mid-task: they stop first (no extra copy). Reduced motion: fade out. Polite:
`Ada went home.`

## Do NOT add
- Counts or badges on desks or binders; a second dot on the mailbox; a "new mail" toast, sound or auto-opened chat.
- A notes/principles/mail/guests panel, tab, route or zoom layer; studio-wide duplicates of any of them.
- Editing notes or principles in the UI; composing mail; changing mail status by hand.
- A "Forget now" button, context meters or token counts on robots; words in bubbles.
- Name badges, lanyards or anything human on guests; a guest legend; a "Bring in" button outside the bell.
- New fonts, colours or sizes — everything uses the palette, `--ui`/`--u` units and the reports row styles.
