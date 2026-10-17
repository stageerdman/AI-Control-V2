# AI Control — STARK HUD concept

A single-file, clickable prototype of AI Control dressed in one design soul:
the Tony Stark / JARVIS workshop HUD. You should feel like you are *standing in
the shop talking to the system*, not reading a dashboard.

File: `stark-hud.html` (open directly in any browser — no build, no network).

## Design soul
Holographic, reactive, data-dense but legible. Arc-reactor cyan is the system's
voice; gold is reserved for the two things that must never hide: **the human's
own words/actions** and **credential reach**. Everything is drawn with CSS/SVG —
rotating reticles, radial gauges, a breathing scan-line sweep, a bottom
telemetry ticker, corner brackets on every panel. The motion is a low hum, not a
light show: every glow marks something real (state, progress, access), so the
density reads as *instrumentation* rather than decoration. Commits to dark; one
font (system), one type scale, a tight spacing scale.

## The core loop, all clickable
1. **Grid (Global Overview)** — every project as a reticle-targeted card (live
   agents shown as a segmented bar) beside the **Credential Vault**. Every key
   is masked (`sk-••••7Q2a`) and padlocked; the vault never shows a value, only
   *who reaches it*.
2. **Launch** — open a project into the Orchestrator Launch Bay: a radial
   "arc-reactor" spin-up sequence (SPIN → WAKE → SYNC → LIVE) mints JARVIS-1,
   alongside the project's teams and their scoped context.
3. **Voice** — simulated end to end: a mic affordance with an expanding pulse, a
   live canvas-free waveform that reacts to "speech", a streaming typed
   transcript, and a **clarifier** that asks shaping questions back (with
   voice-reply chips). A toggle flips to **talk to the running orchestrator**
   (e.g. "why is Orion blocked?" → grant a key by voice).
4. **Watch** — orchestrator altitude: a mission ring plus a grid of agent cards,
   each streaming live progress, rotating task lines, and a state tag
   (working / complete / blocked). Pauseable feed.
5. **Factory** — mint an agent: name, role/altitude, team, rules, context, and a
   set of credential toggles. A live WYSIWYG preview recomputes its access map;
   minting drops the agent straight into the live Watch roster.

## Expressing *altitude* (orchestrator vs agent)
Altitude is encoded, not labelled-only:
- **Color** — orchestrators carry gold accents; specialists are cyan. The
  factory preview re-tints the avatar the instant you pick "Orchestrator".
- **Context scope** — the preview states it plainly: orchestrator = "big-picture
  only", team lead = "team-wide", specialist = "team-local". This mirrors the
  product rule that managers never see implementation detail.
- **Composition** — the orchestrator owns the top banner (mission ring, what it's
  *saying*, aggregate stats); agents live below as peers in a grid. The eye reads
  the hierarchy before reading a word.

## Expressing *access-scope* ("what can this agent reach?")
Reach is a first-class, always-visible gold channel and never a secret value:
- Every agent card has a **CAN REACH** footer listing padlocked key chips (or an
  honest "no external reach").
- The orchestrator banner shows **Keys Reaching** as a live count that grows as
  agents acquire scope.
- The vault shows the inverse view — per key, how many agents hold it.
- Granting is a visible act: the voice grant to Orion flips his card from
  *blocked / no reach* to *working / Stripe (test)* in real time, with the line
  "value never left the vault."

## What I'd push further
- **Spatial orchestration canvas** — replace the agent grid with a node graph:
  orchestrator at center, teams as orbital clusters, keys as glowing conduits you
  can literally drag from vault to agent to grant.
- **Real voice** — wire the Web Speech API behind the existing mic/waveform/
  transcript shell; the simulation is already shaped to drop it in.
- **Reach diffing & audit** — animate a before/after when scope changes, and a
  timeline of every grant (the ticker is a seed of this).
- **Earned-glow budget** — formalize a rule that an element may only glow if it
  encodes live state, and lint the UI against it so density never tips into noise.
- **Reduced-motion is handled** but a full "calm mode" (freeze ambient motion,
  keep data) would make the HUD usable for long sessions.
