# AI Control — Disney / Pixar concept

**File:** `disney-pixar.html` (single self-contained file, no external resources)

## The design soul
One idea runs through everything: **agents are cast members, not processes.** The
app is a *studio soundstage*, not a dashboard. The orchestrator is the **director**;
agents are the **crew**. Every agent has a face drawn in SVG, blinks, breathes
(subtle squash-and-stretch idle), and wears its emotional state on its sleeve —
it bobs while working, throws its hands up and sways when blocked, and does a
full squash-stretch jump when it finishes. Warmth is the point: rounded forms,
a warm twilight-violet stage lit by a golden spotlight, drifting dust motes, and
confetti when work ships. The personality is loud; the *system* behind it is
disciplined — one font (system), one small color scale, one reusable character
component, one card pattern, one progress primitive.

## The five-act core loop (all clickable)
1. **Overview** — projects as cards (each shows its little mini-cast peeking over
   the edge) beside a dark **Credential Vault**. Keys are always masked
   (`ghp_••••7Qx2`) and labelled with *how many agents* use them — never the value.
2. **Launch** — a soundstage with a spotlight. One hero button calls the
   **director** to the floor; it lands with a celebratory squash-stretch and a
   speech bubble ("big picture first — what are we making?"), then settles to work.
3. **Voice / Clarifier** — a glowing mic with an expanding ring, a live waveform,
   and a **streaming transcript**. Tapping the mic simulates listening → playing
   back what it heard → the clarifier asking *one* sharpening question, with quick
   voice-reply chips. It ends by "handing the brief to the director."
4. **Watch** — the director card up top, flagged **▲ Manager view / altitude: big
   picture**, over a grid of agent cards. Each card answers the two questions at a
   glance: a live **progress bar + task line** ("what is it doing?") and a **"Can
   reach" key row** ("what can it touch?"). Progress ticks up live; agents finish
   and celebrate with confetti; a blocked QA agent raises its hand for a Stripe key
   you can grant inline.
5. **Factory** — an assembly-belt preview on the left updates in real time as you
   name the agent, pick a role and a color, write its rules, and **toggle exactly
   which keys it may reach.** Minting drops the new cast member straight onto the set.

## How characters express *altitude*
Altitude is shown, not labelled-only. The **director is physically bigger**, wears
a **director's hat**, stands alone in the spotlight, and speaks in big-picture lines;
its card carries a literal "Manager view — big picture" tag and talks about
*coordinating* and *reassigning*, never wiring. **Agents are smaller**, sit in a
peer grid, and their task lines are concrete implementation detail. The hierarchy
reads instantly from size, hat, and position before you read a word.

## How access-scope stays honest
Scope is a first-class visual, never buried. Every agent card has a dashed-off
**"🔑 Can reach"** row of color-coded key tags; a key the agent *lacks but needs*
shows **locked and greyed** (the blocked QA agent), making the gap obvious and
grant-able in one click. The Factory's live preview shows the exact key set the
agent *will* get as you toggle, and an empty set reads "fully sandboxed." Values
are masked everywhere, including a visible "masked in logs too" reassurance.

## What I'd push further
- **Real spatial staging:** let the director literally walk agents on/off set and
  draw thin "assignment" lines from director to agent when a task is handed down.
- **Voice barge-in + emotion in the waveform:** color the waveform by sentiment,
  and let you interrupt a running orchestrator mid-sentence.
- **Blocked = story beat:** a raised hand should ripple to the director (it turns,
  reacts) so the *coordination* is visible, not just the individual state.
- **Earned celebrations:** scale confetti to the size of the win, and give each
  agent a tiny signature move so the cast feels individuated over time.
- **Credential provenance trail:** hovering a key shows the chain (vault → granted
  to project → granted to this agent) so "what can this reach" is auditable.
- **Reduced-motion is handled** (all heavy animation disabled), but I'd add a
  "calm mode" that keeps personality through expression/color rather than motion.
