# Disney v4 — "calm & clean" refinement checklist

Source: `user-feedback-v4.md` (verbatim). Everything not listed stays as in v3.
The theme of this round: **too noisy → calm, minimal, clean.** When in doubt, remove.

## R. Characters → robot minions  (owner: hero.js / hero.css)
- [ ] R1 No legs, nothing humanlike. Little **robot minions / bots** (the user liked v2's bot-ness): rounded
      chassis + screen-or-visor face with expressive eyes, antenna, hover base (floating with a soft
      shadow) or tiny wheel/tread — no legs, no human limbs. Small mitten/claw arms are OK.
- [ ] R2 Keep personality: hue, a few chassis shapes, role gear still readable (hat/tool/badge on a bot).
- [ ] R3 Keep the `hero()` interface and all pose names so screens keep working (walking = gliding/hovering).
- [ ] R4 Less fidgeting: idle animation subtle (gentle hover bob, blink). Nothing jittery.

## O. The Office  (owner: office-*.js, office.css, data-office.js)
- [ ] O1 Much less movement: agents mostly stay at their spot; walking is rare and purposeful. Fix path-finding lag (no stalls/teleports).
- [ ] O2 No status tags above heads. Show what someone is doing **only on hover/focus**.
- [ ] O3 Agent↔agent talk = plain chat-bubble icon (…), no text.
- [ ] O4 Fewer interactive objects. Clock NOT clickable. Only: agents, whiteboard, health board, features folder (+ door/List if needed). Everything else is decor.
- [ ] O5 Push (outbox) + deploy station move to the **left side** of the room, away from the whiteboard.
- [ ] O6 Remove headless bodies (jackets/figures on chairs etc.). Nothing creepy.
- [ ] O7 **Whiteboard zoom = super minimal**: the overall % number, features in progress now, the task list. No who-did-what, no A/B/C, no token breakdown clutter (a single team-token total is OK only if it stays clean — default: leave it out).
- [ ] O8 Fix the background glitch while zoomed on the whiteboard.
- [ ] O9 **Health board stays as a standalone object** (user likes it). Click → zoom → a short report on Modularity, Cleanliness, Reusability (what's good, what to fix).
- [ ] O10 **Features folder super clean**: three groups Now / Planned / Shipped, identical rows; shipped just carries a green mark. No who-shipped-what.
- [ ] O11 Feature page: description + vision as **one editable text block** each (plain textarea feel), not line items.
- [ ] O12 Chat panel: remove dictation/mic, remove "office updates" entries, remove suggested replies. Just the conversation + composer.
- [ ] O13 List view: keep, drop the "Around the office" section.
- [ ] O14 **Scalability**: the office is generated from a simple declarative config (teams → members, solo agents) — pods/desks/rooms auto-layout from 2 agents up to many teams. Demo switcher (`?demo=size2`, `size6`, `size12`, `size20` or a small dev control) to show 2 workers, the Aurora default, and a big multi-team office. This config is what an AI would write when it sets up a project — document its shape in `spec-office-config.md`.
