# Spec — The Project Workspace ("The Set")

The main surface. Where the user lives after opening a project. This spec is the
build contract for one self-contained HTML scene; it reuses the cast-SVG system,
warm palette, and motion vocabulary already proven in `disney-pixar.html`.

---

## 0. North star — one big idea

**The workspace is the Director's desk with a window onto the set.**

There is exactly **one hero**: the **orchestrator chat** (your manager). You talk
to it; it runs the studio. Everything else — health, features, crew, progress,
status — is *ambient state* arranged calmly around the conversation, summarised to
a single high-signal token that's always visible and expands only on demand.

The anti-busy weapon is **summarise-then-expand**: every cluster collapses to one
legible glance token (a %, a grade, a face, a chip). Depth is always one tap away,
never in your face. The Disney soul lives in *faces and motion*, never in extra
chrome.

---

## 1. Region map & hierarchy

```
┌────────────────────────────────────────────────────────────────────────┐
│ TOP BAR  [◇ logo] Aurora Storefront            GitHub ✓ · 🔒 Private      │
│          ← All projects                 Test ↗ aurora-preview…  [Open]  🔔²│
├────────────────────────────────────────────────────────────────────────┤
│ ✋ HAND-RAISE BANNER  (only when input pending)                           │
│   [Sage 😟] "I need the Stripe test key to run the payment suite."       │
│                                                   [Open the ask →]  [2 waiting]│
├─────────────────────────────────────────┬──────────────────────────────┤
│  THE DIRECTOR  (hero, ~58%)             │  THE SET  (right rail, ~42%)  │
│  ┌───────────────────────────────────┐  │  ┌────────────────────────┐  │
│  │ 🎬 Pixel · your manager · altitude │  │  │ PULSE                  │  │
│  │ [chat log — bubbles, streaming]    │  │  │ Aurora 64% → v1.0      │  │
│  │ …casting / action system bubbles…  │  │  │ Voice search ▓▓▓░ 62%  │  │
│  │                                    │  │  │ Checkout   ▓▓░░ 48%    │  │
│  │                                    │  │  ├────────────────────────┤  │
│  │                                    │  │  │ CHECKUP  🙂 Healthy    │  │
│  │                                    │  │  │ Modular B · Clean A ·  │  │
│  │                                    │  │  │ Reuse C  (tap to open) │  │
│  │                                    │  │  ├────────────────────────┤  │
│  │ ┌────────────────────────────────┐ │  │  │ ON SET                 │  │
│  │ │ (⦿ mic)  Talk or type to Pixel…│ │  │  │ ▸ Storefront  Pip Dot  │  │
│  │ │                          [Send]│ │  │  │ ▸ Payments ✋ Bolt Sage │  │
│  │ └────────────────────────────────┘ │  │  ├────────────────────────┤  │
│  └───────────────────────────────────┘  │  │ SHOT LIST  7✓ · 2● · 4○│  │
│                                          │  └────────────────────────┘  │
└─────────────────────────────────────────┴──────────────────────────────┘
```

### Always visible vs tucked away

**Always visible (the glance):**
- Project identity (logo + name) and **← All projects**.
- **GitHub connected?** + **private/public** — one chip each.
- **Where to test now** — URL chip or **Open app** button.
- Notification **bell** with pending count.
- **Hand-raise banner** whenever any agent/orchestrator needs input (prominent).
- **Orchestrator chat + mic** (the hero column, never collapses).
- **Pulse**: overall % + current feature %(s).
- **Checkup**: composite mood face + three letter grades.
- **On Set**: team headers + who's blocked (the ✋ marker).
- **Shot list**: the header tally (shipped · now · planned) + the "Now" row.

**Tucked (one tap):**
- Health's plain-language notes + "Ask Pixel to fix" per vital.
- Full done/planned feature list and per-feature detail.
- Per-agent task detail + what access they can reach.
- **The ask sheet** ("green room") — focus-trapped dialog.
- Project **access management** and settings — linked out, not inline.

### Responsive
- `>1100px`: two columns as drawn.
- `720–1100px`: right rail drops below the chat; its four cards become a single
  calm accordion column (Pulse open by default, others collapsed to glance tokens).
- `<720px`: single column; top bar wraps to two rows; chat is the first thing;
  the Set cards follow as full-width accordions; the hand-raise banner stays pinned.

---

## 2. Visual system (reuse + additions)

**Reuse verbatim from `disney-pixar.html`:** `--bg/panel/cream/sun/coral/teal/sky/
grape/mint/rose` palette, radii, shadows, `.cast` SVG + moods (`working/blocked/
celebrate/idle`), `.progress .fill` with sheen, `.bubble`/streaming/typing,
`.chip`, `.pill`, `.keytag`, `.switch` toggle, `.btn` family, confetti, toast,
motes, and the `prefers-reduced-motion` block.

**Additions (kept minimal):**
- One card primitive for the right rail: `.set-card` = cream panel, `--r-md`
  radius, 18px pad, a `.set-card__head` (uppercase micro-label + glance token +
  chevron), optional `.set-card__body` (expanded). Every Set region is this one
  component — that consistency is what keeps a dense rail calm.
- Grade pill `.grade` (A/B/C) in mint / sun / coral with the letter *and* a word,
  never colour alone.
- Team cluster `.team` = coloured left-border + team badge + member faces.
- Hand-raise banner `.handraise` (warm sun→coral gradient, slides down).
- Green-room dialog `.greenroom` (focus-trapped sheet).

Discipline: one accent colour per state; metaphor names (Set, Checkup, Shot list,
green room) are *flavour labels only* — the UI always also reads literally.

---

## 3. Components

### 3.1 Top bar status strip

Purpose: answer "is this wired up, who can see it, where do I test it" without a
click.

Anatomy, left→right: project **logo** (uploaded icon, rounded square) + **name**;
`← All projects`; spacer; **GitHub chip**; **privacy chip**; **test-target**;
**bell**.

- **GitHub chip** — states:
  - *Connected* (default): octocat glyph + "GitHub" + tiny teal check. Tooltip:
    "Pushed 4 min ago · branch `voice-search`." Click → repo (external).
  - *Disconnected*: coral-tinted "Connect GitHub" prompt (this is the one place a
    call-to-action is allowed here).
  - *Syncing*: glyph with a gentle spin, "Pushing…".
- **Privacy chip** — `🔒 Private` (grape) or `🌐 Public` (sky). This is repo/preview
  visibility only; never a secret value. Click opens a small confirm to flip.
- **Test-target** — three states:
  - *URL-testable*: `Test ↗ aurora-preview.studio.app` chip; click opens in new
    tab, a copy affordance on hover. A live-dot if the preview is fresh.
  - *App*: **[▶ Open app]** button (for a desktop/installed target).
  - *Not yet*: muted "No preview yet — crew is still building" (no action).
- **Bell** — badge with pending-input count; click scrolls to / re-opens the
  hand-raise banner. Zero state: quiet outline bell, no badge.

### 3.2 Hand-raise banner (input-request, top)

Purpose: the single most important interrupt — an agent (or the orchestrator)
needs *you*. Disney: a cast member literally **raises a hand**.

- Appears only when ≥1 request is pending. Slides down from under the top bar,
  pushing content; `role="alert"`, `aria-live="assertive"`.
- Anatomy: the asker's **face** (`mood-blocked`, arm raised), name + team, the ask
  in one plain line, **[Open the ask →]** primary, and a **"N waiting"** counter if
  more than one is queued.
- Colour: warm sun→coral gradient (urgent but friendly, not alarming red).
- States: *single* (one ask), *stacked* ("2 waiting" → resolving the top one slides
  the next up), *resolving* (brief mint flash + sparkle, then collapse), *empty*
  (not rendered).
- The same pending request is mirrored in three places so nothing is missed: this
  banner, the **bell** badge, and the agent's card in **On Set** (✋). All three
  clear together when answered.

### 3.3 The Director — orchestrator chat + one-press voice (the hero)

Purpose: the manager you talk to; it launches teams & agents and always reports
progress. **Voice is a feature of this chat, not a screen.**

Anatomy:
- **Header**: the director cast member (bigger, director hat, `mood-working`),
  name "Pixel", role line "your manager · big picture only", and a subtle
  "always here" presence dot.
- **Log**: reuses `.bubble` (`them` = director cream, `me` = sun). Director replies
  stream with the caret; a **"casting" system bubble** marks actions ("Pixel cast
  the Payments team — Bolt + Sage are on it") in a distinct quiet style (grape left
  rule, no avatar). Quick-reply `.chip`s appear under a director turn when it wants
  a fast choice.
- **Composer** (bottom, always): one row — **mic button** (left) · **text field**
  (grows) · **[Send]**. The mic is the one-press voice affordance; typing is the
  full equivalent path.

**One-press voice — step by step (simulated):**
1. **Idle**: mic is warm/calm (sun), hint in field "Talk or type to Pixel…".
   `aria-pressed="false"`, label "Press to talk to Pixel".
2. **Press** → **Listening**: mic turns rose/coral with pulsing rings, a live
   waveform rides the composer, director header leans in (`mood-working`), hint
   "Listening… press to stop." `aria-pressed="true"`, `aria-live` announces
   "Listening."
3. **Press again / silence** → **Thinking**: mic calms, "Got it — thinking…", the
   captured speech streams into the log as a **me** bubble (so the user sees what
   was heard — trust).
4. **Director replies** (streaming `them` bubble). If it decides to act, a
   **casting** system bubble posts and the right rail updates live (a new agent
   card animates into On Set; Shot list "Now" row appears).
5. **Optional quick replies** (chips) for one-tap sharpening. Everything here is
   reachable by keyboard and reproducible by typing — voice is never required.

States: idle · listening · thinking · streaming · awaiting-choice · error ("Didn't
catch that — try again or type", mic shakes once, no dead end).

### 3.4 Pulse (progress)

Purpose: overall project progress + current feature(s). The big, honest numbers.

- **Overall**: a hero ring (or thick bar) with big `64%` and a friendly line
  "Aurora is 64% to **v1.0 launch**." Colour shifts teal→mint as it climbs.
- **Current feature(s)**: one slim `.progress` bar per active feature with its name,
  %, and the agent/team on it ("Voice search · Pip · 62%", "Checkout · Payments ·
  48%"). Max two shown; a "+1 more" if needed → opens Shot list.
- States: *early* (teal), *mid*, *near-done* (mint), *just-shipped* (one-shot
  celebrate pulse + the bar snaps to 100% then the feature moves to Shot-list Done).
- Reduced-motion: no sheen/pulse; static fills with text %.

### 3.5 Checkup (standards health)

Purpose: the periodic AI audit of **modularization**, **code cleanliness**,
**feature reusability**. Disney framing: a **studio wellness checkup**.

How it reads at a glance:
- A **composite mood face** (the project avatar) = overall health. Happy (mint) if
  all vitals good, neutral (sun) if one needs attention, worried (coral) if any is
  poor. One word beside it: "Healthy" / "Okay" / "Needs care."
- **Three vitals**, each a **letter grade pill** (A/B/C) + a tiny meter, labelled:
  `Modular`, `Clean`, `Reuse`. Letter + colour + word (never colour alone).
- Footer: "Last checkup 2h ago" + a quiet **[Run checkup]** when stale.

Expanded (tap a vital): a one-line plain-language note and a direct action.
- e.g. Reuse C → "Three card components are near-duplicates — they could share one.
  **[Ask Pixel to fix →]**" which drops a pre-written message into the chat.

States per vital: excellent(A/mint) · good(B/sun) · needs-care(C/coral) ·
*n-a* (not yet audited, grey). Card states: *fresh*, *stale* (grades muted, Run
checkup prompted), *running* (medic/avatar in `mood-working`, grades shimmer).

### 3.6 On Set (who's working on what)

Purpose: a legible, living view of which **teams and agents** work on which
features. Cast in motion — but high-signal.

- Grouped by **team** (teams carry their own identity: colour + badge + name).
  Each team row: team badge, name, **what it's building** ("Payments · building
  Checkout"), an aggregate mini-progress, and its members' **faces** (status via
  mood + a text status dot). A member with a raised hand shows the **✋** marker.
- **Solo agents** (orchestrator called one directly, not a team) group under a quiet
  "Solo" header.
- Expand a member → task detail line + **what access they can reach** (keytags,
  masked; locked keytag if they're blocked waiting on access).
- Disney motion: breathe/bob while working, hand-raise when blocked, a small jump
  when their feature completes. Motion is *redundant* with colour + dot + label so
  it's never the only signal.

States: team *active / blocked (any member ✋) / done*; member *working / blocked /
celebrate / idle*. A completed feature triggers the member's celebrate + a scoped
sparkle (full confetti is reserved for release-level wins, to keep it special).

### 3.7 Shot list (features done + planned)

Purpose: one list, three legible tiers.

- Header tally: **"7 shipped · 2 now · 4 planned."**
- **Now** (top, highlighted): the in-progress feature(s) with accent bar, %, and
  who's on it — mirrors Pulse/On Set.
- **Shipped** (checks, mint, slightly muted, a tiny ⭐ on release-makers).
- **Planned** (hollow circles, quiet, ordered "up next"), each with **[Ask Pixel to
  start →]**.
- Tap any feature → expands to its team/agents + sub-progress (planned → the start
  action). Voice-friendly: "Pixel, start multi-currency" does the same thing.
- States per feature: shipped · now · planned · blocked (inherits a ✋ if its agent
  is blocked).

---

## 4. Key flow — an agent asks for input ("green room")

The important, delightful-able interaction. Step by step:

1. **Blocker happens.** Sage (QA, Payments team) can't run the payment suite without
   the Stripe test key. Three things fire together:
   - On Set: Sage's face flips to `mood-blocked` (hand raised), card gets the ✋ and
     a coral rule.
   - Hand-raise banner slides down: "Sage needs the Stripe test key…" **[Open the ask →]**.
   - Bell badge → `1`.
2. **User opens the ask** (banner button, the bell, or Sage's card). A focus-trapped
   **green-room sheet** opens — "where a cast member waits for you":
   - Sage's face (worried-but-hopeful), name · role · **team**.
   - **The question**, in plain words: "I need the Stripe **test** key to run the
     payment suite. Without it I can't verify checkout."
   - **Why / context**: one line ("Blocking: Checkout feature · 48%").
   - **Input affordance, typed to the ask:**
     - *needs access/key* → shows the exact project access to enable, with a
       `.switch` toggle (value stays masked — you grant reach, never see the secret);
       a link "Manage access" out to project access.
     - *needs a decision* → 2–3 option `.chip`s + optional free-text.
     - *needs an example* → text area / file drop with a placeholder example.
3. **User answers** → **[Hand it over]**. Sage's face flips grateful → `working`;
   sheet closes; banner + bell + ✋ all clear; a gentle sparkle (not full confetti);
   toast "Handed to Sage." The chat posts a quiet system line so the director's log
   stays the source of truth.
4. **Multiple pending**: the sheet shows "Next: Dot is waiting on a copy decision"
   and advancing resolves the queue one at a time; the banner counter counts down.

Accessibility of the sheet: `role="dialog"` + `aria-modal`, labelled by the
question, focus moves to the first input, Esc closes and returns focus to the
trigger, tab is trapped within.

---

## 5. Disney soul without crowding out state

- **Faces carry emotion; text carries state.** Every mood pairs with a status word,
  an icon, and a colour — motion is decoration, never the sole signal.
- **One hero, calm periphery.** The chat is alive; the Set cards are still and
  summarised. Living motion is confined to small cast faces and the one active
  progress sheen.
- **Celebration is rationed.** Scoped sparkle for a feature done; full confetti only
  for a release (makes wins feel earned, not noisy).
- **Metaphor is a label, not a maze.** "Green room", "Shot list", "Checkup" flavour
  the copy; the controls underneath are literal and obvious.
- **Warmth in copy.** Pixel speaks like a kind manager ("Nice — that's shipped. Want
  me to start reviews next?"), never like a terminal.

---

## 6. Sample data (believable, mid-build)

**Project:** Aurora Storefront · logo = warm sun rounded-square glyph.
**GitHub:** connected, pushed 4 min ago, branch `voice-search`. **Privacy:** 🔒 Private.
**Test:** URL-testable → `aurora-preview.studio.app` (live-dot fresh). **Overall:** 64% → *v1.0 launch*.

**Current features (Now):** Voice search — Pip — 62%; Checkout + payments —
Payments team — 48%.

**Shot list:**
- *Shipped (7):* Product grid ⭐, Cart ⭐, Search filters, Auth / login, Image CDN,
  Wishlist, Order history.
- *Now (2):* Voice search (62%), Checkout + payments (48%, ✋ blocked on Sage).
- *Planned (4):* Recommendations, Reviews, Multi-currency, Email receipts.

**Checkup (2h ago):** composite 🙂 **Okay** — Modular **B** (good), Clean **A**
(excellent), Reuse **C** (needs care → "Three card components are near-duplicates").

**Director:** Pixel (orchestrator, sun, hat).

**On Set:**
- **Storefront team** (teal) — building *Voice search*:
  - Pip · Frontend · `working` 62% · "Wiring the voice-search bar into the header" ·
    reach: GitHub, Figma, Vercel.
  - Dot · Design · `celebrate` 100% · "Shipped the cart component — review passed!" ·
    reach: Figma.
- **Payments team** (sky) — building *Checkout*:
  - Bolt · Backend · `working` 48% · "Building /checkout API + payment intents" ·
    reach: GitHub, Postgres.
  - Sage · QA · `blocked` ✋ · "Needs the Stripe **test** key to run the payment
    suite" · reach: GitHub (Stripe locked).
- **Solo:** Vera · Data · `idle` · "Standing by for analytics wiring."

**Pending input (1, bell = 1):** Sage → Stripe test key (access-type ask). Queued
behind it (for the "2 waiting" variant): Dot → a microcopy decision ("Cart button:
'Add to bag' or 'Add to cart'?").

---

## 7. Accessibility

- **Contrast:** ink (`#241a44`) on cream and all status text ≥ AA; grade pills and
  status dots always pair colour with a letter/word/icon.
- **Not colour/motion alone:** every agent mood, vital, and feature tier has a text
  label and shape/icon in addition to colour and animation.
- **Keyboard:** mic, Send, chips, cards, tabs/accordions, toggles, and every banner
  action are focusable with visible `:focus-visible` outlines; Enter/Space activate.
  Hit targets ≥ 44px for mic and primary buttons.
- **Live regions:** hand-raise banner `aria-live="assertive"`; toasts and the
  director's streaming replies `aria-live="polite"`; progress bars
  `role="progressbar"` with `aria-valuenow/min/max`.
- **Mic button:** `aria-label` + `aria-pressed`; voice has a complete typed
  equivalent — never a voice-only path.
- **Green-room dialog:** `role="dialog"`, `aria-modal`, labelled by the question,
  focus-trap, Esc to close, focus returns to trigger.
- **Secrets:** access is shown as names + masked tokens; grants are "reach"
  toggles — real values never appear in UI or logs.
- **`prefers-reduced-motion`:** disable breathe/bob/waveform/sheen/confetti; use
  static mood poses and instant progress updates; keep all information.

---

## 8. Build notes

- One self-contained `.html`, all CSS/JS/SVG inline, no external resources, no
  Artifacts. Reuse the existing cast/palette/motion from `disney-pixar.html`.
- The four Set regions share the single `.set-card` primitive (head = glance token,
  body = expand). This component reuse is the main thing keeping the dense rail calm.
- Simulated loop: a light timer advances `working` agents' % (as in the current
  prototype), drives feature completion → celebrate → Shot-list Done, and can fire
  the Sage hand-raise on a delay to demo the input flow end-to-end.
