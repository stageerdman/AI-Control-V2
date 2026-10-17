# Concept — Steve Jobs / Apple soul

**File:** `jobs-apple.html` (single, self-contained, offline via `file://`)

## The core idea
One calm canvas. Not a dashboard — a surface that holds exactly one thing at a
time and lets your voice move between things. The whole product is really only
**two places** (an Overview and a Project workspace) plus a single mic that is
always present at the bottom center. Everything else — launching, clarifying,
watching, building an agent — happens *inside* those two places as quiet state
changes, never as new screens to learn. The result should feel obvious in
hindsight and almost empty in the best way.

## What I deliberately removed, and why
- **No terminal, no logs, no raw output.** The two questions that matter —
  *what is this doing* and *what can it reach* — are answered by a progress
  bar, a one-line status, and a row of access chips. Nothing else earns its
  place.
- **No persistent navigation / sidebar / tabs-of-tabs.** A product with a
  sidebar is a product that doesn't trust its own hierarchy. There is a back
  chevron and Escape. That's the whole navigation model.
- **No settings surfaces, badges, counts, toolbars, or dense tables.** The
  credentials "Vault" is a plain list; projects are four large rows. Whitespace
  does the organizing.
- **No numbers the orchestrator shouldn't see.** The orchestrator card shows a
  single mission line and one overall percentage, labeled *"big picture only."*
  Detail lives with the agents, deliberately out of the manager's view.
- **One accent color, one typeface (the system stack), a six-step type scale and
  an eight-step spacing scale.** Status gets a green/amber/grey dot and nothing
  more. The restraint *is* the design system.

## How voice becomes the primary surface
The mic is the only control that is always on screen, centered, and the largest
interactive element in the dock. It is a true **hold-to-talk** affordance
(pointer down to listen, release to send; Space/Enter for keyboard) with a
breathing ripple while listening. Released speech appears as **large,
transcribed intent** — the hero typography of the whole app — and the system's
reply types back underneath with a small equalizer "speaking" indicator that
stops when it finishes (fake TTS, scripted and timed).

Crucially, **voice drives navigation and action**, not just chat: "Open
Northstar" opens the project, "Launch the orchestrator" launches it, "Add a QA
agent" opens the factory, "Give the design agent access to GitHub" actually adds
a GitHub chip to that agent. The mic is context-aware — what you can say, and
what it does, depends on where you are — so the voice feels like it's holding
the same single canvas you're looking at.

## How altitude (orchestrator vs agent) is expressed with minimal UI
Altitude is shown by **what is withheld**, not by extra chrome:
- The **orchestrator** is a single breathing orb that becomes a one-line
  *mission + one overall %* card. It never shows a task list, logs, or access —
  it is explicitly stamped *"big picture only."*
- **Agents** are small cards that each show one live status line, one progress
  bar, and their access chips — the detail the orchestrator is kept away from.

Same visual family, deliberately different information density. You can *see*
the separation of concerns without a single label explaining it.

## How access / credentials stay honest yet calm
Credentials are saved **once, globally**, in a Vault that opens with a plain
promise: *"Saved once. Granted to agents one at a time. The values themselves
are never shown."* Every token is masked (`••••7Q2A`) with its provider, kind,
and real-world scope ("used by 4 agents") — never the secret itself. Each agent
card carries a **"Can reach"** row of lock-icon chips, so the honest answer to
*"what could this agent touch"* is always one glance away. Granting access is a
calm, visible event (by voice or in the factory), not a buried permission
dialog. Honesty is achieved by showing *scope*, and calm by never showing more.

## What makes this soul distinct from a HUD or a playful approach
- **vs. the Stark/HUD soul:** the HUD's thesis is *density made legible* — many
  live readouts, reactive glow, the feeling of commanding a system. This soul's
  thesis is the opposite: *subtraction*. One thing per moment, generous
  emptiness, motion so subtle it reads as inevitability rather than spectacle.
  Where the HUD surrounds you with information, this hands you a single sentence
  and a mic.
- **vs. the Disney/Pixar soul:** that soul gives agents characters and narrative
  warmth. Here agents are quiet instruments with plain one-word names (Scout,
  Studio, Quill) and no personality performance — the delight comes from
  precision and calm, not charm. The emotional register is *trust*, not *fun*.

In one line: the Stark soul makes you feel powerful, the Pixar soul makes you
feel delighted, and this one makes you feel **certain** — that the system is
handled, and that there is nothing here you need to manage that isn't in front
of you.
