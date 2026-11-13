# Disney v3 — Cast → Teams: "Roll Call" + Squad Zoom + Emblems

Owner: Teams UX + insignia. Source of truth: `user-feedback-v3.md` (verbatim) and
`BRIEF.md` §B. Base: `../disney-v2/spec-factory.md` §1 (palette, motion tokens,
roles carry context) and `SYNTHESIS.md` (one roster, team identity identical
everywhere). Characters render through `spec-cast.md`'s
`hero(agent, {size, pose, facing})`; this spec owns **team rows, the squad
zoom, the captain mark and the emblem library** and exposes `emblem(team, size)`.

The user's words, compressed into the one rule for this surface:

> **A team is a crew standing together under a flag — not a card.** You see
> who's in it and what it's for at a glance; you click to step onto their stage
> and run the crew from there.

---

## 0. What this surface is (and isn't)

- It is the **definition** of a team: identity (emblem, name, color, one-line
  purpose), its rules, its members, each member's role and job *on this team*,
  and its captain. It is the v2 Library▸Teams list **and** the v2 Team Designer,
  merged into one place.
- It is **not** live status. Who is working/sleeping/stuck lives in the Office
  (BRIEF §C). Team rows here show no mood, progress or "!" — they are a roll
  call, so they stay calm.
- **Captain** has a real meaning, not decoration: the orchestrator briefs a team
  **through its captain** (big picture in, captain splits it to the crew). This
  preserves the project rule *orchestrators get the big picture; teams get
  role-specific context*. Shown once, as one line in the panel (§2.3).

---

## 1. Teams list — "Roll Call"

### 1.1 Layout

Cast stage, `Teams` tab selected (Agents | Teams tabs stay as in v2). The page
is the **dark twilight stage** (`--bg-0` → `--bg-1` vertical gradient, v2 motes
allowed) with **no white panels**. Teams are **stacked one under another**, a
single centered column, max-width **1040px**, each team a borderless **row**
that sits on its own soft floor.

```
 Cast    [ Agents | •Teams ]                                    [ + New team ]
 ────────────────────────────────────────────────────────────────────────────

        .  ◜ soft floor glow ◝   .
      (Pete) (★ CAPT.SEMI) (Scar)        ⬢  The Ship-It Squad
       \_____________________/          [ROCKET]  Takes a feature from idea to demo —
          ═══ floor ellipse ═══          88px     behind a flag, main kept green.
                                                  3 members · ★ Captain Semicolon

                                    (64px of air — no divider lines)

      (Doc) (★ SIR LINT) (Twinkle)       ⬢  The Polish Patrol
       \_____________________/          [CASTLE]  No new features. Tidies, de-dupes
          ═══ floor ellipse ═══                   and documents until it all shines.
                                                  3 members · ★ Sir Lint-a-lot

      (Merge) (★ BARON)                  ⬢  The Engine Room
          ═══ floor ellipse ═══         [COG]     Branches, releases, deploys…
                                                  2 members · ★ Baron von Backup

      ( ? ) ( + ) ( ? )                  ◌  New team
          ═══ dashed floor ═══                    Gather a crew under a new flag.
```

**Row anatomy** (one reusable component `teamRow(team)`; height ~**208px**,
gap between rows **64px**, row padding 24px):

| Zone | Content | Spec |
|---|---|---|
| **Lineup** (left, ~52% width) | the team's members standing together on a shared floor ellipse | see §1.2 |
| **Emblem** (center-right) | `emblem(team, 88)` | sits on the row's vertical center, 24px left of the text |
| **Name** | team name | display font, 26px/800, `--cream` |
| **Description** | `team.blurb`, **max 90 chars**, clamps at 2 lines | 15px/600, `rgba(255,246,233,.72)` |
| **Meta** | `3 members · ★ Captain Semicolon` | 13px/800 uppercase-tracked label, team hue for the ★ only |

Nothing else on the row. No buttons, no chips, no instructions text, no
"summonable" lines. The whole row is one click target.

### 1.2 The lineup (the "group of characters")

- **Captain front & center** at `hero(captain, {size:'md', pose:'idle',
  facing:'front'})`, with the captain mark (§2.4, `xs/sm/md` variant).
- **Others flank in a shallow V**, alternating left/right in member order,
  each **one step back**: `size:'sm'`, `pose:'idle'`, `facing:'three-quarter'`
  turned **toward the captain**. Overlap neighbours by ~28% of width so they
  read as a *group*, not a row of thumbnails. Back-row characters sit 10px
  higher and at 92% brightness (depth, not blur).
- **Shared contact shadow:** one floor ellipse under the whole group, tinted
  with the team hue at 14% (the "stage floor"); characters' own shadows still
  render on top.
- **Cap shown: 5.** A 6th member renders as a small chalk sign `+1` standing at
  the back right (teams cap at 6, §2.6).
- Idle life comes from `hero()` (breathe/blink), **desynced** per member
  (random 0–1.2s delay) so the crew feels alive, not mechanical.

### 1.3 Hover / focus highlight ("stage light")

Hover and `:focus-visible` are the **same** state (keyboard users get the full
moment). Over **240ms** `spring`:

1. **Spotlight:** a soft cone from above in the team hue (radial gradient,
   18% → 0) fades in behind the lineup; the floor ellipse brightens to 30%.
2. **Emblem glow:** emblem lifts 4px, gains `drop-shadow(0 0 14px <hue> 55%)`,
   stitch ring animates a single slow rotation of its dash offset (1.6s, once).
3. **Characters react:** staggered 50ms from the captain outward, each does a
   tiny **ready-hop** (squash 4%, rise 6px, settle) and turns `facing:'front'`;
   the captain gives a two-finger **salute** (pose `celebrating` frame 1 held,
   or a dedicated `salute` if spec-cast exposes it — see Seams).
4. **Other rows dim** to 70% opacity — makes the hovered one the hero without
   moving anything else.
5. Cursor: pointer. Name gets no underline (the light *is* the affordance).

Leaving the row reverses in 180ms. `prefers-reduced-motion`: steps 1, 2 (glow
only, no lift/rotation) and 4 apply; no hop, no turn, no salute.

### 1.4 "+ New team" row

Always the **last** row, same height and anatomy, rendered as a ghost:
three **empty formation slots** (dashed silhouette outlines at 25% cream, the
center one with a `+`), a dashed floor ellipse, an **empty patch outline**
(dashed circle, no symbol) in place of the emblem, name "New team", blurb
"Gather a crew under a new flag." Hover: slots fill with a faint hue wash.
Click → creates a draft team and zooms straight into it (§2.7). The header
`+ New team` button does the same (it's the keyboard/top-of-page path; the row
is the discoverable path at the end of the list).

### 1.5 Empty & edge states

- **No teams:** only the New-team row, centered, with the line *"Teams let the
  director call a whole crew at once."*
- **Long names:** clamp to one line with ellipsis; full name in the zoom.
- **Responsive:** ≥1100px as drawn. 720–1099px: lineup shrinks (`sm` captain,
  `xs` others). <720px: row stacks — lineup on top (centered), emblem 56px
  inline with the name below.

---

## 2. Squad zoom — "the hero screen"

Route `#cast/teams/<id>`. Mirrors the **agent hero zoom** from `spec-cast.md`
one-for-one: **stage on the left (~58%), detail panel on the right (~42%,
max 480px)**, same panel chrome, same header slot, same motion. Only the stage
content differs (a squad instead of one hero).

### 2.1 Transition — camera push-in (FLIP, 520ms, `cubic-bezier(.2,.8,.2,1)`)

1. **0–200ms:** other rows and the tabs fade to 0 and drift 12px away
   (rows above go up, below go down) — the "camera" leaves them.
2. **0–520ms:** the clicked row's lineup FLIP-scales from its list position to
   the stage's formation (sizes swap `md→xl` captain, `sm→md` crew at the end
   frame; render final size and animate `transform` from the measured rect).
   The floor ellipse grows into the stage floor; the spotlight cone widens.
3. **120–520ms:** the emblem flies from the row into the panel header (FLIP),
   while a **giant copy of the emblem** fades in behind the squad as a banner
   watermark (360px, 7% opacity, `--team` thread only).
4. **200–520ms:** panel slides in from the right (24px + fade). Focus moves to
   the panel's team name heading.
5. **On arrival:** crew turn `facing:'front'`, a single ready-hop wave.

**Back** (`← Teams`, `Esc`, browser back): exact reverse in 420ms; focus
returns to the row that was opened. Reduced motion: 160ms cross-fade both ways,
no FLIP, no hop.

### 2.2 The stage (left)

```
┌──────────────────────────────────────────────┬──────────────────────────────┐
│ ← Teams                                      │ [ROCKET 64]  The Ship-It Squad│
│                  ╲  spotlight  ╱             │  Takes a feature from idea to │
│        ░░░░ giant emblem watermark ░░░░      │  demo — behind a flag…  ✎     │
│                                              │  ● ● ● ● ● ● ●   team color   │
│      (Pete)                    (Scar)        │ ───────────────────────────── │
│        md        ╭──────────╮    md          │ TEAM RULES                    │
│                  │ ★ CAPT.  │                │ ┌───────────────────────────┐ │
│                  │ SEMICOLON│ xl, front      │ │Ship behind a flag. Keep   │ │
│                  ╰──────────╯ armband ★      │ │main green. One demo…      │ │
│   ════════════ stage floor (team hue) ═════  │ └───────────────────────────┘ │
│                                              │ CREW  3/6                     │
│       Pixel Pete   Captain Semicolon  Scarlett│ (·) ★ Captain Semicolon  Backend >│
│        Frontend        Backend          QA   │ (·)   Pixel Pete         Frontend>│
│                                              │ (·)   Scarlett Scenario  QA     > │
│              [ + Add to crew ]               │ [ + Add to crew ]             │
│                                              │ The director briefs this team │
│                                              │ through its captain.          │
│                                              │                  ⋯ (Delete)   │
└──────────────────────────────────────────────┴──────────────────────────────┘
```

- **Formation** (slot table, positions relative to stage floor center, units
  = % of stage width; y up = further back):

  | Members | Slots (captain first, then member order) |
  |---|---|
  | 1 | C(0,0) |
  | 2 | C(0,0) · L1(−20,8) |
  | 3 | C(0,0) · L1(−22,8) · R1(+22,8) |
  | 4 | + L2(−38,16) |
  | 5 | + R2(+38,16) |
  | 6 | + B(0,22) (stands behind the captain, peeking over the shoulder) |

  Captain `xl`, others `md`; back slots at 94% scale per step. Everyone
  `facing:'front'` at rest; when a member is selected the others turn
  `three-quarter` toward them ("the crew looks at whoever you picked").
- **Name plates** under each character on the floor: name (14px/800) + effective
  role (12px, 70%). The captain's plate carries `★ Captain`.
- **Each character is a button** (`aria-label="Pixel Pete, Frontend. Edit on
  this team"`). Hover: small personal spotlight + hop. Click → selects the
  member (§2.5).
- `[ + Add to crew ]` sits on the floor at the front edge, ghost style; hidden
  at 6/6 (replaced by plate text "Crew full · 6/6").

### 2.3 The panel (right) — team view

Same chrome as the agent hero panel (cream panel `--panel` on the right, 24px
padding, section labels as small tracked caps, **auto-save** with a quiet
"Saved ✓" fading next to the section label; no Save button — matching the
agent zoom; if spec-cast chooses an explicit Save, follow it instead).

Top to bottom:

1. **Identity header**
   - **Emblem** `emblem(team, 64)` — it is a button: *"Change emblem"*. Opens
     the **emblem picker** popover anchored under it (§2.8).
   - **Name** — inline-editable `h2` (click/Enter to edit, Enter/blur saves,
     Esc reverts). Required; empty reverts with "Teams need a name".
   - **Blurb** — inline-editable, single field, **90-char** limit with a quiet
     counter appearing at 70+. Placeholder: *"What is this crew for, in one
     breath?"*
   - **Team color** — the 7 named swatches (Amber, Coral, Teal, Sky, Grape,
     Mint, Rose) as a radiogroup. Changing it live-retints: emblem thread,
     spotlight, floor, armband, watermark (200ms color transition).
2. **Team rules** — one textarea (the v2 team instructions): *"Every member
   reads this on top of their own brain."* 4 rows, grows to 10.
3. **Crew `3/6`** — member list mirroring the stage, same order (captain
   first): `hero(a,{size:'xs', pose:'idle', facing:'front'})` · name · `★`
   if captain · effective role · `›`. Row click = same as clicking the
   character on stage (§2.5). Keyboard: this list is the primary accessible
   path; the stage is the delightful one.
   `[ + Add to crew ]` at the end (same action as the stage button).
4. **One explanatory line** (calm, 13px, 70%): *"The director briefs this
   team through its captain."*
5. **Overflow `⋯`** (bottom right): `Duplicate team`, `Delete team`
   (confirm inline: "Delete The Ship-It Squad? Agents stay in your cast."
   [Delete] [Keep]). Deleting returns to the list with an Undo toast (6s).

### 2.4 Captain mark (specified once, used everywhere)

Captaincy must read at every size, and **never by color alone**:

- **md / xl (squad zoom, office):** an **armband** on the character's upper
  left arm in the **team hue**, with a small **5-point gold star** (`--sun`,
  1px `--ink` outline so it survives an Amber team) centered on it. Rendered
  by `hero()` via an `armband` option (Seams #1). The armband is the "game
  squad leader" read.
- **xs / sm (rows, lists, lineup picker):** the armband is too small, so a
  **star pip** floats above the head: 14px gold star in a 20px ink circle with
  a 2px team-hue ring, positioned at the hero's head anchor, 4px above the
  crown. (Owned by this spec as an overlay: `captainPip(hue)`.)
- **Text always accompanies it:** `★ Captain` on stage name plates,
  `★ Captain Semicolon` in row meta, "Captain" in accessible names.
- **Ceremony when captaincy changes:** old captain's armband slides off
  (150ms), new captain steps to the center slot (formation re-sorts, 420ms
  spring, everyone walks), armband snaps on with a gold sparkle + the crew
  does one cheer (`pose:'celebrating'`, 900ms) → settle `idle`. Live region:
  *"Scarlett Scenario is now captain of The Ship-It Squad."* Reduced motion:
  instant swap + the announcement.

### 2.5 Member sub-panel (click a member)

Clicking a member (stage character **or** crew row) **drills the panel in**
(slides left 24px + fade, 220ms) — the team view is one step back, like the
agent zoom's sub-views. On stage, the selected member **steps forward** one
step with their own spotlight; the rest dim to 60% and turn toward them.

```
┌──────────────────────────────────────┐
│ ← The Ship-It Squad                  │
│ (hero xs) Pixel Pete                 │
│           Frontend in the cast  ·  Open Pete's page ↗ │
│ ──────────────────────────────────── │
│ ROLE ON THIS TEAM                    │
│ ( Frontend•) ( Backend ) ( QA )      │
│ ( Design ) ( Writer ) ( DevOps ) …   │
│ ↺ Use cast role (Frontend)           │
│ ──────────────────────────────────── │
│ JOB ON THIS TEAM                     │
│ ┌──────────────────────────────────┐ │
│ │Own the storefront UI and the     │ │
│ │voice-search bar. Mock the API…   │ │
│ └──────────────────────────────────┘ │
│ Pete runs with: his own brain ▸      │
│ the team rules ▸ this job.           │
│ ──────────────────────────────────── │
│ [ ★ Make captain ]                   │
│ Remove from team                     │
└──────────────────────────────────────┘
```

- **Role on this team** — the role chips from `spec-cast.md`'s role list,
  single-select radiogroup. Default selection = the agent's cast role (shown
  with "cast role" hint). **Live gear swap:** on change, the stage character
  does a quick **poof** (sparkle ring 300ms, 1 spin of 180°→0 on Y) and
  re-renders via `hero(agent, {..., role: newRole})` so their gear/outfit
  changes in place; name plate role text updates. `↺ Use cast role` appears
  only when overridden. Reduced motion: instant re-render.
  *Decision:* role here is a **per-team override** (a "loadout" for this
  crew); the agent's own cast role is unchanged. Editing who Pete *is* lives
  on his hero page — linked, never duplicated.
- **Job on this team** — the per-member instructions textarea (v2
  `perMember`). Placeholder: *"What is Pete's job on this crew?"*
- **Context line** — one plain sentence naming the three layers. (Replaces
  v2's hover-only `▸▸▸` glyph.)
- **★ Make captain** — primary button in the team hue. If already captain the
  button becomes a non-interactive badge *"★ Captain of this crew"*.
- **Remove from team** — text button in coral. No confirm; the character
  **waves and walks off-stage** (to the right, 500ms), formation closes ranks,
  toast *"Pixel Pete left the crew · Undo"* (6s). Removing the **captain**:
  the next member in order is promoted automatically, with the captain
  ceremony and the line *"Scarlett Scenario is now captain."* Removing the
  last member is allowed; the team shows the empty slots (§2.7).
- **← back / Esc** returns to the team view; stage un-dims, member steps back.

### 2.6 Add to crew — lineup picker

`[ + Add to crew ]` (stage or panel) opens a **lineup strip** that rises from
the bottom of the **stage** (not a modal — the squad stays visible above it):

```
 ┌───────────────────────────────────── stage ──────────────────────────────┐
 │                (squad formation, nudged up 60px)                         │
 │══════════════════════════════════════════════════════════════════════════│
 │ Who joins the crew?            [ Search cast…  ]                  Done ✕ │
 │  (Doc)   (Lint)   (Merge)   (Baron)  (Query)  (Prof)  (Twinkle)   ›      │
 │  Doc H.  Sir L.   Madame M. Baron v. Querious Prof.P. Twinkle            │
 │  Writer  Quality  Release   DevOps   Data     Research Design            │
 └──────────────────────────────────────────────────────────────────────────┘
```

- Characters `size:'sm'`, `pose:'idle'`, `facing:'front'`, name + cast role
  only; agents already on this team are excluded. Horizontal scroll with `‹ ›`
  when needed; search field appears only if the cast has > 8 candidates.
- **Click a candidate → they hop out of the strip and walk into the next free
  formation slot** (420ms); the strip stays open for multiple adds; slot
  count updates `4/6`. The new member's job is empty; their crew row shows a
  soft "Give Querious a job" prompt (not an error).
- At 6/6 the strip closes itself with *"Crew full — the director can call
  more than one team."*
- Only existing cast members can be added (v2 rule: the cast is the source);
  the strip's last tile is a ghost `+ New agent` → opens the agent factory and
  returns here with the new agent added.
- `Done`, `Esc`, or clicking the stage closes the strip.
- **Max crew = 6.** It keeps the formation readable and matches how
  orchestrators should split work; the cap is stated, never silent.

### 2.7 New team (draft)

`+ New team` → zoom into a draft: emblem defaults to the next unused library
emblem, color to the next unused hue, name focused and empty (*"Name your
crew"*), the stage shows **three dashed empty slots** with a `+` in the center
one; clicking any slot opens the lineup picker. **The first member added
becomes captain** (ceremony plays — this is the team's "birth" moment, with
the v2 confetti). The draft is saved as soon as it has a name and one member;
leaving earlier discards it silently (nothing was created).

### 2.8 Emblem picker

Popover under the panel emblem: a **5×2 grid** of all 10 library emblems at
**56px**, rendered in the current team hue, each with its name under it
(12px). Radiogroup, arrow keys move, Enter/click selects, Esc closes. Hover
preview: the stage watermark and header emblem preview the hovered emblem;
leaving restores. Selecting plays a tiny **stamp** (scale 1.15 → 1, 200ms) on
the header emblem. Two teams **may** share an emblem (color + name still
separate them); the picker marks in-use emblems with a small dot +
"in use by Polish Patrol" in its tooltip, not a block.

### 2.9 Voice paths (every action has one)

Through the global one-press voice / clarifier:
"Open the Polish Patrol" · "Make Scarlett captain of Ship-It" · "Add Querious
to the Engine Room" · "Pete's job on Ship-It is the checkout page" · "Give
Polish Patrol the castle emblem" · "New team called Night Owls with Baron and
Querious". Voice edits play the same on-stage animation as clicks, so the user
*sees* what voice did.

---

## 3. Data model

### 3.1 `TEAMS` shape (replaces v2 `members[]` + `perMember{}` + emoji)

```js
{
  id:      'ship-it',
  name:    'The Ship-It Squad',
  blurb:   'Takes a feature from idea to demo — behind a flag, main kept green.', // ≤90 chars, shown on rows
  color:   'sun',            // one of the 7 palette keys
  emblem:  'rocket',         // EMBLEMS id (§5)
  captain: 'a-semic',        // must be one of members[].agent
  instr:   'Ship the feature behind a flag. …',   // team rules (v2 instr)
  members: [                 // ordered: formation order after the captain
    { agent:'a-semic', role:null,   instr:'Build /search + /checkout …' },
    { agent:'a-pete',  role:null,   instr:'Own the storefront UI …' },
    { agent:'a-scar',  role:null,   instr:'Write the test plan …' },
  ],
}
```

- `role: null` = use the agent's cast role; a role string = per-team override
  (drives `hero()` gear on every team surface: rows, zoom, office when the
  agent is working *for this team*).
- Invariants (enforced in one `setCaptain/removeMember` module): `captain ∈
  members`; `members.length ≤ 6`; no duplicate agents; if the captain is
  removed, `captain = members[0]?.agent ?? null`.
- An agent may be on **several** teams (each with its own role/job).
- Migration from v2: `members:[id]` + `perMember{id:text}` → `members:[{agent,
  role:null, instr}]`; `emblem:'🚀'` → emblem id; add `blurb`, `captain`.

### 3.2 Assignments

| Team | color | emblem | captain | crew (order) | blurb |
|---|---|---|---|---|---|
| **The Ship-It Squad** | sun | `rocket` Moonshot | Captain Semicolon | Semicolon, Pixel Pete, Scarlett Scenario | Takes a feature from idea to demo — behind a flag, main kept green. |
| **The Polish Patrol** | mint | `castle` Enchanted Keep | Sir Lint-a-lot | Sir Lint-a-lot, Doc Hollywood, Twinkle | No new features. Tidies, de-dupes and documents until it all shines. |
| **The Engine Room** *(new demo)* | grape | `cogcrest` Iron Cog | Baron von Backup | Baron, Madame Mergeworthy | Branches, releases, deploys, backups. Ships calmly, rolls back calmer. |
| **The Expedition** *(new demo)* | teal | `compass` Treasure Compass | Professor Prompt | Prof. Prompt, Querious, Twinkle | Maps the unknown: researches the ask, measures what matters first. |

Team rules / per-member jobs for Ship-It and Polish: verbatim from v2
`spec-factory.md` §4.2. New ones:

- **Engine Room** rules: *"Nothing ships without a rollback. Main stays
  green. Deploy to preview first, announce before production."*
  Baron — *"Own deploys and backups. Keep a rollback ready for every
  release."* · Madame Mergeworthy — *"Cut release branches, squash with grace,
  write the changelog."*
- **Expedition** rules: *"No code. Bring back a crisp brief: what we learned,
  what to measure, what it could look like."*
  Prof. Prompt — *"Clarify the ask and cite sources. Hand the director one
  page."* · Querious — *"Define the one metric that proves it worked."* ·
  Twinkle — *"Sketch two directions; cut everything that doesn't earn its
  place."* (`role:'Research'` override — demonstrates the loadout swap: her
  beret + brush trade for the Research gear on this team only.)

Twinkle on two teams and the Engine Room's 2-member crew are deliberate: they
demo multi-team membership and a small formation.

---

## 4. Accessibility

- **Rows:** each is a single `<button>` (or `<a href="#cast/teams/id">`) with
  accessible name *"The Ship-It Squad. 3 members, captain Captain Semicolon.
  Takes a feature from idea to demo…"*. Lineup and emblem inside are
  `aria-hidden` (the name carries it). ↑/↓ moves between rows; Enter opens.
- **Hover = focus-visible:** identical highlight; plus a 3px cream focus ring
  around the row (offset 6px, radius 28px) since glow alone is not a ring.
- **Zoom:** focus moves to the team name heading; `Esc` backs out one level
  (picker → member → team → list); focus returns to the invoking element at
  each level. Stage characters are buttons in formation order; the panel crew
  list is the equivalent linear path.
- **Emblems:** `emblem()` returns `role="img"` with `aria-label="Moonshot
  emblem"`; when shown next to the team name it's `aria-hidden`. Thread hues on
  the cloth (`--bg-2`) clear **3:1** non-text contrast for all 7 hues (Grape is
  the lowest, ≈4.1:1). Emblems never carry meaning alone — the name is always
  adjacent.
- **Captain:** star + armband + the word "Captain" in plates, meta and
  accessible names — never color alone.
- **Live region** (`aria-live="polite"`): captain changes, member added/
  removed (with Undo reachable by keyboard for 6s, focus not stolen), role
  swaps (*"Twinkle's role on The Expedition: Research"*), saved state.
- **Forms:** every field has a visible label; color swatches and role chips
  are radiogroups with names ("Color Amber", "Role QA"); the 90-char blurb
  counter is `aria-describedby`.
- **Targets:** ≥ 44px for rows, characters, chips, swatches, emblem tiles.
- **Reduced motion:** cross-fades replace push-in/FLIP; no hops, salutes,
  walks, poofs or watermark motion; all states remain readable frozen
  (spotlight is a static glow, captain swap is instant + announced).

---

## 5. Emblem library

### 5.1 Interface

```js
// EMBLEMS: [{ id, name, vibe, svg }]  — svg = inner markup for viewBox 0 0 64 64
emblem(team, size = 48) → HTMLElement
//   team: a TEAMS entry or { emblem, color }
//   size: px. ≤ 32 adds .em-sm (drops stitch ring + fine details for crispness)
//   returns <span class="emblem [em-sm]" role="img" aria-label="<name> emblem"
//            style="--team:<PALETTE[color]>; width:size; height:size">
//              <svg viewBox="0 0 64 64">…</svg></span>
captainPip(hue) → HTMLElement   // the xs/sm captain star overlay (§2.4)
```

Usage sizes: **24** (office desk tags, crew-row chips) · **32** (dense lists)
· **56** (picker) · **64** (panel header) · **88** (list rows) · **360**
(zoom watermark at 7% opacity).

### 5.2 Patch construction (shared by all 10)

Each emblem is an **embroidered patch**: **cloth** (the silhouette, filled
`currentColor` = dark twilight) → **rim** (a 2.5px thread border inset ~3px)
→ **stitch ring** (dashed thread, inset ~6px) → **symbol** (solid thread).
Only two colors exist: `currentColor` (cloth) and `--team` (thread), so any
team hue works and it always reads as one object. Silhouettes vary on purpose
(oval, circle, cog, shield, arch, wings, octagon, hexagon) so emblems differ
even as tiny shapes.

Define once (CSS):

```css
.emblem{display:inline-block;color:var(--bg-2);line-height:0}   /* cloth */
.emblem svg{width:100%;height:100%;overflow:visible}
.emblem .cloth  {fill:currentColor}
.emblem .halo   {stroke:currentColor;stroke-width:3;stroke-linejoin:round}
.emblem .thread {fill:var(--team)}
.emblem .line   {fill:none;stroke:var(--team);stroke-width:2.5;stroke-linejoin:round;stroke-linecap:round}
.emblem .stitch {fill:none;stroke:var(--team);stroke-width:1.2;stroke-dasharray:2.2 2;opacity:.75}
.emblem .cutline{fill:none;stroke:currentColor;stroke-width:1.4;stroke-linecap:round}
.emblem.em-sm .stitch,.emblem.em-sm .detail{display:none}
```

All ten were rendered and checked at 24px and 160px on `--bg-0` in all seven
hues. **Originality note:** each is an original composition that *evokes* a
genre (chevrons, a rising bird, a cog crest, a castle, a compass…); none
traces or reproduces an existing insignia, logo or trademark — keep it that
way when iterating (no Starfleet arrowhead-with-swoosh, no Rebel/Imperial
crest geometry, no studio castle logo).

### 5.3 The ten emblems

#### 1. `starship` — Warp Chevrons
*Silhouette:* oval. *Evokes:* Starship bridge-crew insignia: twin up-chevrons climbing toward a guiding star. "Engage." For crews that push forward fast.

```html
<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <ellipse class="cloth" cx="32" cy="32" rx="27" ry="30"/>
  <ellipse class="line" cx="32" cy="32" rx="24" ry="27"/>
  <ellipse class="stitch" cx="32" cy="32" rx="20.5" ry="23.5"/>
  <path class="thread" d="M32 12 L46 30 L39 30 L32 21 L25 30 L18 30Z"/>
  <path class="thread" d="M32 26 L46 44 L39 44 L32 35 L25 44 L18 44Z"/>
  <path class="thread detail" d="M32 47.5 L33.2 50.3 L36 51.5 L33.2 52.7 L32 55.5 L30.8 52.7 L28 51.5 L30.8 50.3Z"/>
</svg>
```

#### 2. `starbird` — Phoenix Rising
*Silhouette:* circle. *Evokes:* Rebel-starbird spirit: an angular firebird with swept wings and a split tail. Scrappy, hopeful, rises again after a red build.

```html
<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <circle class="cloth" cx="32" cy="32" r="30"/>
  <circle class="line" cx="32" cy="32" r="27"/>
  <circle class="stitch" cx="32" cy="32" r="23.5"/>
  <path class="thread" d="M30 27 L14 17 L19 26 L11.5 30 L20 33.5 L15 40.5 L30 38.5Z M34 27 L50 17 L45 26 L52.5 30 L44 33.5 L49 40.5 L34 38.5Z"/>
  <path class="thread" d="M32 19 L35 24 L34.5 41 L32 45 L29.5 41 L29 24Z"/>
  <path class="thread" d="M32 13 A3.5 3.5 0 1 1 31.9 13Z M35 15 L38.5 16.5 L35 18Z"/>
  <path class="thread" d="M32 41 L25.5 54 L32 49.5 L38.5 54Z"/>
</svg>
```

#### 3. `cogcrest` — Iron Cog
*Silhouette:* 10-tooth cog. *Evokes:* Imperial engine-room crest: a toothed gear ring around a bolted hex core. Disciplined, mechanical, runs the machine.

```html
<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <path class="cloth" d="M26.6 6.6 L28.6 2.2 L35.4 2.2 L37.4 6.6 L42.6 8.2 L46.8 5.9 L52.3 9.9 L51.3 14.6 L54.5 19.0 L59.3 19.6 L61.4 26.0 L57.9 29.3 L57.9 34.7 L61.4 38.0 L59.3 44.4 L54.5 45.0 L51.3 49.4 L52.3 54.1 L46.8 58.1 L42.6 55.8 L37.4 57.4 L35.4 61.8 L28.6 61.8 L26.6 57.4 L21.4 55.8 L17.2 58.1 L11.7 54.1 L12.7 49.4 L9.5 45.0 L4.7 44.4 L2.6 38.0 L6.1 34.7 L6.1 29.3 L2.6 26.0 L4.7 19.6 L9.5 19.0 L12.7 14.6 L11.7 9.9 L17.2 5.9 L21.4 8.2Z"/>
  <circle class="line" cx="32" cy="32" r="22"/>
  <path class="line detail" style="stroke-width:1.4" d="M26.6 6.6 L28.6 2.2 L35.4 2.2 L37.4 6.6 L42.6 8.2 L46.8 5.9 L52.3 9.9 L51.3 14.6 L54.5 19.0 L59.3 19.6 L61.4 26.0 L57.9 29.3 L57.9 34.7 L61.4 38.0 L59.3 44.4 L54.5 45.0 L51.3 49.4 L52.3 54.1 L46.8 58.1 L42.6 55.8 L37.4 57.4 L35.4 61.8 L28.6 61.8 L26.6 57.4 L21.4 55.8 L17.2 58.1 L11.7 54.1 L12.7 49.4 L9.5 45.0 L4.7 44.4 L2.6 38.0 L6.1 34.7 L6.1 29.3 L2.6 26.0 L4.7 19.6 L9.5 19.0 L12.7 14.6 L11.7 9.9 L17.2 5.9 L21.4 8.2Z"/>
  <circle class="stitch" cx="32" cy="32" r="18.5"/>
  <path class="thread" d="M32 20 L42.4 26 L42.4 38 L32 44 L21.6 38 L21.6 26Z"/>
  <circle class="cloth" cx="32" cy="32" r="5"/>
  <path class="cutline detail" d="M32 20 V27 M42.4 38 L36.3 34.5 M21.6 38 L27.7 34.5"/>
</svg>
```

#### 4. `castle` — Enchanted Keep
*Silhouette:* heater shield. *Evokes:* Fairytale-kingdom crest: three-spired castle with an arched gate and a wishing star. Guardians of a tidy realm.

```html
<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <path class="cloth" d="M7 7 H57 V30 C57 46 46 56 32 61 C18 56 7 46 7 30Z"/>
  <path class="line" d="M10.5 10.5 H53.5 V30 C53.5 44 44 52.5 32 57.3 C20 52.5 10.5 44 10.5 30Z"/>
  <path class="stitch" d="M14 14 H50 V30 C50 41.5 42 48.5 32 53.2 C22 48.5 14 41.5 14 30Z"/>
  <path class="thread" d="M20 37 H44 V44 Q32 50 20 44Z M20 37 V30 H25 V37Z M39 37 V30 H44 V37Z M28 37 V26 H36 V37Z"/>
  <path class="thread" d="M19 30 L22.5 23 L26 30Z M38 30 L41.5 23 L45 30Z M27 26 L32 17 L37 26Z"/>
  <path class="cloth" d="M29.5 47 V42.5 Q32 39.5 34.5 42.5 V47Z"/>
  <path class="thread detail" d="M45 15.5 L46 18 L48.5 19 L46 20 L45 22.5 L44 20 L41.5 19 L44 18Z"/>
</svg>
```

#### 5. `compass` — Treasure Compass
*Silhouette:* circle. *Evokes:* Treasure-map adventure: an eight-point compass rose with shaded points. Explorers, researchers, "X marks the spot".

```html
<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <circle class="cloth" cx="32" cy="32" r="30"/>
  <circle class="line" cx="32" cy="32" r="27"/>
  <circle class="stitch" cx="32" cy="32" r="23.5"/>
  <path class="thread" d="M18 18 L32 28 L46 18 L36 32 L46 46 L32 36 L18 46 L28 32Z"/>
  <path class="cloth halo" d="M32 10 L36 28 L54 32 L36 36 L32 54 L28 36 L10 32 L28 28Z"/>
  <path class="thread" d="M32 10 L36 28 L54 32 L36 36 L32 54 L28 36 L10 32 L28 28Z"/>
  <path class="cloth detail" d="M32 10 L32 32 L28 28Z M54 32 L32 32 L36 28Z M32 54 L32 32 L36 36Z M10 32 L32 32 L28 36Z"/>
  <circle class="cloth" cx="32" cy="32" r="2.6"/>
</svg>
```

#### 6. `lantern` — Wishing Lantern
*Silhouette:* arched badge. *Evokes:* Floating-lantern festival: a glowing lantern with an inner flame and light rays. Lights up dark corners; night shift.

```html
<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <path class="cloth" d="M9 59 V29 A23 23 0 0 1 55 29 V59Z"/>
  <path class="line" d="M12.5 55.5 V29 A19.5 19.5 0 0 1 51.5 29 V55.5Z"/>
  <path class="stitch" d="M16 52 V29 A16 16 0 0 1 48 29 V52Z"/>
  <path class="line" d="M29.5 19.5 Q32 15 34.5 19.5"/>
  <path class="thread" d="M27 23 L29 19 H35 L37 23Z M25 24 H39 L41 40 Q32 44 23 40Z M27 42 H37 L35 46 H29Z"/>
  <path class="cloth" d="M32 27 C35.5 31 35.5 35 32 38.5 C28.5 35 28.5 31 32 27Z"/>
  <path class="thread detail" d="M32 32 C33.6 34 33.4 36 32 37.2 C30.6 36 30.4 34 32 32Z"/>
  <path class="line detail" d="M19.5 30 L16 29 M19.5 36 L16 37 M44.5 30 L48 29 M44.5 36 L48 37"/>
</svg>
```

#### 7. `ranger` — Ranger Wings
*Silhouette:* winged roundel. *Evokes:* Space-ranger wings: feathered pilot wings around a ringed planet. "To the next galaxy." Bold, heroic, a little toy-box.

```html
<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <path class="cloth" d="M22 21 L1 16 L5.5 25 L0.5 28.5 L6.5 33.5 L2.5 38 L22 41Z M42 21 L63 16 L58.5 25 L63.5 28.5 L57.5 33.5 L61.5 38 L42 41Z"/>
  <path class="thread" d="M22 24.5 L7 21 L10 26.5 L6 29 L11 33 L8 36 L22 37.5Z M42 24.5 L57 21 L54 26.5 L58 29 L53 33 L56 36 L42 37.5Z"/>
  <path class="cutline detail" d="M10 26.5 L21 29 M11 33 L21 33.5 M54 26.5 L43 29 M53 33 L43 33.5"/>
  <circle class="cloth" cx="32" cy="31" r="16.5"/>
  <circle class="line" cx="32" cy="31" r="13.5"/>
  <ellipse class="line" cx="32" cy="31" rx="10" ry="3.6" transform="rotate(-20 32 31)" style="stroke-width:2"/>
  <circle class="thread" cx="32" cy="31" r="5.5"/>
  <path class="cloth halo" d="M22.6 34.4 A10 3.6 -20 0 0 41.4 27.6" style="fill:none;stroke-width:4"/>
  <path class="line" d="M22.6 34.4 A10 3.6 -20 0 0 41.4 27.6" style="stroke-width:2"/>
</svg>
```

#### 8. `carpet` — Moon & Carpet
*Silhouette:* circle. *Evokes:* Desert-night magic: a crescent moon and a star over a flying carpet with tassels. Clever, quick, a whole new world of shortcuts.

```html
<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <circle class="cloth" cx="32" cy="32" r="30"/>
  <circle class="line" cx="32" cy="32" r="27"/>
  <circle class="stitch" cx="32" cy="32" r="23.5"/>
  <circle class="thread" cx="29" cy="22" r="9"/>
  <circle class="cloth" cx="33.5" cy="18.5" r="7.8"/>
  <path class="thread detail" d="M44 21 L45 23.5 L47.5 24.5 L45 25.5 L44 28 L43 25.5 L40.5 24.5 L43 23.5Z"/>
  <path class="thread" d="M14 40 C20 36 26 42 32 38 C38 34 44 40 50 36 L50 44 C44 48 38 42 32 46 C26 50 20 44 14 48Z"/>
  <path class="cutline detail" d="M17 44.2 C22 41.2 27 45.2 32 42.2 C37 39.2 42 43.2 47 40.2"/>
  <path class="line" d="M14 40 L11 38.5 M14 48 L11 49.5 M50 36 L53 34.5 M50 44 L53 45.5" style="stroke-width:1.6"/>
</svg>
```

#### 9. `rocket` — Moonshot
*Silhouette:* octagon. *Evokes:* Retro moonshot: a finned rocket punching through an orbit ring with an exhaust flame. Launch crews and shippers.

```html
<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <path class="cloth" d="M20 3 H44 L61 20 V44 L44 61 H20 L3 44 V20Z"/>
  <path class="line" d="M21.5 6.5 H42.5 L57.5 21.5 V42.5 L42.5 57.5 H21.5 L6.5 42.5 V21.5Z"/>
  <path class="stitch" d="M23 10 H41 L54 23 V41 L41 54 H23 L10 41 V23Z"/>
  <ellipse class="line" cx="32" cy="34" rx="18" ry="5.5" transform="rotate(-18 32 34)" style="stroke-width:2"/>
  <path class="cloth halo" d="M32 12 C38 18 39 28 37 40 H27 C25 28 26 18 32 12Z M27 33 L21 42 L27 41Z M37 33 L43 42 L37 41Z"/>
  <path class="thread" d="M32 12 C38 18 39 28 37 40 H27 C25 28 26 18 32 12Z M27 33 L21 42 L27 41Z M37 33 L43 42 L37 41Z"/>
  <circle class="cloth" cx="32" cy="25" r="3.3"/>
  <path class="thread" d="M28.5 42 H35.5 L32 50.5Z"/>
  <path class="cloth halo detail" d="M15.5 39.4 A18 5.5 -18 0 0 21 43" style="fill:none;stroke-width:4"/>
</svg>
```

#### 10. `twinsuns` — Twin Suns
*Silhouette:* hexagon. *Evokes:* Desert-planet horizon: two suns setting over rolling dunes. Restless, far-from-home heroes about to leave the farm.

```html
<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <path class="cloth" d="M17 5 H47 L61.5 32 L47 59 H17 L2.5 32Z" style="stroke-width:3;stroke:currentColor;stroke-linejoin:round"/>
  <path class="line" d="M18.8 8.5 H45.2 L57.6 32 L45.2 55.5 H18.8 L6.4 32Z"/>
  <path class="stitch" d="M20.6 12 H43.4 L54 32 L43.4 52 H20.6 L10 32Z"/>
  <circle class="thread" cx="26" cy="27" r="6.5"/>
  <circle class="thread" cx="40.5" cy="21.5" r="4"/>
  <path class="thread" d="M13 41 C20 35.5 27 38 33 40.5 C39 43 45 37 51 38.5 L45.5 48.5 H18.5Z"/>
  <path class="cutline detail" d="M19 45.5 C26 42.5 34 46.5 44 43.5"/>
</svg>
```

---

## 6. Cut list vs v2

| v2 element | v3 |
|---|---|
| White `teamcard` + `.troupe` badge (rounded white card, ring, faces, corner chips) | **Cut.** Characters stand on the stage; identity = emblem + name. |
| Emoji emblems (`🚀 🧹` + emoji picker) | **Cut.** Replaced by the 10-patch SVG library. |
| Full team instructions on the list card | **Cut** to a ≤90-char `blurb`; rules live in the zoom. |
| "Summonable as one unit ✓ · members solo ✓" lines | **Cut.** True by definition; the captain line explains how the director calls a team. |
| Team mood rollup ring / `!` on library teams | **Cut** here. Live state belongs to the Office. |
| Separate Factory "Assemble a troupe" screen + `🎬 Save team` | **Merged** into the squad zoom; auto-save; confetti only on a team's birth. |
| 🎲 name dice | **Cut** (voice "surprise me with a name" covers it). |
| `▸▸▸` context glyph (hover-only) | **Replaced** by one visible sentence in the member sub-panel. |
| Agent picker as a modal sheet of definition cards + loglines | **Replaced** by the in-stage lineup strip (name + role only). |
| Team search field | **Cut** until there are > 8 teams. |

---

## 7. Seams for synthesis (with `spec-cast.md`)

1. **`hero()` options this spec needs:** `role` (render gear for an override
   role without mutating the agent) and `armband: <hex>` (captain armband,
   md/xl). If spec-cast prefers, these can be one `overlay` hook — but the
   armband should be drawn *on* the arm, not floated.
2. **Salute pose** (hover reaction) — optional; falls back to
   `celebrating` frame 1 held 400ms.
3. **Head anchor** (`hero` exposes the crown point per size) so `captainPip`
   lands correctly.
4. **Panel chrome + save model** must be identical between agent zoom and squad
   zoom (whichever spec-cast settles: auto-save assumed here).
5. **Role list** comes from spec-cast (single source); this spec only renders it.
6. **Office reuse:** desks/team zones show `emblem(team, 24)`; captains wear
   the armband there too, so the captain is findable in the office.
