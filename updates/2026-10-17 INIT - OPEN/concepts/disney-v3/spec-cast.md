# Disney v3 — Cast → Agents + Character System v3 (CANONICAL)

**Owner:** Cast / character design
**Status:** CANONICAL. §1 replaces `disney-v2/spec-factory.md` §1.2–§1.5 (gumdrop
`castSVG`, traits, props, director hat). Palette (§1.1 there), the "state lives in
the frame too" rule, and motion tokens carry over. **Every screen renders
characters through `hero()` (§1.6)**: Agents roster, Teams (`spec-teams.md`), the
Office (`spec-office.md`), Projects mini-casts.
**Source:** `user-feedback-v3.md` ("look like characters from the games", "adjusts
something visually on them based on their role", "zooms in on that person").

The rule for v3: **who you are = hue + build + hair + accessory. What you do =
role gear (outfit, headgear, tool, badge).** Change the role and the costume
changes. The person stays the same.

---

## 1. Character system v3

### 1.1 Proportions and canvas
- One SVG per character, **`viewBox="0 0 120 160"`**, ground line **y=152**, feet
  centred on **x=60**. The rendered width is always **0.75 × height**.
- Chibi game proportions: the head is about 40% of the height, with a **separate
  torso, two arms and two legs with shoes**. Legs and a real torso are what turn
  the v2 gumdrop into a silhouette you can tell apart at a glance.
- **Ink outline.** Every skin, outfit and gear shape gets a stroke of `#241a44`
  (`--ink`), `stroke-width: var(--ol)`, `stroke-linejoin: round`. `--ol` is 3 by
  default and 4.5 at `xs`. This keeps grape and sky characters readable on the
  dark stage, and it is the main thing that makes them look like game sprites.
- Colours: skin = the agent hue. `light = shade(c,+22)` for hands, belly sheen
  and the head highlight. `dark = shade(c,-26)` for brows and limb shading. Role
  gear uses the role accent (§1.4) plus four neutral **materials** (the only new
  colours allowed, because gear is not a character hue):
  `MAT = { metal:'#c9c3dd', steel:'#8e86ad', wood:'#b9773f', paper:'#fff6e9' }`.
  Outfit cloth = `shade(roleAccent,-70)` with `roleAccent` used for trim. This
  is a formula, so no new hues appear.

### 1.2 Builds (silhouettes): 4, a personal trait
Every build exposes the same **anchors**. All gear is authored against anchors,
so any gear fits any build.

| build | feel | head c / r | torso (x,y,w,h, rx) | leg len / w | shoulders |
|---|---|---|---|---|---|
| `hero` | default, balanced | (60,52) / 30 | 40,82,40,42, 14 | 26 / 12 | y 88 |
| `sprout` | small, round, cute | (60,64) / 32 | 41,94,38,32, 16 | 18 / 12 | y 100 |
| `bruiser` | wide shoulders, big | (60,48) / 27 | 32,74,56,48, 18 | 24 / 15 | y 80 |
| `lanky` | tall, thin, long legs | (60,38) / 26 | 44,64,32,52, 12 | 34 / 10 | y 70 |

`ANCHORS[build] = { head:{cx,cy,r}, torso:{x,y,w,h}, shoulderF:{x,y},
shoulderB:{x,y}, hip:{y}, chest:{x,y} }`. Legs hang from `hip.y` at x=60±w*0.6.
Torso and head use the hue. Shoes (ovals 16×8 at the ground) use `--ink`.

### 1.3 Anatomy and SVG group contract (z-order back → front)
Class names are a public contract. The Office and Teams specs animate and target
them, so they must not be renamed.
```
<div class="hero size-md pose-idle face-3q dir-r [lod-xs] [is-captain]" style="--hue:…">
 <svg viewBox="0 0 120 160" aria-hidden="true">
  <ellipse class="h-shadow" cx="60" cy="152" rx="26" ry="5"/>      18% black
  <g class="h-rig">                       transform-origin 60px 152px (feet)
   <g class="h-arm h-arm-b">             back arm: capsule + light hand circle
     <g class="h-tool"/>                 ROLE TOOL, hand-local coords
   </g>
   <g class="h-legs"><g class="h-leg h-leg-b"/><g class="h-leg h-leg-f"/></g>
   <g class="h-torso"> skin shape + <g class="h-outfit"/> + <g class="h-badge"/></g>
   <g class="h-head">                    transform-origin at neck (head.cx, head.cy+r)
     head circle + top-left light sheen
     <g class="h-hair"/>
     <g class="h-face">                  shifted by facing (§1.7)
       eyes: .h-eye.near/.far (white, r 8 @hero) > .h-pupil (r 4) + .h-catch (r 1.4 white)
       .h-lid ×2 (skin colour, scaleY 0 → 1), .h-brow ×2, .h-blush ×2 (rose 50%)
       .h-mouth[data-m]                  one path, d swapped per pose (§1.5)
     </g>
     <g class="h-acc"/>                  personal accessory (eye line or cheek)
     <g class="h-headgear"/>             ROLE HEADGEAR, head-local coords
   </g>
   <g class="h-arm h-arm-f"> capsule + hand + <g class="h-prop"/> </g>  pose prop
  </g>
 </svg>
 <div class="h-fx" aria-hidden="true"></div>   HTML overlay: "!" badge, Zz, ✦
</div>
```
**Coordinate spaces** (so gear composes):
- **Head-local** (`h-headgear`, `h-hair`, `h-acc`): origin at the head centre,
  head radius normalised to 30, +y down. Wrap in
  `translate(cx,cy) scale(r/30)`. The eye line is y=+4 and the eyes sit at x=±11.
  Headgear must **break the head outline by at least 6 units**. That is what
  carries role at 48px.
- **Hand-local** (`h-tool`, `h-prop`): origin at the hand centre. The tool's long
  axis points up (−y), with length ≥ 34 units (about 0.2 × height). It rotates
  with the arm.
- **Torso-local** (`h-outfit`, `h-badge`): authored on a 40×42 torso, scaled
  `scale(w/40, h/42)`. The badge is a circle (r 7) at `chest`, filled with
  `roleAccent`, with an ink glyph.
- Arms: one rubber-hose capsule (w 11, length 26) rotating about the shoulder
  (`transform-origin` = shoulder anchor) and a hand circle (r 6.5, `light`). At
  rest the arms hang 12° out from the body.

### 1.4 Role → gear (the 10 roles, plus Director)
Swapping role swaps four layers: `outfit`, `headgear`, `tool` and `badge`.
Accents may repeat across roles. The **headgear shape and the tool** are what
identify a role, never the colour.

| Role | accent | Headgear (silhouette break) | Outfit | Tool (back hand) | Badge glyph |
|---|---|---|---|---|---|
| **Frontend** | teal | big over-ear **headphones**: band arc r34 above the head, cups 10×18 at x=±31 | hoodie with a hood rim behind the neck, teal drawstrings | giant **pencil/stylus**: wood body, paper-coloured cone, teal tip | `</>` |
| **Backend** | sky | **welding goggles** pushed up on the forehead: strap across y=−18, two round metal lenses r8 sticking up | overalls: bib + two straps, metal buttons | big **cog** (8 teeth, r12, steel) | ⚙ (small cog) |
| **Design** | rose | **beret** tilted 15°, nub on top, overhanging the right edge by 10 | painter's smock, three paint dots | **palette** (wood kidney shape, 4 hue dots) + brush | pen nib |
| **QA** | coral | **deerstalker** with side flaps at x=±30 | trench collar (two lapel triangles) | **magnifier** (metal ring r10, glass at 30% white) | bug |
| **Data** | mint | **miner's headband lamp**: band at y=−14, lamp disc r7 at the front, short light wedge at 20% mint | vest with pockets | **pickaxe** (wood handle, steel head 30 wide), the "data miner" | 3 bars |
| **DevOps** | sun-deep | **hard hat**: dome to y=−36, full brim 72 wide, centre ridge | hi-vis vest: two sun stripes | **wrench** (steel, open jaw) | ∞ loop |
| **Research** | grape | **mortarboard**: flat diamond 64 wide at y=−30, tassel hanging right | cardigan with elbow patches | **open book** (two paper pages, ink lines) | lightbulb |
| **Writer** | sun | **newsboy cap** with a short peak to the right and a **quill tucked behind the ear** (sticking up 14) | waistcoat + scarf tail | **giant quill** (paper feather, ink nib) | ¶ |
| **Release** | grape | **captain's peaked cap**: white crown, ink peak, sun anchor pin | double-breasted coat, two rows of sun buttons | **flag on a pole** (coral pennant, pole 44) | flag |
| **Quality** | mint | **knight's round helm** with the visor up, sitting on top, and a **plume** curling back 18 | tabard with a centre stripe | **broom-lance**: long wood shaft, straw head | ✦ sparkle |
| *Director* (not in picker) | sun | the v2 director cap (dark crown, sun band), scaled into head-local space | sash across the torso | **megaphone** | ▲ |

Authoring rule: each gear item is a small function in `GEAR[role] = { outfit(ctx),
headgear(ctx), tool(ctx), badge(ctx) }`, where `ctx = {c, dark, light, accent, cloth,
MAT}` and the function returns an SVG string. Builders draw Frontend, DevOps and
Quality first. They are the reference set for the "breaks the outline" rule.

**Captain.** `opts.captain:true` (Teams spec) adds a sun **star pin** (r 6) on the
front shoulder and a 2px sun ring on `.h-shadow`. It stacks on any role.

### 1.5 Personal identity (separate from role, never changes with role)
- `hue`: one of the 7 (`sun coral teal sky grape mint rose`), with names from
  `COLOR_NAMES`.
- `build`: `hero | sprout | bruiser | lanky`.
- `hair` (head-local, drawn *under* headgear, peeking out at the sides and front):
  `none · tuft · spikes · swoop · bob · bun · curl`. Hair colour is `shade(c,-45)`.
- `accessory` (eye line or cheek only, never the crown zone):
  `none · glasses · shades · monocle · mustache · bow · freckles · flower`.

**Mouths** (`.h-mouth` d, head-local): `smile`, `focus` (flat-curve), `talkA`/`talkB`
(open oval / closed), `worried`, `grin` (wide open D), `o` (small sleep
circle), `tongue` (focus + a coral tongue dot, used for writing), `flat`.

### 1.6 THE render interface (others call only this)
```js
hero(agent, {
  size:   'xs'|'sm'|'md'|'xl' | <number px height>,  // default 'sm'
  pose:   'idle'|'walking'|'typing'|'writing'|'reading'|'carrying'|
          'talking'|'chilling'|'sleeping'|'celebrating'|'needs-input', // default 'idle'
  facing: 'side'|'three-quarter'|'front',              // default 'three-quarter'
  dir:    'right'|'left',                              // default 'right' (mirror)
  look:   null | 'viewer' | {x:-1..1, y:-1..1},        // pupil aim; front ⇒ 'viewer'
  seated: false,     // hides legs, drops rig 18 units: office desks, couch
  props:  true,      // draw pose props (laptop, book, mug…); false if scene supplies them
  captain:false,
  ghost:  false,     // dashed outline silhouette (the "+ New" slot)
  label:  false      // true ⇒ role="img" + aria-label "<name>, <role>, <pose text>"
}) → HTMLDivElement.hero

heroSVG(agent, opts) → string                    // same, as markup
setPose(el, pose, {seated, props}?)              // in-place: swaps classes + .h-prop/.h-fx, no re-render
setFacing(el, facing, {dir, look}?)              // in-place, animated 250ms (head turn)
setLook(el, {x,y}|'viewer')                      // sets --lx/--ly on el
POSES, FACINGS, ROLES, ROLE_GEAR, BUILDS, HAIR, ACCESSORIES   // exported lists
MOOD_TO_POSE = {neutral:'idle', idle:'idle', working:'typing',
                blocked:'needs-input', celebrate:'celebrating'}  // v2 shim
```
`agent` needs only `{name, role, hue, build, hair, accessory}`. Unknown or missing
fields fall back to `hero/none/none`. An unknown role renders without gear.

**Size tokens** (height): `--hero-xs:48px` (office, team stacks, project cards),
`--hero-sm:96px` (mobile roster, team rows), `--hero-md:160px` (roster),
`--hero-xl:360px` (hero zoom). The class `lod-xs` is applied automatically below
64px. It **hides** the badge, blush, hair strands and outfit trim, raises `--ol`
to 4.5, and **keeps** the headgear, tool, eyes and catch-light. Pixar rule: the
catch-light never goes.

### 1.7 Facing and eyes
Facing changes the `.h-face` transform and the eyes only. The body stays the
same, so the turn is cheap and can be animated. `transition: transform .25s
var(--spring)` on `.h-face`, `.h-eye` and `.h-pupil`.
- `front`: face centred, both eyes the same size, pupils centred, so the
  character looks straight at you. **Used when the user chats with that agent.**
  It forces `look:'viewer'` (`--lx:0; --ly:0`) and turns both arms to rest
  symmetric.
- `three-quarter` (default): `.h-face` translateX(+6 head-local), far eye
  `scaleX(.8)`, pupils resting at `--lx:.35`.
- `side`: `.h-face` translateX(+14), far eye `opacity:0`, near eye `scaleX(.85)`,
  blush on the near side only. Use it for walking and for talking to a neighbour.
- `dir:'left'` mirrors `.h-rig` with `scale(-1,1)` around x=60. Badge glyphs and
  the `h-fx` overlay are counter-flipped, so text never mirrors.
- Pupils: `transform: translate(calc(var(--lx)*3.5px), calc(var(--ly)*3px))` (SVG
  user units). Callers aim with `setLook`. The Office uses this to make agents
  look at whoever is talking.

### 1.8 Poses (concrete)
Each pose sets a class `pose-<name>` on `.hero`. A pose fixes the **static** arm,
leg, mouth, eye and brow positions (fully legible frozen) and adds named
keyframes. Pose props are drawn in `.h-prop` (front hand). The **role tool is
shown** in idle, walking, talking, needs-input and celebrating (held aloft).
It is **hidden** in typing, reading, carrying, chilling and sleeping. In
**writing**, a Writer's quill or Frontend's pencil *becomes* the writing
implement; every other role gets a plain pencil.

| pose | static key pose | animation (keyframe · target · timing) | `.h-fx` |
|---|---|---|---|
| **idle** | arms rest 12°, smile, eyes open | `h-breathe` · `.h-rig` scaleY 1→1.025 · 3.6s ease-in-out ∞ (random negative delay per instance) · `h-blink` · `.h-lid` · 5.2s ∞ · `h-glance` · pupils −.3→.4 x · 9s steps | — |
| **walking** | side-facing by default, legs ±18°, arms swing opposite | `h-step` · `.h-leg-f` rotate 18°→−18°, `.h-leg-b` same with −.35s delay · .7s ∞ · `h-swing` · arms ∓14° · .7s · `h-bob` · `.h-rig` translateY 0→−2 · .35s ∞ | — |
| **typing** | seated, both arms forward to 70°, hands at desk height, pupils down `--ly:.8`, mouth `focus` | `h-type` · each hand translateY 0→−2.5 · .28s ∞, front hand delayed .14s · `h-breathe` slowed to 4.2s | — |
| **writing** | front arm forward 55° holding the implement, head tilt 5°, mouth `tongue`, pupils down | `h-scribble` · `.h-arm-f` translate (±1.5,±1) · .5s ∞ · paper prop in front | — |
| **reading** | both arms forward 60° holding an open document or book at chest, pupils `--ly:.5` | `h-scan` · pupils x −.6→.6 then snap back · 2.4s steps(6) ∞ · `h-page` · right page scaleX 1→−1 · every 6s | — |
| **carrying** | both arms forward 80° under a **paper stack** (3 offset paper rects + a binder clip). Legs walk if the caller is moving it (`moving` class), else stand | `h-step`/`h-bob` as walking when `.moving` · `h-wobble` · stack rotate ±2° · 1.4s | — |
| **talking** | front arm gesturing, mouth alternates `talkA/talkB`, brows lifted 1 | `h-gesture` · `.h-arm-f` rotate −10°→−38° · 1.6s ∞ · `h-yap` · two stacked mouth paths opacity-swapped · .32s steps(2) ∞ | (Office draws its own speech bubbles) |
| **chilling** | seated, `.h-rig` leaning back −6°, lids at 40% (`scaleY(.4)`), smile, holds a **mug** | `h-sip` · `.h-arm-f` rotates mug to mouth at 60–75% of 4.5s ∞ · `h-steam` · two wisps translateY −6 + fade · 2s ∞ | — |
| **sleeping** | head tilted 12° on the neck, lids fully closed and drawn as down-arcs, mouth `o`, arms limp | `h-snore` · `.h-rig` scale 1→1.04 · 3.2s ∞ | `Zz`: three `z` glyphs (cream, 900 weight) rising +18px and fading, staggered 1s · `h-zzz` 3.2s ∞ |
| **celebrating** | both arms up at −150°, tool held aloft, mouth `grin`, eyes happy arcs, brows up | `h-jump` (v2 jump, retimed) · `.h-rig` squash→leap −18→land · .62s spring ∞ | `✦` sparkles (the caller may also call `fireConfetti`). **Callers revert after 1.4s** (transition, not a state) |
| **needs-input** | **front arm raised straight up (−160°)**, brows up 3, mouth `worried` | `h-wave` · `.h-arm-f` rotate ±10° around raised · 1.2s ∞ | **`!` badge**: coral circle with a cream `!`, 2px ink ring, centred above the headgear. `h-bang` · translateY 0→−4, scale 1→1.12 · 1s ∞ |

**The `.h-fx` overlay is HTML, not SVG**, absolutely positioned above the head
anchor, with `min-width/min-height: 18px` at every size. At 48px the "!" and "Zz"
stay readable instead of shrinking to 5px. It also holds a visually hidden
text twin (`<span class="sr-only">needs your input</span>`) when `label:true`.

**prefers-reduced-motion:** every `h-*` keyframe gets `animation:none`. Each pose
keeps its static key pose, so the poses stay distinguishable frozen: needs-input
keeps the arm up and the static "!", sleeping keeps closed arcs and a static
"Zz", celebrating keeps the grin with one static ✦, and walking freezes
mid-stride. `setFacing` transitions drop to 0ms. The costume poof (§3) is skipped.

### 1.9 Legibility acceptance (builder verifies by running it)
1. Render all 10 roster agents at **48px** in a row on `--bg-0`. Each role must be
   nameable from headgear plus tool alone, with colour filtered out
   (`filter:grayscale(1)` check).
2. At **360px**, the outline must be crisp (no raster scaling, see §3.1). Badge
   glyph, hair and accessory must be clearly drawn.
3. All 11 poses × 3 facings render without parts detaching (arm capsules stay
   attached at the shoulder anchor on all 4 builds).

---

## 2. Roster screen (Cast → Agents)

### 2.1 Wireframe (≥1100px)
```
┌──────────────────────────────────────────────────────────────────────────┐
│ Projects · [Cast] · Access · Blueprint                                    │
│                                                                           │
│  The Cast                              ( Agents | Teams )   [⌕ search  ]  │
│                                                                           │
│        ▽ spotlight (hover/focus only)                                     │
│      (o)🎧     (o)⚙      (o)🎨      (o)🔍     (o)⛏      (o)⛑               │
│      /|\✎     /|\        /|\        /|\       /|\       /|\               │
│      / \      / \        / \        / \       / \       / \               │
│    ~~~~~~~~  ~~~~~~~~  ~~~~~~~~  ~~~~~~~~  ~~~~~~~~  ~~~~~~~~  ← spot pools │
│   Pixel Pete Capt. Semi Twinkle  Scarlett  Querious  Baron v B            │
│   </> FRONTEND ⚙ BACKEND ✒ DESIGN 🐞 QA    ▮ DATA    ∞ DEVOPS             │
│                                                                           │
│      (o)🎓     (o)🪶     (o)⚓      (o)⛨       ( ? )                      │
│      ...       ...       ...       ...       ┆   ┆  ← ghost silhouette    │
│   Prof Prompt Doc Holly. Mme Merge  Sir Lint   New agent                  │
│   💡 RESEARCH ¶ WRITER  ⚑ RELEASE  ✦ QUALITY   + RECRUIT                   │
└──────────────────────────────────────────────────────────────────────────┘
```
(Emoji above are wireframe shorthand only. The build uses the SVG gear and badges.)

### 2.2 Layout and stage
- **No `.panel`, no cards, no white.** The lineup sits directly on the scene's
  twilight background. Header row: a short `h1` "The Cast" (no kicker, no
  paragraph), the Agents/Teams tabs, and search, right-aligned.
- **Floor:** behind the lineup, one wide ellipse "stage floor":
  `radial-gradient(ellipse 60% 40% at 50% 100%, rgba(255,246,233,.07), transparent 70%)`
  plus a faint horizon line (1px `rgba(255,246,233,.06)`) at each row's ground.
- **Slots:** `ul.lineup` with CSS grid,
  `grid-template-columns: repeat(auto-fill, 168px); justify-content:center;
  column-gap:24px; row-gap:56px`. Each slot is a `<button class="slot">` with the
  character at **`md` (160px)**, then a **spot pool** under the feet (ellipse
  130×22, `radial-gradient(rgba(255,194,75,.14), transparent 70%)`), then the
  name, then the role.
- **Facing:** characters face inward like a lineup. Slots in the left half of
  each row use `dir:'right'`, the right half `dir:'left'`, all `three-quarter`,
  pose `idle` with desynced breathing. The roster never shows working poses.
  These are definitions at rest (the v2 rule kept).
- **Labels (no boxes):** name 15px / 800 in `--cream`. Role on the next line:
  the 12px role badge glyph plus the role in 11px / 800 caps, letter-spacing
  .08em, `rgba(255,246,233,.72)`. Nothing else: no logline, prompt, access line
  or teams.
- **Responsive:** <900px uses 3 per row. <640px uses `sm` (96px) heroes and 120px
  columns, about 3 per row. The ghost slot is always last.

### 2.3 Hover / focus = "step forward"
On `:hover` and `:focus-visible` (identical treatment):
- The character **steps forward**: `.slot .hero { transform: translateY(6px)
  scale(1.1) }` over 220ms `var(--spring)`. The spot pool brightens to .28 and
  widens 15%.
- A **spotlight cone** fades in from above: `.slot::before`, a trapezoid
  `clip-path: polygon(38% 0, 62% 0, 100% 100%, 0 100%)` filled with
  `linear-gradient(rgba(255,194,75,.22), transparent)`, opacity 0→1 in 180ms.
- The character switches to `setFacing('front')` (turns to look at you) and plays
  one `h-hop` (translateY −6, 380ms, once).
- **Siblings dim:** `.lineup:has(.slot:hover, .slot:focus-visible)
  .slot:not(:hover):not(:focus-visible) { filter: brightness(.65) saturate(.8) }`.
- Focus ring (keyboard): `outline: 3px solid var(--sun); outline-offset: 4px;
  border-radius: 28px` around the slot, so focus is never shown by light alone.
- On leave: back to three-quarter facing and the inward `dir`.

### 2.4 Search
- One field (⌕ icon, placeholder "Search name or role", `aria-label`). It matches
  name and role case-insensitively.
- Non-matches **step back into shadow** (opacity .18, scale .92, `inert`, removed
  from the tab order). Matches keep their places, so the lineup does not jump.
  A polite live region announces "3 agents match".
- Zero matches: every slot dims, and one centred line appears: "No one by that
  name. **Recruit "<query>"**". That link opens the new-agent hero screen with
  the name pre-filled. Esc in the field clears it.

### 2.5 "+ New agent" = silhouette slot
The last slot renders `hero({…defaults}, {size:'md', ghost:true})`: the same
anatomy with no fill and a 2px dashed `rgba(255,246,233,.35)` stroke, plus a
cream "?" where the face is. Its labels read "New agent" and "+ RECRUIT". Hover
does the same step forward, and the dashes animate (`stroke-dashoffset`, 1.2s ∞,
off under reduced motion). Click → hero zoom (§3) in create mode.

---

## 3. Hero zoom

### 3.1 The camera move (FLIP, ~560ms)
1. On click, read `from = slot.querySelector('.hero').getBoundingClientRect()`.
2. Mount `section.hero-screen` (fixed over the scene area, below the top nav)
   with the character **rendered at `xl` natively**. Read
   `to = bigHero.getBoundingClientRect()`.
3. **Invert:** `s = from.height / to.height`,
   `dx = (from.left + from.width/2) − (to.left + to.width/2)`,
   `dy = from.bottom − to.bottom`. Set `transform-origin: 50% 100%` (feet).
4. **Play:** `bigHero.animate([{transform:`translate(${dx}px,${dy}px) scale(${s})`},
   {transform:'none'}], {duration:560, easing:'cubic-bezier(.2,.8,.2,1)'})`.
   Because the hero is drawn at xl and scaled *down* to start, it is never
   blurry.
5. **Camera push on the world:** at the same moment the lineup gets
   `.camera-push`, `transform: scale(1.25)` with `transform-origin` at the clicked
   slot centre, plus `opacity:0` and `filter: blur(4px)` over 480ms. The original
   slot is hidden with `visibility:hidden` so there is never a double.
6. Stage vignette: the overlay background fades from transparent to
   `radial-gradient(circle at 30% 60%, rgba(255,194,75,.12), var(--bg-0) 70%)`.
7. The detail panel slides in: `translateX(32px)→0`, opacity 0→1, 320ms, delayed
   220ms. On arrival the character plays `celebrating` for 900ms, then `idle`,
   **facing `front`** (looking at you).
8. **Back** (button, Esc or browser back) runs the reverse: re-render the lineup
   (with any saved changes), measure the slot, animate the big hero to it, remove
   the overlay, and **return focus to that slot**.
- Reduced motion: no transform. The views crossfade in 160ms.

### 3.2 Wireframe
```
┌──────────────────────────────────────────────────────────────────────────┐
│ ← Cast                                                                    │
│                                     ┌──────────────────────────────────┐  │
│            ╭─ spotlight ─╮          │ [Pixel Pete           ] 🎲       │  │
│                 🎧                   │ </> FRONTEND · Teal              │  │
│               ( o  o )               │ 3 projects · 1.24M tokens        │  │
│                \_‿_/   ✎            │ Ship-It Squad                    │  │
│               /|</>|\               │──────────────────────────────────│  │
│                / \                   │ ROLE                             │  │
│          ~~~~~~~~~~~~~~ floor disc   │ [</>Front][⚙Back][✒Design][🐞QA][▮Data]│
│                                      │ [∞DevOps][💡Res][¶Writer][⚑Rel][✦Qual]│
│        ‹   3 / 10   ›                │ LOOK  hue ● ● ● ● ● ● ●          │  │
│                                      │       build [hero][sprout][bruiser][lanky]│
│                                      │       hair  [none][tuft][spikes]…│  │
│                                      │       extra [none][glasses]…     │  │
│                                      │ BRAIN (system prompt)            │  │
│                                      │ ┌──────────────────────────────┐ │  │
│                                      │ │ You are a frontend engineer… │ │  │
│                                      │ └──────────────────────────────┘ │  │
│                                      │ [ ✨ Save ]   Back               │  │
│                                      └──────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
```

### 3.3 Left: the hero
- Grid `minmax(0,1.1fr) minmax(360px,1fr)`, gap 48px. The character is `xl`
  (360px), standing on a **floor disc** (ellipse 300×44, role-accent glow at 22%)
  under a sun spotlight cone.
- `‹ 3 / 10 ›`: small ghost buttons under the floor. Prev/next cycle through
  agents without zooming out: a short side-step crossfade (the old hero slides
  out 40px, the new one slides in). They are also bound to `[` / `]`. If there
  are unsaved edits, the discard bar (§3.5) shows first.
- **Live**: every change on the right re-renders the hero instantly (`heroSVG`
  swap) with one `h-hop`.

### 3.4 Right: the detail panel (dark glass, no white)
Panel: `background: rgba(255,246,233,.06); border: 1px solid rgba(255,246,233,.12);
border-radius: var(--r-lg); padding: 28px; color: var(--cream)`. It scrolls
internally, with a sticky footer. Inputs are dark (`rgba(0,0,0,.25)`) with cream
text.
1. **Name.** A title-sized input (28px / 900, borderless until focused), max 22
   chars, plus 🎲 for a funny name (`FUNNY_NAMES`). Under it is the caption
   `<badge> ROLE · <Hue name>`.
2. **Stats row** (read-only, 13px / 700, 72% cream): `N projects ·
   1.24M tokens · <team names, or "No team yet">`. Tokens are a lifetime total,
   formatted with K/M. In create mode it reads "New recruit · no history yet".
3. **Role.** A `radiogroup` of 10 tiles (5×2, each 64×64): a 28px **mini hero
   headgear + tool icon** rendered from `GEAR`, plus a label. Selected = 2px sun
   ring + sun label. **Costume change** on select: the hero does `h-twirl`
   (`.h-rig` scaleX 1→0 by 180ms, gear swapped at the midpoint, back to 1 by
   360ms) and 6 cream puff circles `h-poof` scale out and fade over 420ms. The
   polite live region says "Now Backend: welding goggles, overalls, cog."
   **Prompt follow-along:** if the prompt is empty or still equals the previous
   role's template, it is replaced with the new role's `PROMPT_TEMPLATES` entry.
   An inline note offers "Prompt switched to the Backend template · Undo".
   Otherwise a small "Use Backend template" chip appears. A template is needed
   for all 10 roles, so add the 5 missing ones.
4. **Look.** Four compact rows, each a radiogroup:
   hue = 7 swatches (28px circles, named in `aria-label` and a tooltip,
   selected = ink ring plus a ✓ glyph, so selection is never shown by colour
   alone); build = 4 chips, each with a tiny silhouette; hair = 7 text chips;
   extra (accessory) = 8 text chips.
5. **Brain.** "Its own system prompt": a mono textarea, 8 rows, auto-grow
   capped at 16.
6. **Footer** (sticky): `✨ Save` (primary, the only one on the screen) and a
   ghost `Back`. Save validates the name (inline error under the name: "Give
   them a name first"; never a toast alone). On success: `celebrating` for 1.2s,
   `fireConfetti()`, toast "Saved". The user **stays on the hero screen**, and
   the dirty flag clears.

### 3.5 Dirty state, Esc, create mode
- **Esc** = Back. If there are unsaved edits, an inline bar slides up above the
  footer: "Unsaved changes. [Save] [Discard] [Keep editing]". Esc again =
  Keep editing. No modal.
- **Create mode** (ghost slot, or a "Recruit" from search): zoom from the ghost.
  The ghost **materialises** over 500ms (dashes fill in with the hue, gear pops
  on with `h-poof`). Defaults: role Frontend, build `hero`, hair `tuft`,
  accessory none, and the **least-used hue** in the roster. Focus goes to the
  empty name field (placeholder "Name your agent"). The stats row shows "New
  recruit". After the first Save, the record exists and the screen behaves like
  edit mode. Back returns to the lineup, where the new agent is in the slot
  before the ghost and plays `h-hop` once.
- **Voice path:** a clarifier or voice intent such as "make a backend agent
  called Major Refactor" opens create mode pre-filled (name and role), with
  Save left to the user. Prototype: wire it as a function
  `openHero({name, role})`.

---

## 4. Data model

`AGENTS[i]` becomes:
```js
{ id, name, role,                        // role ∈ ROLES (10)
  hue, build, hair, accessory,           // personal identity (§1.5)
  prompt,                                // system prompt
  stats: { projects: Number, tokens: Number } }   // lifetime; Office owns per-project tokens
```
**Removed:** `trait`, `prop` (role gear replaces them) and `logline` (no longer
shown anywhere). Team membership is derived from `TEAMS`, never stored on the
agent. `DIRECTOR = {id:'director', name:'Pixel', role:'Director', hue:'sun',
build:'hero', hair:'tuft', accessory:'none'}`.

| id | name | role | hue | build | hair | accessory | projects | tokens |
|---|---|---|---|---|---|---|---|---|
| a-pete | Pixel Pete | Frontend | teal | sprout | spikes | freckles | 3 | 1_240_000 |
| a-semic | Captain Semicolon | Backend | sky | bruiser | tuft | mustache | 3 | 1_870_000 |
| a-twinkle | Twinkle | Design | rose | sprout | bun | flower | 2 | 640_000 |
| a-scar | Scarlett Scenario | QA | coral | lanky | bob | bow | 3 | 910_000 |
| a-query | Querious | Data | sky | sprout | curl | glasses | 1 | 420_000 |
| a-baron | Baron von Backup | DevOps | rose | bruiser | none | monocle | 2 | 380_000 |
| a-prof | Professor Prompt | Research | grape | hero | swoop | glasses | 2 | 1_050_000 |
| a-doc | Doc Hollywood | Writer | sun | hero | swoop | shades | 2 | 560_000 |
| a-merge | Madame Mergeworthy | Release | grape | lanky | bun | none | 3 | 290_000 |
| a-lint | Sir Lint-a-lot | Quality | mint | hero | none | monocle | 2 | 710_000 |

Duplicate hues (sky ×2, rose ×2, grape ×2) are deliberately separated by build
and gear. Each pair differs in build or role, so no two agents share a
silhouette. Keep each agent's v2 `prompt` text unchanged.
**Elsewhere:** `PROJECTS[].cast` changes from hue strings to **agent ids**, so
project cards render real heroes at `xs`. `castOf(agent, mood, size)` stays as a
shim: `hero(agent, {size, pose: MOOD_TO_POSE[mood]})`.

---

## 5. Accessibility

- **Lineup:** `ul.lineup role="list"`, each `li > button.slot` with
  `aria-label="Pixel Pete, Frontend. Open details"`. The ghost slot is labelled
  "Create a new agent". **Roving tabindex:** Tab enters the lineup once. Arrow
  keys ←/→ move through slots, ↑/↓ jump a row by the current column count, and
  Home/End go to the first/last. Enter or Space opens. The SVG is
  `aria-hidden`, because the button's text already names the agent.
- **Hero screen:** `role="dialog" aria-modal="true"
  aria-labelledby="<name heading>"`, with focus trapped inside. On open, focus
  goes to the name input in create mode and to the panel heading in edit mode.
  On close, focus returns to the originating slot. Role, hue, build, hair and
  extra are each a `radiogroup` with arrow keys. `[`/`]` prev/next works only
  when focus is not in a text field. Esc behaves per §3.5.
- **Never colour or motion alone:** role = headgear + tool + glyph + the text
  label. Hue = a named swatch plus ✓. Selected tile = ring plus colour change
  plus `aria-checked`. needs-input = raised arm + "!" + text in the label.
  Sleeping = closed eyes + "Zz" + text. All of these hold frozen (§1.8). Callers
  that show a pose without visible text (the Office) must use `label:true` or
  supply their own name tag.
- **Contrast:** cream on `--bg-0` is about 15:1. The 72% cream role captions stay
  ≥ 7:1. Focus rings are 3px sun. The ink outline gives every hue ≥ 3:1 against
  the stage (non-text contrast).
- **Live regions:** search count, the role-change costume line, and save
  confirmation (polite).
- **Reduced motion:** the zoom becomes a crossfade. Poses, twirl, poof and hop
  are off. Idle stays static.

---

## 6. Cut list (removed from v2)

- White/cream `.defcard`s and the white `.panel` wrapping the cast body.
- On the roster: logline, prompt preview, "No standing access" line, "Used in"
  line (now the stats row in hero), "Summonable" line.
- The long scene intro paragraph and "The Cast" kicker. The header is now just
  `h1` + tabs + search.
- The **separate Factory agent-designer screen**, its "Assembling" belt, and its
  `celebrate` preview. The hero screen *is* the designer.
- The **trait** chip row (13 hats) and the **hand prop** chip row. Hats and
  props are now role-owned, and only hair and accessory stay personal.
- The role `<select>` dropdown, replaced by visual role tiles.
- The gumdrop `castSVG` / `traitSVG` / `propSVG`, retired behind the `castOf`
  shim. The `mood-*` classes are replaced by `pose-*`.
- Not added on purpose: delete/retire agent, a role filter dropdown, sorting,
  and per-agent access editing (access stays project-held; see the Access
  stage).
