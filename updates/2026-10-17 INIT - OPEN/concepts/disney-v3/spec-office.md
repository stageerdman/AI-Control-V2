# Spec — The Office (project workspace, Disney v3 §C)

Build contract for the v3 project workspace. Replaces the v2 chat-first layout
(Director hero + Set rail) with a **living office scene** and a **chat side panel**.
Source of truth for intent: `user-feedback-v3.md` (verbatim). Characters come from
`spec-cast.md` (`hero()`), team identity from `spec-teams.md` (`emblem()`).
Deliverable stays one self-contained local `.html` (no external resources, no Artifacts).

---

## 0. North star

**You are looking through the glass into your studio's office.** Everyone you
hired is in there. You can tell who's busy, who's on a break, who's asleep, who's
talking to whom, and who needs you — without reading a single line of text. Text
is there when you want it (tags, bubbles, the panel), never required to get the gist.

Three rules keep it calm instead of busy:
1. **One glance token per agent.** Pose + prop + a ≤4-word floating tag. Nothing else
   floats above them except the "!" (the only thing allowed to shout).
2. **The office is the state; the panel is the conversation.** No data panels on the
   scene. Numbers live on the whiteboard (one click) and in the panel header.
3. **Every animation means something real.** If an agent moves, a real agent did
   something (read, wrote, tested, handed off). No idle "screensaver" wandering —
   ambience is limited to breathing, steam, plants, and a ticking clock.

---

## 1. Scene composition

### 1.1 Camera — front-facing 2.5D "dollhouse cutaway"

A fixed, straight-on camera looking into a room with the front wall removed:
one back wall, a floor that recedes slightly upward, no side walls (a hint of the
left wall with the door). Depth is faked by **y-position = depth**: things lower on
screen are nearer, drawn later, and slightly bigger.

Why this over isometric / top-down:
- **Faces are the product.** Agents must be readable and must be able to **turn and
  look at you**. Top-down hides faces; isometric puts everyone at the same 3/4 angle
  so "looking at the viewer" has no contrast. Front-facing gives three clear facings:
  side (walking/handing off), three-quarter (working at a screen), front (talking to you).
- **Trivially buildable.** No projection math. One SVG `viewBox="0 0 1600 900"` for
  room art; actors are absolutely positioned DOM nodes using the same coordinate
  space (percent of the stage box). Depth scale is one linear function. Y-sort =
  `z-index = round(y)`.
- **Camera moves are just CSS.** Zoom = `transform: translate() scale()` on one
  `.stage` wrapper. Whiteboard on the back wall is flat-on to the camera, so zooming
  into it yields a perfectly flat, readable board — no skew to undo.
- **Game reference**: Two Point Hospital cutaway framing, Animal Crossing's Resident
  Services interior, Pixar's "Inside Out" HQ console shot.

Depth scale for actors: `s(y) = 0.82 + 0.36 * (y - 380) / 520` (y in viewBox units,
floor spans y 380→900). Hero size: base `md` scaled by `s(y)` — see §9 request R1.

### 1.2 Zones (viewBox 1600 × 900)

```
x→ 0        200        400        600        800       1000       1200      1400   1600
y  ┌──────────────────────────── BACK WALL (y 0–380) ─────────────────────────────────┐
0  │ ┌────┐  ┌───────────────────────────┐ ┌──────┐   ○ clock      ┌───────────────┐   │
   │ │DOOR│  │       WHITEBOARD           │ │CHECK-│  (overall %)   │ DIRECTOR'S     │   │
   │ │    │  │  [progress] [checklist] 📎 │ │ UP   │   ┌─window─┐   │ CORNER OFFICE  │   │
   │ │ ⌂  │  │  marker scribbles   dossier│ │poster│   │ ☁  ☀  │   │ glass + blinds │   │
   │ │    │  │ x 250–760, y 60–300        │ │A B C │   └────────┘   │ x 1200–1560    │   │
200│ │    │  └───────────────────────────┘ └──────┘                 │ y 90–520       │   │
   │ └────┘ 🌿     🖨 PRINTER/MAIL CART (840,330)    📥 OUTBOX "main" │  Pixel @ desk  │   │
380├─────────────────────────────── FLOOR (y 380–900) ──────────────│ (1380,470)     │───┤
   │                                                               └───────────────┘   │
   │   ▓▓▓ POD A — team 1 (rug, pennant) ▓▓▓     ▓▓▓ POD B — team 2 ▓▓▓                 │
   │   desks x 140–620, y 470–560               desks x 680–1160, y 470–560             │
500│   [🖥][🖥][🖥][🖥]  4 seats                 [🖥][🖥][🖥][🖥]                         │
   │ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ WALK LANE y=640 ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │
   │   ☕ BREAK NOOK          ▓▓▓ POD C — team 3 ▓▓▓        HOT DESKS (solo)            │
700│   couch (x 60–360,       desks x 480–960, y 700–790    x 1040–1500, y 700–790      │
   │   y 720–840), coffee      [🖥][🖥][🖥][🖥]             [🖥][🖥]  + bin, fern        │
   │   machine, plant, rug                                                              │
900└────────────────────────────────────────────────────────────────────────────────────┘
```

| Zone | Anchor ids | Purpose |
|---|---|---|
| **Door** (back-left) | `door` (110, 360) | Agents **arrive** when launched, **leave** when their session ends. Door opens with a little light spill; a welcome mat. |
| **Whiteboard** (back wall) | `whiteboard` (505, 180), `wb-stand` (505, 400) | Click → zoom (§4). Director walks here to "write" when he updates the plan. Marker scribbles + a tiny progress ring are drawn on it at scene scale so it's alive from afar. |
| **Dossier clip** | `dossier` (725, 85) | A manila folder clipped by a big binder clip to the board's top-right corner. Bulges thicker as more features ship. Click → dossier (§4.3). |
| **Checkup poster** | `poster` (830, 170) | Framed "Health inspection" certificate with three grade stamps. Calm v2 essential (§5). |
| **Clock** | `clock` (960, 90) | Its hand is **overall project progress** (64% ≈ "almost 8 o'clock"). Label below: "64% → v1.0". |
| **Window** | (1040–1170, 120–260) | Ambient only: sky tint follows local time of day. Deploys send a paper plane out of it. |
| **Printer / mail cart** | `printer` (840, 330) | Handoff hub when the recipient is far or not yet seated: sender drops an envelope, it waits in the tray with a label. |
| **Outbox "main"** | `outbox` (1100, 340) | A wall mail slot labelled with the default branch. Commits/pushes = dropping a paper in. Its little flag pops up when GitHub has fresh pushes. |
| **Director's corner office** | `director` (1380, 470) | Glass-walled corner, nearest the chat panel (he "owns" the panel). Bigger desk, megaphone on a hook, a "big picture" corkboard with only 3 cards (altitude, not detail). Blinds are half-open. |
| **Team pods A/B/C** | `pod-A..C`, seats `pod-A-1..4` | One pod per team: a 4-desk row on a **team-colour rug**, a **pennant with `emblem(team,'sm')`** hanging above, a small paperwork pile per desk that grows with work done. |
| **Hot desks** | `hot-1..4` | Solo agents (called directly by Pixel, no team). Neutral rug. |
| **Break nook** | `couch-1..3`, `coffee` (330, 700), `plant` | Where **sleeping** (off-shift) agents go. Coffee machine is the idle hangout. |
| **Walk lane** | `lane` y=640, plus `lane-back` y=420 | All walking is Manhattan-style along lanes: desk → down to lane → across → up to target. Readable, never cuts through desks, trivial to implement. |

Desks: monitor angled three-quarter toward the agent, so the **screen is partly
visible** to the viewer and shows an **abstract activity glyph** (§2) — never real
text, never a terminal. Agent sits behind the desk; desk front occludes legs.

### 1.3 Scaling 4 → ~12 agents

- **Pods are allotted by team count**, in order A, B, C. 1 team → Pod A widens to the
  full back row (seats spread). 2 teams → A + B. 3 teams → A + B + C. Pods always have
  4 seats; a 5–6 member team takes a second pod row behind the first is **not** done —
  instead the pod gets 2 "perch" stools at its end (seats 5–6, smaller desks).
- **Solo agents** take hot desks (max 4). The Director is always present and never
  counts toward capacity.
- **Capacity**: 3 pods × 4 + 4 hot desks = 16 seats; designed to look good at 4–12.
  Under 4 agents: unused pods are simply not drawn (no empty desks staring back);
  the break nook and a fern fill the space.
- **Overflow (>16)**: the door gets a sign "+3 in the annex" (focusable); the list
  mirror (§8) shows everyone. Honest, not hidden.
- Sleeping agents leave their desk chair **pushed in with a jacket on it** and go to
  the couch (3 seats; a 4th+ sleeper uses a beanbag; past 5, beanbags stack — "the
  nap pile", which is funny and still countable via the list).

### 1.4 Layout & responsive

```
┌──────────────────────── TOP BAR (56px) ────────────────────────────────────────────┐
│ [logo] Aurora Storefront  ← All projects     64%→v1.0 ▬▬▬▬░  GitHub✓ 🔒Private      │
│                                              Test↗ aurora-preview…  🔑Access  🔔1    │
├──────────────────────── OFFICE STAGE (flex 1) ─────────────┬─ CHAT PANEL (380px) ───┤
│                                                             │ [portrait] Pixel       │
│      16:9 scene, letterboxed into available space,          │ your manager · altitude│
│      centered; warm dusk backdrop behind letterbox          │ ── waiting on you ──   │
│                                                             │ (!) Scarlett  [Answer] │
│                                                             │ ─────────────────────  │
│                                                             │ thread…                │
│                                          [▤ List] [⤢]       │ quick-reply chips      │
│                                                             │ (⦿ mic) Talk or type… ▶│
└─────────────────────────────────────────────────────────────┴────────────────────────┘
```

- `≥1200px`: stage + 380px panel side by side.
- `900–1199px`: panel 320px; stage scales down; floating tags shorten to icon + 2 words.
- `<900px`: panel becomes a **bottom drawer**. Collapsed state is a 64px bar: current
  speaker's xs portrait + "Talk to Pixel…" + mic (voice is always one press away).
  Clicking an agent slides the drawer to 60% height; drag/tap the grabber to expand
  or collapse. Stage takes full width.
- `<600px`: tags hide (only "!" and the zzz remain); a **List** toggle in the stage
  corner is promoted to a visible pill — the list mirror is the better phone view.
- `[⤢]` fullscreen-stage toggle hides the panel (it reappears when you click anyone).

---

## 2. Activity → behaviour

Every agent has exactly one `activity.kind` at a time. Each maps to a seat/spot,
a pose and facing from the cast system, an office prop/FX, the monitor glyph, and
a floating **status tag** (≤4 words, with a leading icon so it's never colour-only).
Tags show the specific target in the panel/bubble, the short form on the scene.

| Real agent activity | Where | Pose · facing | Prop / FX | Monitor glyph | Tag (example) |
|---|---|---|---|---|---|
| **Reading files / exploring** | own desk, or walks to filing cabinet beside pod for >3 files | `reading` · ¾ | Open binder; pages flip; for a search, a magnifier sweeps over a paper | Page with grey lines scrolling slowly | 📖 Reading checkout.ts |
| **Planning / thinking** | own desk | `thinking` (R2) · ¾ | Thought cloud with three dots; a sticky note appears on monitor edge when the plan lands | Blank w/ blinking caret | 💭 Planning approach |
| **Writing code** | own desk | `typing` · ¾ | Keyboard click puffs; paper pile on desk grows one sheet per finished file | Coloured code-bar lines appearing left→right | ⌨️ Writing PriceTag.tsx |
| **Committing / pushing** | walks to `outbox` | `carrying` · side | Drops a paper into the "main" slot; slot flag pops up | — | 📮 Pushed 3 commits |
| **Running tests** | own desk | `idle` leaning in · ¾ | A 3-light **test lamp** on the desk blinks; dots pop on screen | Row of dots filling ●●●○○ | 🧪 Running 48 tests |
| **Tests green** | own desk | `celebrating` (small: fist pump, 1s) · ¾ | Lamp solid green ✓; one gold star sticker on monitor | All dots ✓ | ✅ 48 passing |
| **Tests red** | own desk | `frustrated` (R3) · ¾ | Lamp red ✕; agent crumples a paper and tosses it at the bin (misses once in a while) | Two ✕ among dots | ❌ 2 failing — fixing |
| **Needs your input** | stands at desk | `needs-input` · ¾→front when hovered | **"!" badge** above head (§3.4); small bob; desk lamp off; chair turned out | Paused glyph ‖ | ❗ Needs you |
| **Waiting on another agent** | own desk | `idle` w/ finger-tap (R4) · ¾ toward the blocker's desk | Tiny hourglass on desk; a dotted thread line to the blocker's desk on hover only | Hourglass | ⏳ Waiting on Captain |
| **Handing off work / PR** | walks to recipient's desk (or printer if recipient away) | `carrying` · side | Manila envelope with a label `PR #41`; placed in recipient's in-tray; recipient's tray glows once | — | 📨 PR #41 → Scarlett |
| **Reviewing** | own desk with the envelope open | `writing` (red pen) · ¾ | Margin marks; ends with an **APPROVED** (mint) or **CHANGES** (sun) rubber stamp thunk | Two columns (diff) | 🔍 Reviewing PR #41 |
| **Talking / coordinating** | walks to the other's desk, stands beside | `talking` · side, facing each other | Alternating speech bubbles with real-ish snippets (below) | — | 💬 Syncing with Twinkle |
| **Deploying** | DevOps walks to the **launch console** (a small pedestal with a big round button by the window) | `pressing` (R5) · ¾ | Button press → paper plane flies out the window; Test chip in top bar gets a fresh live-dot | — | 🚀 Deploying preview |
| **Idle (session alive, no task)** | own desk, feet up, or at the coffee machine | `idle` + mug (R6) · ¾ | Steam from mug | Screensaver: slow bouncing team emblem | ☕ Free |
| **Sleeping (on roster, not running)** | couch / beanbag | `sleeping` · front | zzz bubbles; chair at desk pushed in with jacket | Monitor off | 💤 Off shift |
| **Done / shipped** | own desk → stands | `celebrating` · front | Local confetti burst (scoped), gold star on pennant | Big ✓ | 🎉 Shipped Voice search |
| **Arriving (launched)** | door → lane → seat | `walking` (R7) · side | Door opens, light spill; nameplate pops onto desk | Boots up with emblem | 👋 Just joined |
| **Leaving (session ended)** | seat → door | `walking` · side, waves at door | Desk lamp off; nameplate stays (they're still cast on the project) | Off | 👋 Clocked off |

**Idle vs sleeping is an honest distinction:** *idle* = session running, burning no
task tokens, available instantly. *Sleeping* = cast on this project but no running
session (0 tokens/min). Waking a sleeper means Pixel launches them — so clicking a
sleeper never wakes them by accident (§3.2).

**Communication.** Agent↔agent exchanges are real events (`WS.comms`), rendered as:
- **Walk-over + bubbles** for discussion (2–4 alternating bubbles, 1.6s each, ≤32 chars,
  plain font with code names in mono). Examples: "Is `<Card>` safe to reuse?" /
  "Yes — v2 props only." · "PR #41: /checkout + intents" · "2 fails in refund.test" ·
  "Stub for /search is up" · "Copy says 'bag', ok?".
- **Paper passing** for handoffs (envelope with label), never a bubble.
- **Shout-across** (no walking) for one-liners between neighbours in the same pod: a
  single bubble with a small arrow pointing at the recipient.
- Hover any bubble → it pauses and stays; click → opens the **sender's** thread with
  the full exchange quoted as a quiet system card ("Captain → Scarlett: …").
- Max **2 conversations visible at once**; extras queue. Prevents bubble soup.

---

## 3. Interactions

### 3.1 Hover / focus (any agent or object)

- Agent lifts 4px, gets a soft ground spotlight, and a **name card** appears above:
  `emblem(team,'xs')  Scarlett Scenario · QA · Ship-It Squad`. Solo → "Solo" chip.
- Objects (whiteboard, dossier, poster, clock, outbox, door, printer) get a warm
  outline glow and a one-word label ("Whiteboard", "Features", "Checkup").
- Cursor: pointer on everything interactive; nothing on the scene is decorative-and-clickable.

### 3.2 Click per state

One click on an **awake** agent does three things at once, so the user's two asks
("tell me what you're doing" and "chat with them") are one gesture:
1. The agent **turns to face you** (`facing:'front'`, 250ms head-first then body),
   stops their loop pose but keeps their prop (typing hands hover over keys).
2. A **summary bubble** pops above them for 4s: *"Wiring the voice bar into the
   header — about 70% there. I've spent **182k tokens** on Aurora."*
3. The **panel switches to their thread**; the same summary is posted as their
   newest message with a small stat row: `⌨️ Writing · 182k tokens · 9 tasks done`.

Per state variations:
- **Working (any)** → as above. Their animation pauses while they face you (they
  "stop to talk") and resumes when you leave the thread; honest note under their
  header: "Still working in the background."
- **Needs input "!"** → as above but the panel opens straight on their **ask card** (§3.4).
- **Idle** → turns, waves with mug; summary: "Free! Last thing I did: shipped the cart
  component." Panel thread opens with quick replies.
- **Sleeping** → **does not open chat.** A playful reaction instead, rotating through:
  rolls over and the zzz pops like a bubble; mumbles "five more minutes…"; pulls the
  blanket up; a cat-like stretch and back to sleep. A tiny bubble chip offers
  **"Chat anyway"** (the honest path: opens their thread with a note "Doc is off shift —
  Pixel can bring him in" and a quick reply **[Ask Pixel to wake Doc]**).
- **Walking / handing off** → they pause mid-walk, turn front, same summary; resume on leave.
- **Director (Pixel)** → camera does nothing; Pixel stands, faces front, tips his cap;
  panel switches to the main thread. Pixel is the **default** thread.

### 3.3 The chat side panel

```
┌──────────── PANEL (380px) ─────────────┐
│ ┌──────┐ Scarlett Scenario         ✕→P │  ✕→P = "Back to Pixel" pill (hidden on Pixel)
│ │front │ QA · [emblem] Ship-It Squad   │
│ │ md   │ ❗ Needs you · 96k tokens       │  live status line = the scene tag, long form
│ └──────┘ Pixel sees a summary of chats │  honesty line (roles carry context)
│─────────────────────────────────────── │
│ WAITING ON YOU  (!)Scarlett  (!)Twinkle│  only when pending>0; xs portraits, focusable
│─────────────────────────────────────── │
│ [quiet] Captain → Scarlett: PR #41…    │
│ [them]  I need the Stripe TEST key to  │
│         run the payment suite.         │
│ ┌ ASK CARD ─────────────────────────┐  │
│ │ [S] Stripe  sk_live_••••42  ( ◯ ) │  │  grant switch, masked value, never revealed
│ │ Blocking: Checkout · 48%           │  │
│ │              [Hand it over]        │  │
│ └────────────────────────────────────┘  │
│ chips: [What's left?] [Ask Pixel instead]│
│ ┌─────────────────────────────────────┐ │
│ │ (⦿)  Talk or type to Scarlett…   [▶]│ │
│ └─────────────────────────────────────┘ │
└────────────────────────────────────────┘
```

- **Header**: the agent rendered `hero(agent,{size:'md',pose:'talking',facing:'front'})`
  — the same "looking at you" pose they hold in the scene, so the panel and the
  scene agree. Name, role, team emblem, live status line, tokens on this project.
- **Threads**: one per agent, persisted for the session. Switching is by clicking an
  agent in the scene, a "!" in the waiting row, an avatar in a quoted comm card, or
  the **Back to Pixel** pill. No tab strip of every agent (cut — the office *is* the
  switcher). A tiny unread dot appears on the scene agent's name card when they
  posted in a thread you're not viewing.
- **Pixel thread** is the v2 Director chat verbatim (streaming replies, casting system
  bubbles, quick replies, ask-to-fix pre-fills). His system lines now also narrate
  office events in one quiet line each ("Voice search shipped 🎉", "Madame
  Mergeworthy joined to cut the release").
- **Agent threads are scoped**: the agent answers about *their* task only; for
  big-picture asks they redirect ("That's Pixel's call — want me to ask him?" + chip).
- **Quick replies** (max 3, context-aware): working → *What's left? · Show me what
  changed · Take a break*; idle → *What's next? · Help Pete*; Pixel → v2 chips.
  "Show me what changed" answers in plain words plus a file list (names, not diffs).
- **One-press voice** in every thread (v2 §3.3 flow unchanged). The mic label names
  the listener: "Press to talk to Scarlett". Saying a name first routes the thread:
  "Hey Captain, how's checkout?" while on Pixel → switches to Captain's thread, he
  turns to face you. Typed equivalent: `@Captain …` in the field, same effect.
- **Leaving a thread** (switching, Back to Pixel, or `Esc` from an empty composer):
  the agent nods, turns back to ¾, and resumes their loop.

### 3.4 The "!" flow, end to end

1. **Trigger.** Scarlett hits a blocker. She stops typing, stands, chair swivels out,
   and a **"!" badge** springs above her head (sun→coral round badge, white "!",
   2px ink outline, gentle 1.2s bob, plus the tag "❗ Needs you"). It is the only
   element in the scene with a pulse ring.
2. **Mirrors (fire together):** top-bar bell count +1; panel "Waiting on you" row
   gains her portrait; Pixel posts one quiet line in his thread ("Scarlett needs you —
   the Stripe test key. Tap her to answer."); `aria-live="assertive"` announces
   "Scarlett Scenario needs your input: Stripe test key."
3. **Open.** Click the "!", Scarlett herself, her portrait in the waiting row, or the
   bell (bell opens the oldest ask). Panel switches to her thread; she faces front;
   the **ask card** appears (types from v2 green room: *access* → masked grant switch;
   *decision* → 2–3 option chips + free text; *example* → textarea / file drop).
   Focus moves to the card's first control.
4. **Answer.** **[Hand it over]** (or pick a chip, or say it). The "!" pops into
   sparkles, she gives a thumbs-up (`celebrating` small), turns, sits, tag becomes
   "🧪 Running payment suite". Bell, waiting row, and badge clear together. Toast:
   "Handed to Scarlett." Pixel logs one line.
5. **Queue.** If more are waiting, the card footer reads "Next: Twinkle is waiting on a
   copy decision →" — one click jumps there (no auto-jump; the user stays in control).
6. **Ignored?** After 20s unanswered, the "!" does one bigger hop (once). No nagging
   repeats; Pixel never escalates beyond that one line.

### 3.5 Focus / zoom transitions & back

Layer stack: **Office → Whiteboard zoom → Dossier → Feature page (edit)**. The panel
stays live at every level (you can keep talking to Pixel about the board).

- **Whiteboard zoom**: 650ms `cubic-bezier(.2,.8,.2,1)` transform of `.stage` to fit
  the board's bounds in the stage (≈ scale 2.6). The rest of the office dims via a
  vignette but keeps animating (it's alive behind you). At 80% of the zoom the **HTML
  board overlay** fades in crisp (the SVG board art is just the frame). A **"← Office"**
  button top-left of the stage.
- **Dossier**: the binder clip snaps open (sfx-free wobble), the folder slides down
  and grows to a centered sheet over the zoomed board (400ms). Board stays visible behind.
- **Feature page**: inside the dossier, the feature row flips open to its page (300ms
  page-turn) — still the same sheet, with "← All features".
- **Esc** closes exactly one layer (feature → dossier → board → office). On a feature
  with unsaved edits, Esc first asks inline: "Keep editing / Discard changes / Save".
- Focus always returns to the element that opened the layer. Browser Back mirrors Esc
  (hash: `#office`, `#board`, `#features`, `#feature/<id>`).
- Voice: "Pixel, show me the board" / "open the features" / "close" do the same.

---

## 4. Whiteboard & dossier

### 4.1 Whiteboard (zoomed) — layout

Hand-drawn marker aesthetic (one marker-ish weight via SVG strokes; text stays in
the UI font for legibility — no handwriting fonts).

```
┌────────────────────────────── WHITEBOARD ─────────────────────────────── 📎 FEATURES ┐
│ PROGRESS                         │ NOW — checklist                                    │
│   ◯ 64%  → v1.0 launch           │ ☑ Voice: mic button in header        [Pete]       │
│  (marker ring, fills clockwise)  │ ☑ Voice: /search stub               [Captain]     │
│  Voice search   ▬▬▬▬▬▬░░  72%    │ ☐ Voice: wire results dropdown      [Pete] ⌨️      │
│  Checkout       ▬▬▬▬░░░░  48% ❗  │ ☐ Checkout: payment intents         [Captain] ⌨️   │
│                                  │ ☐ Checkout: payment test suite      [Scarlett] ❗  │
│                                  │ ☐ Cleanup: merge 3 card twins       [Lint+Twinkle]│
├──────────────────────────────────┼────────────────────────────────────────────────────┤
│ TOKENS (this project)            │ WHO DID WHAT        [ Tasks done | Tokens ]        │
│   806k total                     │ Captain   ▮▮▮▮▮▮▮▮▮▮▮  11                          │
│   Ship-It Squad  519k ▬▬▬▬▬▬▬    │ Pete      ▮▮▮▮▮▮▮▮▮    9                           │
│   Polish Patrol  173k ▬▬▬        │ Scarlett  ▮▮▮▮▮▮▮      7                           │
│   Solo            56k ▬          │ Lint      ▮▮▮▮▮▮       6                           │
│   Pixel           58k ▬          │ Twinkle   ▮▮▮▮▮        5   …(sleepers dimmed)      │
└──────────────────────────────────┴────────────────────────────────────────────────────┘
```

- **Progress**: overall ring (big number + target), then ≤3 current features with
  bars, %, and a ❗ when blocked. Click a feature bar → its dossier page.
- **Now checklist**: the live task list (from the Director's plan). Each item: checkbox
  glyph (☑/☐ with text state for SR), task text, assignee chip (`hero xs` face + short
  name), activity icon. Items tick themselves live as the sim runs (a marker
  check-stroke draws in 300ms). Click an assignee → their thread. Read-only for the
  user (the plan belongs to Pixel); a footer link **"Tell Pixel to change the plan"**
  pre-fills his composer.
- **Tokens**: one big honest number for the project + per-team bars, in team colour
  with the emblem and the exact number. Director counted separately (he's not a team).
  Hover a team bar → per-member split. Footnote: "Tokens = model usage on Aurora since
  kickoff. Cost estimate in Access." (no money on the board — calm).
- **Who did what** — the contribution comparison. Chosen viz: **paperwork tally bars**:
  each agent gets a horizontal row of little stacked paper sheets (one sheet per unit),
  sorted descending, exact number at the end, face + team colour stripe at the start.
  Toggle between two honest measures: **Tasks done** (checklist items closed) and
  **Tokens**. Default = Tasks done. Caption under it when on Tokens: "More tokens ≠
  more work — reading big files is expensive." Playful (it's literally their paperwork,
  matching the desk piles in the scene) yet a real, labelled bar chart.

### 4.2 Checkup lives next door
The **Health inspection poster** right of the board is part of the same zoom frame
(board pans slightly right to include it if clicked directly). Shows the three v2
vitals as rubber stamps — `Modular B · good`, `Clean A · excellent`, `Reuse C · needs
care` — letter + word + colour, "Inspected 2h ago", **[Run checkup]** if stale, and
per-vital note + **[Ask Pixel to fix →]** (v2 §3.5 behaviour unchanged).

### 4.3 Feature dossier

```
┌──────────────────── FEATURES — Aurora Storefront ─────────────── ✕ ┐
│ 7 shipped · 2 now · 4 planned                     [+ Propose one]   │
│ NOW                                                                 │
│  ● Voice search          72%  [Pete]                       ›        │
│  ● Checkout + payments   48%  [Ship-It] ❗ blocked          ›        │
│ PLANNED  (up next first)                                            │
│  ○ Multi-currency        drag ⋮⋮ to reorder                 ›        │
│  ○ Recommendations · ○ Reviews · ○ Email receipts            ›        │
│ SHIPPED  (stamped, slightly muted)                                  │
│  ✓ Product grid ★ · ✓ Cart ★ · ✓ Search filters · ✓ Auth …   ›        │
└─────────────────────────────────────────────────────────────────────┘
```
Each row is a paper tab: status shape (● now / ○ planned / ✓ shipped — never colour
only), name, %, owner, chevron. **[+ Propose one]** adds a planned feature with a name
field and an empty vision; Pixel acknowledges in chat.

### 4.4 Feature page — description & vision, editable

```
┌ ← All features            MULTI-CURRENCY  ○ planned              ✕ ┐
│ DESCRIPTION                                                         │
│  1  Shoppers see prices in their local currency.            ✎ ⌫ ̶S̶ │
│  2  Rates refresh hourly from the provider.                         │
│  3  ̶C̶r̶y̶p̶t̶o̶ ̶c̶h̶e̶c̶k̶o̶u̶t̶ ̶o̶p̶t̶i̶o̶n̶                                   [restore] │
│  + Add a line                                                       │
│ VISION                                                              │
│  1  Feels native: no "converted from USD" footnotes.               │
│  2  Checkout charges in the shown currency — no surprises.          │
│  + Add a line                                                       │
│ ─────────────────────────────────────────────────────────────────  │
│ 1 line struck · 0 added · unsaved     [Discard]  [Save & brief Pixel]│
└─────────────────────────────────────────────────────────────────────┘
```

- Text is a list of **lines** (bullets of intent), not a blob — that's what makes
  "remove things / write new ones" literal and safe.
- **Per line (on hover/focus)**: ✎ edit (or just click the text — it becomes an inline
  input, Enter commits, Esc reverts), ̶S̶ **strike** (marks for removal, stays visible
  with a line-through and a *Restore* link), ⌫ delete now (only for lines added in
  this edit session).
- **+ Add a line** at the end of each section → new focused input; Enter adds another.
- Footer shows a live diff summary + **[Save & brief Pixel]** primary. Save removes
  struck lines, stamps "Revised · just now", and Pixel posts in chat: "Got it — vision
  for Multi-currency updated (−1 line). I'll brief whoever picks it up." For a **now**
  feature, he adds "Telling Captain now" and a comm bubble plays in the scene
  (Pixel → Captain). Shipped features are editable too (it's the record) but show a
  note: "Shipped — edits update the record, not the code."
- **Voice path**: "Pixel, drop crypto from multi-currency" → Pixel stages the edit in
  the page (the struck line appears highlighted) and asks "Save it?" — you confirm.

---

## 5. Where the v2 essentials live (calm)

| Essential | Home in v3 | Notes |
|---|---|---|
| GitHub connected + push freshness | Top-bar chip (v2) **+** the outbox flag in-scene | Chip remains the authority. |
| Private / public | Top-bar chip (v2) | Same confirm flow. |
| Test URL / Open app | Top-bar chip (v2) | Deploy event refreshes its live-dot. |
| Overall progress | Top-bar slim pill "64% → v1.0" **+** clock hand **+** whiteboard ring | Three echoes of one number; top-bar is always readable. |
| Current feature % | Whiteboard Progress + dossier "Now" | Not on the scene floor. |
| Checkup A/B/C | Health-inspection poster beside the whiteboard | Glance: three stamps readable even unzoomed (letters only). |
| Project access grants | Top-bar **🔑 Access** chip → v2 project-access sheet | Also: ask cards grant inline. On hover of an agent, name card adds `reaches: GitHub · Figma` keytags (names only, masked values never). |
| Pending input | "!" badges + bell + panel waiting row | Replaces v2 banner (cut — the "!" is the banner). |
| Shot list | The dossier | — |

---

## 6. Simulation script (prototype)

Roster on Aurora: **Pixel** (Director). **Ship-It Squad** (Pod A): Pixel Pete
(Frontend), Captain Semicolon (Backend), Scarlett Scenario (QA). **Polish Patrol**
(Pod B): Sir Lint-a-lot (Quality), Twinkle (Design), Doc Hollywood (Writer).
**Solo** (hot desks): Baron von Backup (DevOps, idle), Querious (Data, **sleeping** on couch).
Madame Mergeworthy arrives mid-script.

**Act 1 — story (one-shot, ~64s from opening the project).** Each beat is a
`{t, actor, do, ...}` entry; the engine interprets it (§7).

| t (s) | Beat |
|---|---|
| 0 | Opening: camera eases in from 1.06 scale to 1.0 (500ms). Pete `coding` (Voice search), Captain `reading` checkout.ts, Scarlett `planning`, Lint `reading`, Twinkle `coding`, Doc `idle` w/ mug, Baron `idle` feet up, Querious `sleeping`. Pixel at his desk, `typing`. |
| 3 | Pete → `commit`: walks to outbox, drops paper, flag pops ("📮 Pushed 2 commits"); back to `coding`. Checklist "mic button" already ☑. |
| 6 | Captain `reading` → `coding` ("⌨️ Writing intents.ts"). |
| 8 | Lint walks to Twinkle's desk → bubbles: "These 3 cards are twins." / "Merge them into `<Card>`!" / "On it." Lint returns; both `coding`. |
| 13 | Captain → `handoff` PR #41 to Scarlett (envelope walk along lane). Scarlett `reviewing` (red pen, 2s) → `testing` ("🧪 Running 48 tests"). |
| 17 | Scarlett `tests-red` ("❌ 2 failing"): tosses paper ball; shout-across to Captain "2 fails in refund.test". Captain `coding` ("fixing refunds"). |
| 21 | Captain → `commit`, shout "Fixed — retry?". Scarlett → `needs-input` **"!"** — Stripe test key (access ask). All mirrors fire. *This thread pauses until the user answers; everything else continues.* |
| 25 | Doc yawns, "Nothing to write till Voice ships" → walks to couch → `sleeping` (session ends; Pixel line "Doc clocked off"). |
| 29 | Twinkle `testing` → `tests-green` (fist pump, gold star). Checklist "merge 3 card twins" ☑ (marker tick). |
| 33 | Pete `testing` → green → Voice search 100%. |
| 35 | Pixel walks to Baron (talking): "Preview it." Baron → `deploying` at the launch console; paper plane out the window; Test chip live-dot refreshes. |
| 39 | **Ship!** Voice search moves to Shipped: Pete `celebrating` front, scoped confetti over Pod A, the Ship-It pennant gets a star, everyone awake glances toward Pod A and claps once (1.2s), dossier folder on the board visibly thickens, toast "✨ Voice search shipped", Pixel: "Voice search is live on the preview 🎉 — want me to start Multi-currency?" + chips. |
| 46 | Pixel walks to the whiteboard, scribbles; checklist gains "Multi-currency: rate provider" [Querious]. |
| 48 | Door opens: **Madame Mergeworthy** arrives (`walking` → hot desk 3, nameplate pops) — "👋 Just joined" → `reading` the release notes. |
| 52 | Pixel → Querious on the couch (talking): Querious wakes (stretch), walks to hot desk 2 → `reading` "rates API docs". |
| 58 | Lint → `handoff` PR #42 to Madame Mergeworthy; she `reviewing` → **APPROVED** stamp thunk. |
| 62 | Second ask (decision): Twinkle "!" — "Cart button: 'Add to bag' or 'Add to cart'?" |

If the user answers Scarlett during Act 1: she `testing` → `tests-green` after 4s, the
Checkout bar jumps +6%, checklist "payment test suite" ☑.

**Act 2 — ambient loop (24s cycle, forever).** Deterministic rotation so the office
always breathes but never repeats identically within a minute: one *commit* by
whoever is coding (rotating), one *talk* between two awake agents in different pods
(from a list of 8 bubble pairs), one *test run* (85% green, 15% red-then-green 6s
later), one *read→code* switch, and every 3rd cycle someone gets coffee. Features
advance +1–3% per cycle while not blocked; tokens tick up per working agent
(~1–4k/cycle; reading ticks fastest). Nothing in Act 2 creates new "!" asks and nobody
ships — big moments stay rare.

Dev affordance: `?demo=fast` runs the script at 3×; pressing `R` on the stage while
holding `Alt` replays Act 1. Not shown in UI.

---

## 7. Data model additions

Keep scene art separable: **`THEME`** (pure art + anchors) vs **`WS.office`** (state)
vs the **engine** (moves actors to anchors, never knows what a couch looks like).

```js
// Theme — swappable. Logic only references anchor ids.
const THEME_OFFICE = {
  id:'office', viewBox:[1600,900], floorY:[380,900],
  art(){ /* returns SVG string: wall, floor, props; one <g id> per interactive object */ },
  objects:{ whiteboard:{x:250,y:60,w:510,h:240}, dossier:{x:700,y:60,w:60,h:70},
            poster:{x:790,y:110,w:80,h:110}, clock:{x:960,y:90,r:28},
            outbox:{x:1100,y:340}, printer:{x:840,y:330}, door:{x:110,y:360},
            console:{x:1120,y:600}, coffee:{x:330,y:700} },
  pods:[ {id:'A', rug:{x:120,y:450,w:520,h:140}, pennant:{x:380,y:420},
          seats:[{x:190,y:520},{x:310,y:520},{x:430,y:520},{x:550,y:520}], perches:[...]},
         {id:'B', ...}, {id:'C', ...} ],
  hotDesks:[{x:1100,y:750},{x:1220,y:750},{x:1340,y:750},{x:1460,y:750}],
  couch:[{x:120,y:780},{x:210,y:780},{x:300,y:780}], beanbags:[...],
  director:{x:1380,y:470}, lanes:{front:640, back:420},
};

// Additions to WS
WS.office = { theme:'office', camera:'office'|'board'|'features'|'feature:<id>',
  thread:'pixel' /* agentId | 'pixel' */, demo:{t:0, act:1, cursor:0} };

WS.agents = [ // per-project actors (replaces WS.teams[].members/WS.solo for the scene)
  { id:'a-scar', teamId:'ship-it'|null, seat:'A-3',            // anchor id
    pos:{x:430,y:520}, facing:'three-quarter', pose:'reading',  // render state (derived)
    activity:{ kind:'needs-input',   // enum from §2
               label:'Needs you',    // short tag
               detail:'Needs the Stripe test key to run the payment suite',
               target:'refund.test.ts'|null, featureId:'checkout', since:1731500000 },
    session:'running'|'idle'|'asleep',
    tokens:{ total:96000, byFeature:{checkout:88000, voice:8000} },
    tasksDone:7, reach:['gh'], locked:['stripe'],
    unread:0 } ],

WS.director = { id:'pixel', pos:{...}, activity:{...}, tokens:{total:58000} };

WS.threads = { pixel:[msg...], 'a-scar':[msg...] };  // per-agent chat
// msg: {id, from:'user'|agentId|'system', kind:'text'|'ask'|'comm'|'summary', text, at,
//       askId?, comm?:{from,to,text}}

WS.comms = [ // agent↔agent events (drive bubbles & paper passing)
  {id:'c1', at, from:'a-semic', to:'a-scar', kind:'handoff'|'talk'|'shout',
   text:'PR #41: /checkout + intents', artifact:'PR #41'|null} ],

WS.pending = [ // unchanged from v2, plus agentId already present
  {id:'ask-scar', agentId:'a-scar', type:'access'|'decision'|'example', ...} ],

WS.checklist = [ {id:'k1', featureId:'voice', text:'Mic button in header',
                  assignees:['a-pete'], done:true, doneAt} ],

WS.features = [ // flattened: one array, status field (replaces now/shipped/planned)
  {id:'multicur', name:'Multi-currency', status:'planned'|'now'|'shipped',
   order:1, pct:0, owner:'a-query'|'ship-it'|null, star:false, blocked:false,
   description:[{id:'d1', text:'Shoppers see prices in their local currency.'}],
   vision:[{id:'v1', text:'Feels native: no "converted from USD" footnotes.'}],
   revisedAt:null, draft:null /* {description:[{id,text,struck,added}], vision:[...]} */ } ],

// Derived, never stored: team token totals, project total, who-did-what ranking.
const SIM_SCRIPT = [ {t:3, actor:'a-pete', do:'commit', n:2}, {t:13, actor:'a-semic',
  do:'handoff', to:'a-scar', artifact:'PR #41'}, {t:21, actor:'a-scar', do:'ask',
  ask:{...}}, {t:39, do:'ship', feature:'voice'}, ... ];
```

Engine API (small, isolated): `placeActors()`, `walkTo(agentId, anchorId) → Promise`,
`setActivity(agentId, kind, opts)` (updates pose/prop/tag/monitor in one place),
`say(agentId, text, {to})`, `passPaper(from, to, label)`, `zoomTo(objectId|null)`,
`runScript(script)`. Each activity kind is one entry in an `ACTIVITY` table (pose,
facing, prop, monitor glyph, tag icon) — §2 *is* that table, so adding a state is one row.

---

## 8. Accessibility

- **Two equivalent views of the same state.** The visual stage, and an **Office list**
  (toggle `▤ List`, also always present as an off-screen region for SR users):
  grouped by **Director · each team (emblem name) · Solo · Off shift**, each row:
  name, role, activity text ("Writing PriceTag.tsx"), tokens, and a "Needs you" badge.
  Rows are buttons doing the same as clicking the agent. The whiteboard, features, and
  checkup are listed as buttons at the end.
- **Stage keyboard model**: the stage is one Tab stop (`role="group"`,
  `aria-label="Office — 9 people, 1 needs you"`) with a roving tabindex. Order: Pixel →
  Pod A left→right → Pod B → Pod C → hot desks → couch → whiteboard → features →
  checkup → door. Arrow keys move spatially (nearest in direction), Home = Pixel,
  `!` key jumps to the next agent needing input. Enter/Space = click. Each actor is a
  `<button>` with `aria-label="Scarlett Scenario, QA, Ship-It Squad — needs your input:
  Stripe test key"`. Focus ring = the hover spotlight **plus** a 3px visible outline.
- **Never state by animation or colour alone.** Every activity has an icon + text tag;
  the "!" has text "Needs you"; test lamp pairs ✓/✕ with colour; idle vs sleeping
  differ by location (desk vs couch), pose, and tag. Grade stamps carry letter + word.
- **Live regions**: needs-input → assertive; ships, joins, leaves, handoffs → polite,
  throttled to one announcement per 4s (comm chatter is **not** announced; it's in the list).
- **Panel**: `role="complementary"` labelled "Chat with {name}"; thread `role="log"`;
  switching agents moves focus to the composer and announces "Now talking to Scarlett".
  Mic: `aria-pressed`, label names the listener; typed path always equal.
- **Layers**: whiteboard / dossier / feature page are `role="dialog"` (non-modal for
  the board so the panel stays reachable; modal for the feature editor), labelled,
  Esc closes one level, focus returns to the opener. Line editor: each line is a list
  item with buttons "Edit line 3", "Strike line 3"/"Restore line 3"; struck state is
  announced and also shown as "(will be removed)" text, not only line-through.
- **prefers-reduced-motion**: no walking (actors crossfade 150ms to their new spot),
  no bob/zzz drift/steam/confetti; handoffs show a static 📨 icon between the two desks
  for 3s with the tag; camera zooms become 200ms crossfades; the "!" is static with a
  thicker outline. All information remains.
- **Contrast**: tags are ink on cream pills (≥ 7:1), never text directly on scene art.
  Hit targets ≥ 44px: actors get an invisible 56×72 hit box regardless of depth scale.
- **Secrets**: ask cards and hover keytags show names + masked last-4 only; values
  never in bubbles, tags, threads, or announcements.

---

## 9. Requests to the cast system (`spec-cast.md`)

Assumed: `hero(agent,{size, pose, facing})`, poses idle/typing/writing/reading/
carrying/talking/sleeping/celebrating/needs-input, facings side/three-quarter/front.
The Office additionally needs:

- **R1 · Numeric size.** Accept `size` as a px number (depth scaling, ~48–78px) in
  addition to the named sizes; line weights should not scale below 1.5px.
- **R2 · `thinking`** pose — hand on chin, eyes up (planning).
- **R3 · `frustrated`** pose — slumped shoulders / facepalm, friendly not sad (red tests).
- **R4 · `waiting`** pose — idle variant with finger-tap / chin-in-hand (blocked on another agent).
- **R5 · `pressing`** pose — arm forward pushing a button/lever (deploy).
- **R6 · `holding` slot** — `{holding:'mug'|'envelope'|'paper'|'binder'|'pen'|'none'}`
  so props swap without new poses (idle+mug, carrying+envelope, writing+red pen).
- **R7 · `walking`** pose with a 2-frame cycle (CSS-toggled), empty-handed; `carrying`
  must also have the cycle. Plus **`mirror:true`** for side facing left vs right.
- **R8 · `seated:true`** modifier — anchors the figure at the hip so a desk can occlude
  the legs; standing poses keep feet on the floor line.
- **R9 · `waving`** gesture (arrive/leave, and Pixel's cap tip can reuse it).
- **R10 · Turn transition** — a documented way to tween facing ¾ → front (e.g. render
  both and crossfade 250ms, head first) so "looks at you" reads as a turn, not a cut.
- **R11 · Reduced-motion static frame** for every pose (already implied — please make
  it explicit).

From `spec-teams.md`: `emblem(team,'xs'|'sm')` must read at 14px (name cards) and
on a fabric pennant (sm, slightly skewed by the pennant shape — a flat emblem in a
pennant mask is fine).
