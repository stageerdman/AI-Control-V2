# Disney/Pixar v2 — Cast Design Language + Agents Library + Factory

**Owner:** Cast & Factory cluster
**Status:** CANONICAL for the cast design language (§1). Other v2 specs (project
workspace, overview, access) consume §1 as the source of truth for how any
character, team, or director is drawn and animated. §2–§3 are the creation
surfaces.

Built on `concepts/disney-pixar.html` — we **extend** its SVG cast, warm
palette, rounded forms, confetti and reduced-motion support. Nothing here throws
that away; it formalizes it and adds the two things v1 lacked: a **distinct
identity per agent** (so a roster of 12 doesn't read as 12 blobs) and a **team
as a first-class visual object**.

---

## 1. CAST DESIGN LANGUAGE (canonical)

The one rule: **personality lives in the character; state lives in the frame
around it.** Faces, colors and accessories make an agent lovable and
recognizable. Mood (working/blocked/celebrate/idle) is carried by the character
*and* always redundantly by a text label + chip color + card border — never by
the face alone. This keeps the studio playful and still high-signal.

### 1.1 Palette (unchanged from v1 — reuse the tokens verbatim)

Surfaces / ink:
```
--bg-0 #1a1430   --bg-1 #241a44   --bg-2 #2e2156   (deep twilight canvas)
--panel #ffffff  --cream #fff6e9  (light content surfaces)
--ink #241a44    --ink-soft #5b5280  (text)
--line rgba(36,26,68,.1)
```
Signature hues (the 7 an agent/team can **be** — each has a human name so color
is never the only identifier):
```
sun  #ffc24b (Amber)   coral #ff6f73 (Coral)   teal #2fd3c3 (Teal)
sky  #4ea8ff (Sky)     grape #9b6cff (Grape)   mint #8be88b (Mint)
rose #ff9ecf (Rose)    [+ sun-deep #ff9b3d as the warm accent]
```
Per character, derive two shades from the signature hue with the existing
`shade(hex, amt)` helper: `light = shade(c,+22)` (belly highlight, ears),
`dark = shade(c,-26)` (arms, brows). **Do not introduce new base colors** — new
personality comes from accessories (§1.4), not new hues.

Status semantics (used on chips/borders, see §1.3) reuse hues but are fixed:
working→sky, blocked→coral, celebrate→mint, idle→ink-soft.

### 1.2 Character anatomy (extends the v1 `castSVG`)

One character = one `.cast` element wrapping an inline SVG on a `0 0 66 72`
viewBox. Keep the v1 structure exactly; it is the canonical skeleton:

- **Contact shadow** — `<ellipse cx=33 cy=67 rx=18 ry=4>` at 18% black. Grounds
  the character; grows/shrinks subtly with squash-stretch.
- **`.body`** group (everything animates from here, `transform-origin:50% 72%`):
  - **Gumdrop body** — the signature path filled with `c`, with a `light`
    overlay for the belly highlight. Soft, rounded, no hard corners anywhere.
  - **Two arms** — rounded capsules in `dark` with a `light` hand-circle. The
    **right arm is `.arm`** (`transform-origin:72% 56%`) and is the one that
    raises when blocked.
  - **Face** (the identity center):
    - Two big white eyes (r≈6.5) + dark pupils (r≈3) + a tiny white catch-light
      (the Pixar "aliveness" dot) — never remove the catch-light.
    - `.brow` ellipses (tilt for mood), `.lid` rects for the blink.
    - **Blush** — two rose ellipses at 50% opacity. Warmth marker; stays on.
    - `.mouth` — a single stroked path swapped per mood (§1.3).

**Size scale (token `--size` on `.cast`):**
```
--cast-xs 34px  (stacked mini-casts, roster thumbnails, team member dots)
--cast-sm 58px  (library/agent cards, team member rows)
--cast-md 86px  (factory live preview, clarifier)
--cast-lg 112px (director / hero preview)
```
Default breathing + 5.2s blink always on at rest (reduced-motion off → static,
§1.6).

### 1.3 Mood states (the four canonical + neutral rest)

Each mood is a `mood-*` class on `.cast`. **Every mood changes the mouth path and
at least one of {brow, pupil, arm} so it is legible with motion disabled.** The
redundant text/chip/border is listed so builders wire all three layers.

| Mood | Face (static-legible) | Motion | Chip label | Chip / border color |
|---|---|---|---|---|
| **neutral/idle-rest** | gentle smile `M28 45 L38 45`→slight curve; eyes forward | slow breathe (4.8s), 85% opacity | "Idle" | ink-soft |
| **working** | mouth `M26 44 Q33 48 40 44` (focused), pupils down `+2y` | `workbob` 1.1s small up-bob + sheen on progress bar | "Working" | sky |
| **blocked** | mouth `M27 46 Q33 42 39 46` (worried), brows up `-3y`, **right arm raised** (hand up, static when motion off) | gentle `worry` sway + arm `raise`; **a `!` speech-dot badge** appears top-right of the card | "Needs input" | coral |
| **celebrate** | mouth wide `M25 42 Q33 54 41 42` (open grin), brows up | `jump` squash-stretch (.62s) + **confetti** burst | "Done!" | mint |

Rules:
- **Blocked must be unmistakable even frozen:** raised arm + `!` badge + coral
  border + "Needs input" text. This is the state the user must never miss (it
  gates their attention — see project workspace spec's top-of-screen
  notification).
- Celebrate is a *transition*, not a resting state: fire it for ~1.2–1.6s then
  settle to working/idle (v1 `grantKey`/`mint` already do this).
- Mouth paths are the canonical set in v1 `castSVG.mouths` — keep them.

### 1.4 Identity accessories (NEW — the fun, and the legibility fix)

Color alone can't separate 12 agents. Each agent definition carries **one
signature hue + one optional `trait`** (an accessory) + an optional **prop** the
hand can hold. Accessories are a **small, curated, standardized set** so the
studio stays coherent — define once, reuse everywhere. All anchor to the head
(centered ~`x33`, crown ~`y18`, eyes ~`y37`) and render in a `<g class="trait">`
layered above the face, below the director hat.

Curated trait set (pick the smallest set that covers the roster; each is a tiny
SVG snippet the builder authors once):
```
none · beret · sailor-cap · beanie · mortarboard · top-hat ·
glasses · monocle · deerstalker · propeller-cap · hard-hat · bow · headphones
```
Hand props (optional `<g class="prop">` in the left hand): `none · wrench ·
magnifier · quill · paint-brush · clipboard · flag`.

Authoring contract for a trait (so they compose predictably):
- Fits within `x:12–54, y:4–26` (the crown zone); never covers the eyes except
  `glasses`/`monocle` which sit on the eye line `y≈37`.
- Uses the character's `dark` for the main mass and one accent from the palette
  (default `sun`) for a band/detail — so it tints with the agent but reads as a
  distinct object.
- Example (beret): `M18 20 Q33 8 48 20 Q46 24 33 23 Q20 24 18 20Z` fill `dark`,
  plus a small `sun` nub at the crown. Example (glasses): two `r6` rings stroked
  `dark` on the eye line + a bridge. Builder reproduces the rest from these two.
- Accessories **do not** change with mood (identity is constant); only the
  director hat (§1.5) and arm/mouth move.

### 1.5 Orchestrator / Director treatment (reads as senior)

The orchestrator is a cast member "promoted" — same skeleton, four seniority
signals stacked so it's unmistakable at any size:
1. **Scale** — `.director` sets `--size:112px` (1.3–1.7× the crew around it).
2. **Director's cap** — the v1 beret-band hat in `g.director` (dark crown +
   `sun` band). This *replaces* any personal trait while in the director role.
3. **Megaphone prop** in the hand (optional) and a soft **spotlight** glow
   behind (radial `sun` at low opacity) on hero stages.
4. **"Manager view / altitude: big picture" tag** + a small `▲` director badge
   on the card (v1 `.altitude-tag`). The director never shows a progress bar of
   its own — it shows *coordination* (who it's running), reinforcing altitude.

Director moods: `working` while coordinating, `celebrate` on a milestone,
`idle` before launch. Never `blocked` — if the director needs the user it
surfaces as a notification, not a raised hand.

### 1.6 Team representation (NEW — a troupe, not a pile)

A team is a **first-class character object**: a *troupe badge* — an ensemble
read at a glance, expandable to its roster.

- **Troupe badge** (`.troupe`, default 96–120px): a rounded-square "stage card"
  with a 3px **team-color ring**, holding **2–4 member faces** (head-only
  crops of each member's cast at `--cast-xs`, overlapped −8px like v1
  `.mini-cast`) sitting on a shared contact shadow, as if posed together. A
  small **team emblem** (a chosen icon/emoji, e.g. 🚀) sits in the top-left
  corner chip; a **member count** chip ("4") in the top-right.
- **Team color + emblem** are the team's identity (parallel to an agent's
  hue+trait). Members keep their own hues inside the badge — the troupe reads as
  "these distinct folks, as one unit."
- **Team mood** = the *rollup* of its members: celebrate if any member just
  finished, blocked (coral ring + `!`) if any member needs input, else working,
  else idle. The badge border uses the same status semantics as §1.3.
- At `--cast-xs` in dense lists, a troupe collapses to a single ringed stack of
  faces with the count chip (no emblem corner).

### 1.7 Motion & reduced-motion (canonical tokens)

Reuse v1 timings; name them as tokens so every surface matches:
```
breathe 3.6s · blink 5.2s · workbob 1.1s · raise 1.2s · worry 1.6s
jump .62s · spring cubic-bezier(.34,1.56,.64,1) · scene-in .5s
belt/sheen 1.2–2s · confetti 1.4–2.8s fall
```
`@media (prefers-reduced-motion:reduce)` (extend v1 rule): kill `breathe, blink,
workbob, raise, worry, jump, mote drift, logo spin, belt, sheen` **and**
suppress confetti (v1 `fireConfetti` already early-returns). Each mood must
remain fully legible frozen because its mouth/brow/arm pose is static — verified
in §1.3. Celebrate with motion off → the grin + mint border + "Done!" + a single
non-animated ✦ mark, no particle burst.

---

## 2. AGENTS LIBRARY — the window of all definitions

**Mental model:** this is the **cast list / definitions**, NOT live agents. An
agent here is *a definition: a name, a look, a role, and a system prompt.* The
**orchestrator can only cast from this library** — if it's not defined here, no
orchestrator can use it. (Live, running agents with progress bars live in the
project workspace spec; keep the two visually distinct: here characters rest at
**neutral**, never "working".)

### 2.1 IA

```
Agents  ·  Teams            ← two tabs in one "Library" window
────────────────────────────────────────────────────────
[ search agents… 🔍 ]   [ role ▾ ]            ( + New agent )  ← single primary
────────────────────────────────────────────────────────
  grid of Definition Cards (responsive auto-fill, min 270px)
```
- Two tabs: **Agents** (default) and **Teams** (§3.2 cards). One window, because
  the user thinks of them together ("my cast").
- **Search** filters by name/role/prompt text, instantly. Role dropdown filters.
- **One primary action:** `+ New agent` (or `+ New team` on the Teams tab) →
  opens the factory (§3).

### 2.2 Definition card (what a definition contains)

```
┌─────────────────────────────────────────┐
│  (cast @sm, neutral)   Captain Semicolon  │  ← avatar + funny name
│                        Backend engineer   │  ← role
│  "Ships tidy APIs and never leaves a      │  ← one-line specialty (first line
│   promise dangling."                      │     of the system prompt / a tagline)
│  ┌─ system prompt ──────────────────────┐ │
│  │ You are a senior backend engineer…   │ │  ← 2-line truncated prompt preview
│  │ Always write tests first. Never…  ⋯  │ │     (monospace, dimmed)
│  └──────────────────────────────────────┘ │
│  🔒 No standing access · project-granted   │  ← access note (agents have NONE
│  Used in: Ship-It Squad · +1              │     by default; project grants it)
│  Summonable: solo ✓   via team ✓          │  ← how the orchestrator can call it
│                              [ Edit ]      │  ← secondary; card click also edits
└─────────────────────────────────────────┘
```
Contents, precisely:
1. **Avatar** — the agent's cast (signature hue + trait + prop) at `--cast-sm`,
   resting **neutral** (this is a definition, not a running state).
2. **Name** (playful) + **role**.
3. **Specialty line** — one sentence; the agent's "logline."
4. **System prompt preview** — 2 lines, monospace, truncated with `⋯`; this is
   the thing that makes it "a definition with a system prompt." Full prompt on
   open.
5. **Access note** — always `🔒 No standing access · project-granted`. Honest:
   definitions carry no keys; the **project** grants access (per access spec).
6. **Used in** — teams that include this agent (links).
7. **Summonable** — `solo` / `via team` affordance (every agent is summonable
   solo; this line makes "single agent OR whole team" explicit and scannable).

### 2.3 States
- **Hover:** lift (−4px), avatar does a one-shot blink/wave (motion-on only).
- **Focus-visible:** 3px grape ring (card is a `<button>`).
- **Empty library:** a single friendly idle character center-stage + "No cast
  yet — mint your first agent" + the `+ New agent` primary.
- **Search no-match:** character shrugging (blocked-ish pose, no `!`) + "No one
  by that name."
- **In-use badge:** if an agent is on ≥1 team, a small troupe-dot cluster shows
  on the card corner.

---

## 3. AGENT & TEAM FACTORY

Two creators behind the library's `+ New` action. Both follow the v1 factory
pattern: **live character preview on the left, a short form on the right, one
primary button.** Fewest steps; playful customization is the hero of the left
panel.

### 3.1 Agent designer — "Mint a cast member"

Layout = v1 `factory-grid` (preview stage | form). **Four fields, one button.**

**Left — live preview stage** (`--cast-md`, celebrate pose so it feels alive):
- The character updates on every keystroke/toggle (name, color, trait, prop).
- Shows **name + role** beneath, and a **"Summonable solo · addable to teams"**
  line (reinforces the model). **No access panel here** — access is a project
  concern, not a definition concern (changed from v1, per access spec).

**Right — the form (top → bottom = the fewest-steps order):**
1. **Name** — text, funny naming encouraged. Placeholder rotates fun examples
   ("Captain Semicolon", "Sir Lint-a-lot", "Madame Mergeworthy"). A small 🎲
   "surprise me" button next to it drops a random funny name — this is the fun,
   front and center.
2. **Look** — the playful block:
   - **Color** — 7 signature swatches (toggle buttons, `aria-pressed`,
     `aria-label` = color name).
   - **Trait** — a row of accessory chips (none/beret/glasses/… from §1.4), each
     previews live on the character.
   - **Prop** — optional hand prop chips.
3. **Role** — select (Frontend, Backend, Design, QA, Data, DevOps, Research,
   Writer, …).
4. **System prompt / rules & context** — the defining textarea. Label it
   plainly: *"The agent's brain — its own system prompt."* Helper: "This is what
   this agent always knows about itself and how it works." A couple of **starter
   templates** (per role) one-click fill it.

**Primary action:** `✨ Save agent` → confetti + toast "{Name} joined the cast"
→ returns to the library (not to "watch", since this is a definition). Edit mode
reuses the identical screen with values prefilled and button "Save changes."

**Why this order:** name+look first = immediate delight and a character to bond
with; role+prompt second = the substance. Everything optional except name +
prompt, so the shortest real path is **name → prompt → Save** (3 touches).

### 3.2 Team designer — "Assemble a troupe"

A team = **its own identity + its own instructions + a roster of existing agents,
each with instructions for THIS team.** The key idea to make visible: **an
agent's effective context = its own system prompt (from the library) + the team
instructions + its per-team instructions.** We show that composition explicitly.

Layout: **troupe preview (left) | builder (right)**, same split as the agent
designer.

**Left — troupe preview:**
- The **troupe badge** (§1.6) assembling live as members are added — faces pop
  in with the spring. Team-color ring + chosen emblem update live.
- Below: team name, emblem, member count, and a **"Summonable as one unit ✓"**
  line — the explicit counterpart to an agent's "solo ✓", so the user sees the
  orchestrator can call *this whole troupe* in one go.

**Right — the builder, three stacked sections:**

**(a) Team identity**
- **Team name** (playful: "The Ship-It Squad", "Polish Patrol") + 🎲.
- **Team color** (7 swatches) + **emblem** (small emoji/icon picker).

**(b) Team instructions** — one textarea: *"Rules for the whole team."* Helper:
"Every member reads this on top of their own brain." (e.g. "Ship behind a flag,
keep main green, demo at the end.")

**(c) Roster** — compose from **existing** library agents:
- `+ Add agent` opens a compact picker (searchable list of definition cards).
  You can only add agents that already exist — reinforcing the library-as-source
  rule.
- Each added agent is a **member row**:
  ```
  (cast @sm) Pixel Pete · Frontend          [ × remove ]
  └ On this team:  ┌──────────────────────────────┐
                   │ Own the storefront UI + the   │  ← per-member instructions
                   │ voice-search bar. Mock data…  │     (this agent's job HERE)
                   └──────────────────────────────┘
  ```
  The expandable field is the **per-agent-on-team instruction**. A tiny stacked
  "context" glyph on the row visualizes the three layers (self ▸ team ▸ here) on
  hover/tap, so the composition model is always discoverable.

**Primary action:** `🎬 Save team` → the troupe badge does a celebrate bounce +
confetti + toast "The Ship-It Squad is ready to be called."

**Composition recap (shown as a calm footer line, not a wall):**
> Each member runs with **its own brain + the team's rules + its job on this
> team.** The orchestrator can summon any agent alone — or this whole troupe.

### 3.3 Flow summary (fewest steps, one primary per screen)

- **Design an agent:** Library → `+ New agent` → (name, pick color/trait, write
  prompt) → `✨ Save agent` → back in library. *One screen, one button.*
- **Compose a team:** Library▸Teams → `+ New team` → name+color+emblem → team
  instructions → `+ Add agent` ×N (set each member's per-team line) → `🎬 Save
  team`. *One screen, one button, roster grows inline.*

---

## 4. SAMPLE DATA (believable, funny, buildable)

### 4.1 Agent roster (definitions)
```
id         name                 role       hue    trait        prop        logline / prompt gist
──────────────────────────────────────────────────────────────────────────────────────────────
a-semic    Captain Semicolon    Backend    sky    sailor-cap   wrench      "Ships tidy APIs; never leaves a promise dangling. Tests first, always."
a-lint     Sir Lint-a-lot       Quality    mint   monocle      magnifier   "Hunts dead code and stray styles. Leaves every file nicer than found."
a-merge    Madame Mergeworthy   Release    grape  top-hat      flag        "Owns branches & releases. Keeps main green; squashes with grace."
a-pete     Pixel Pete           Frontend   teal   beanie       paint-brush "Pixel-perfect UI. Lives in the component library, hates magic numbers."
a-doc      Doc Hollywood        Writer     sun    glasses      quill       "Turns features into docs people actually read. Updates the README."
a-scar     Scarlett Scenario    QA         coral  deerstalker  clipboard   "Writes the test plan first. Will happily block a red merge."
a-baron    Baron von Backup     DevOps     rose   hard-hat     wrench      "Infra, deploys, backups. Measures twice, ships once, rolls back calmly."
a-query    Querious             Data       sky    propeller    magnifier   "Speaks fluent SQL. Asks 'what are we actually measuring?' first."
a-prof     Professor Prompt     Research   grape  mortarboard  quill       "Clarifies the ask, cites sources, hands a crisp brief to the director."
a-twinkle  Twinkle              Design/UX  rose   beret        paint-brush "Spacing, contrast, delight. Removes anything that doesn't earn its place."
```
(All: `🔒 No standing access · project-granted`. All: summonable solo ✓.)

### 4.2 Teams

**🚀 The Ship-It Squad** — color `sun` — emblem 🚀
Team instructions: *"Ship the feature behind a flag. Keep main green at all
times. One person demos at the end. No scope creep — park extras in issues.txt."*
Roster:
- **Pixel Pete** — *On this team:* "Own the storefront UI and the voice-search
  bar. Mock the API until Captain's endpoint lands. Match the component library."
- **Captain Semicolon** — *On this team:* "Build `/search` + `/checkout`
  endpoints. Hand Pixel a typed stub on day one. Flag anything that needs a key."
- **Scarlett Scenario** — *On this team:* "Write the test plan before code lands.
  Block the merge if the payment suite is red. Sign off the demo."

**🧹 The Polish Patrol** — color `mint` — emblem 🧹
Team instructions: *"No new features. Reduce, de-dupe, document. Every change is
a small focused commit. Leave the health ratings better than you found them."*
Roster:
- **Sir Lint-a-lot** — *On this team:* "Sweep for dead code and style drift.
  Propose extractions where you see a second caller — never over-generalize."
- **Doc Hollywood** — *On this team:* "Update README + the MD file descriptions
  to match what shipped. Note lessons in the update's wiki.md."
- **Twinkle** — *On this team:* "Tighten spacing and contrast on changed
  screens only. Cut any element that doesn't earn its place."

### 4.3 Director (for reference / cross-spec)
`Pixel` — the project orchestrator — hue `sun`, director cap, megaphone,
`▲ Manager view · altitude: big picture`. Never blocked; never carries a
progress bar; shows who it's running instead.

---

## 5. ACCESSIBILITY NOTES

- **Mood never by color alone:** every state = character pose **+** text label
  (chip) **+** chip/border color **+**, for blocked, a `!` badge. Verified
  legible with motion disabled (§1.3).
- **Characters are decorative to AT:** each `.cast`/`.troupe` SVG is
  `aria-hidden="true"`; the card/button supplies the accessible name and the
  live status text. Status chips are plain text, so screen readers get
  "Scarlett Scenario, QA, Needs input."
- **Color pickers:** swatches are toggle `<button>`s with `aria-pressed` and
  `aria-label` = the color's human name (Amber, Coral…). Trait/prop chips
  likewise labelled. No customization relies on seeing hue.
- **Keyboard:** every card, swatch, chip, toggle and member row is a real
  button/control; visible focus is the 3px grape `:focus-visible` ring
  (offset 2px) from v1. Arrow-key stage nav preserved. The team picker and
  textareas are standard focusable fields.
- **Contrast:** body text is `--ink` on `--panel`/`--cream` (passes AA). Signature
  hues are used as *fills behind dark ink or as borders/accents*, never as small
  text on white. Status chips pair a tinted bg with a darkened same-hue text
  token (e.g. working chip `#1e6fd0` on sky-tint) as in v1.
- **Motion:** `prefers-reduced-motion` kills all character/ambient animation and
  confetti (§1.7); nothing conveys meaning only through motion.
- **Live regions:** toasts use `role="status" aria-live="polite"` (v1). A newly
  blocked agent should also announce via the project's top notification region
  (owned by the workspace spec).
- **Secrets:** this cluster never shows key *values* — definition cards show the
  honest "no standing access" note only; any key reference elsewhere stays
  masked.

---

## 6. BUILD NOTES
- Single self-contained HTML; all CSS/JS/SVG inline; no external resources, no
  Artifacts. Extends the existing `castSVG`/`cast`/`shade`/`keytag`/`fireConfetti`
  helpers rather than replacing them.
- Add to v1: a `trait`/`prop` layer in `castSVG` (one `<g>` each, driven by a
  small lookup of path snippets), a `troupe(team)` builder (reuses `cast` head
  crops), and the two factory screens (agent = extend v1 factory minus access;
  team = new). Library = a grid of definition cards + the Agents/Teams tabs.
- Definitions render characters at **neutral rest**; only the project workspace
  renders them with live working/blocked/celebrate state.
