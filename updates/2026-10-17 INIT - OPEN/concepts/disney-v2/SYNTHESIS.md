# Disney/Pixar v2 — SYNTHESIS (master build contract)

Three UX specs are done and coherent. This file resolves the seams and tells the
builder exactly how they fit into ONE self-contained HTML prototype. Read all of:
`BRIEF.md`, `spec-factory.md` (CANONICAL design language §1), `spec-global.md`,
`spec-workspace.md`, and the existing `../disney-pixar.html` (reuse its code).

## 1. Unified navigation (how the screens connect)

Two levels.

**Studio level** — a top pill nav (`nav.stages`, reuse v1) with FOUR stages:
```
Projects  ·  Cast  ·  Access  ·  Blueprint
```
- **Projects** = home/default (spec-global §1). The "On set today" vs "back lot"
  shelves + search.
- **Cast** = the Library (spec-factory §2): Agents / Teams tabs; `+ New` opens the
  Factory (spec-factory §3, agent designer / team designer).
- **Access** = the global Key Cabinet (spec-global §2A).
- **Blueprint** = starter kit + principles + freshness (spec-global §3).

**Project level** — clicking a project card on Projects **hands off to the
Workspace** (spec-workspace), a full scene with its OWN top bar (logo, name,
`← All projects` back to Projects, GitHub/privacy/test chips, bell) and the
Director-hero + Set-rail layout. The project's **per-project access toggles**
(spec-global §2B `project-access-grid`) live INSIDE the workspace, reached from a
small "Access" affordance in the workspace (link/tab), not inline in the rail.

`← All projects` returns to the studio-level Projects stage. The pill nav is
hidden while inside a project (the workspace back button replaces it), matching
v1's `data-view="workspace"` pattern.

## 2. Canonical design language

`spec-factory.md §1` is the single source of truth for every character, team
troupe, and the director — palette, cast SVG anatomy, the four moods, identity
accessories (trait/prop), team troupe badge, director treatment, motion tokens,
reduced-motion. ALL screens render characters through this one system. Reuse and
EXTEND the existing `castSVG`/`cast`/`shade`/`keytag`/`fireConfetti`/`toast`
helpers from `../disney-pixar.html` — do not re-invent them.

## 3. ONE reconciled roster (important — specs used two naming sets)

Use a SINGLE cast across the whole app. The library definitions (spec-factory
§4.1, the funny names) ARE the agents that appear working in the Workspace. Map
the workspace's short crew names onto the canonical funny-named definitions:

```
Workspace live crew   →  Library definition (canonical)
Pip   (Frontend)      →  Pixel Pete        (teal, beanie, paint-brush)
Bolt  (Backend)       →  Captain Semicolon (sky, sailor-cap, wrench)
Sage  (QA, blocked)   →  Scarlett Scenario (coral, deerstalker, clipboard)
Dot   (Design)        →  Twinkle           (rose, beret, paint-brush)
Vera  (Data, solo)    →  Querious          (sky, propeller, magnifier)
```
Pick ONE display name per character and use it everywhere (prefer the funny
canonical names; that's the product's personality). Director = **Pixel** (sun,
director cap, megaphone). Teams = **Ship-It Squad** (sun 🚀) and **Polish
Patrol** (mint 🧹) from spec-factory §4.2; the workspace's "Storefront/Payments"
teams should be realized as these (or renamed consistently) — keep team identity
(color+emblem) identical wherever a team appears (Library, On Set, troupe badge).

Projects, access entries, blueprint tree, principles, freshness: use the sample
data verbatim from spec-global (Aurora Storefront is the openable one that leads
to the fully-populated Workspace).

## 4. Scope & priorities for the single build

Deliver every screen, all navigable, with believable simulated data and the
Disney soul. Priority order if time-boxed:
1. **Projects home** (first impression) + **Workspace** (the heart: Director chat
   with one-press simulated voice, Pulse, Checkup, On Set, Shot list, the
   hand-raise → green-room input flow). These two must feel great.
2. **Cast** library + **Factory** (agent designer with live character preview +
   team designer with troupe + three-layer instructions).
3. **Access** cabinet + per-project grid; **Blueprint** tree + principles +
   freshness.

Wire the simulated loop (spec-workspace §8): a light timer advances working
agents, completes a feature → celebrate → Shot-list Done, and fires the Sage/
Scarlett hand-raise on a delay so the input flow demos end-to-end.

## 5. Non-negotiables
- ONE self-contained `.html`; all CSS/JS/SVG inline; NO external resources; NO
  Artifacts (deliver as a local file only).
- Voice = one-press inside the Director chat only; full typed equivalent always.
- Secrets always masked (last-4); access is project-held, agents none by default.
- Accessibility per each spec's a11y section: contrast, keyboard, focus rings,
  labels, `role`s, live regions, `prefers-reduced-motion`, never color/motion
  alone.
- Simpler & nicer than v1: one obvious primary action per screen;
  summarise-then-expand to keep dense surfaces calm.

## 6. Output
Write the prototype to:
`updates/2026-10-17 INIT - OPEN/concepts/disney-v2/ai-control-disney-v2.html`
