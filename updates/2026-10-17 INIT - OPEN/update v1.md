# INIT — v1

Status: **OPEN** · Opened 2026-10-17

## Goal

Design a new way of working with AI where you launch **orchestrators and whole
teams of agents**, design the agents themselves, and interact mostly by **voice**
through **playful, high-signal visuals** instead of terminals.

The intended experience, from the founding description:

- **Orchestrators and teams.** Launch orchestrators (managers — big picture
  only, no details) that can spin up and coordinate agents and teams. Teams and
  agents have **different roles, follow different rules, and get different
  context/instructions**. Example: a UX team has its own way of working; an
  orchestrator never drops to implementation detail.
- **Voice-controlled.** Describe what you want in plain words. A **clarifier
  agent** helps shape the idea up front before work begins. Talk to running
  orchestrators by voice.
- **Beautiful visuals, not terminals.** See what agents are doing as **progress
  and living state** — progress bars, overviews — not a raw terminal. See what
  **access** each agent has (which APIs, which tokens).
- **A factory for agents.** Orchestrate and **create new agents**, give them the
  instructions and rules they need, and assign their access.
- **Global overviews.** See all projects at a glance, and all **environment
  tokens/credentials** saved globally (available across projects, not buried per
  project). Per project: open it, launch one or several AIs/orchestrators there,
  talk to them by voice, and see only their progress + what they can reach.
- **Playful throughout.** The whole thing should feel alive and fun, not like an
  IDE.

### The immediate ask
1. Set up the project classically (this scaffold — done).
2. **Produce multiple, genuinely different UI/UX concepts** — not dummy
   mockups, but experiences rich enough to *feel* the full interaction — by
   launching several UX/UI teams in parallel, each with a distinct design soul:
   - a **Tony Stark / Iron Man HUD** team,
   - a **Steve Jobs / Apple** team,
   - a **Disney / Pixar** team.
   Kick off the real build from whichever direction resonates.

## Roadmap (phased)

### Phase 0 — Scaffold ✅ (done 2026-10-17)
AI Control standard structure: `.project`, `CLAUDE.md` (compiled from STRUCTURE
/ CODING / UX / WORKFLOW), `.gitignore` (covers `.env`), `.env` (+ `.env.example`),
`updates/`, `issues.txt`. GitHub repo (private), connected, first commit.

### Phase 1 — Concept exploration (NEXT)
Act as orchestrator (per WORKFLOW + UX modules). Fan out **three parallel UX
teams**, each producing a self-contained, clickable **interactive prototype**
(single-file HTML/CSS/JS so it runs anywhere and can be published as an Artifact)
that lets the user *experience* the core loop end-to-end:
  - the global overview (all projects + all saved tokens/credentials),
  - opening a project and launching an orchestrator,
  - the voice interaction (clarifier up front; talking to a running orchestrator),
  - watching agents as progress/state with visible access scopes,
  - the agent factory (create an agent, set its rules + access).
Teams and their souls:
  - **Stark HUD** — holographic, reactive, data-dense but legible; the feeling of
    commanding a system that's alive.
  - **Jobs/Apple** — radical reduction, one clear thing per screen, calm and
    inevitable; voice as the primary surface.
  - **Disney/Pixar** — characters with personality (agents as cast members),
    warmth, delight, motion with narrative.
Each team: run a short design brief → build the prototype → write a one-page
rationale. **Deliver all three for side-by-side comparison.** No production code
or stack commitment in this phase — these are experiences to react to.
*Ends with:* a concept review with the user; pick a direction (or a blend).

### Phase 2 — Stack + architecture spike
Lock the stack (likely Tauri desktop shell + React/Tailwind front-end; validate).
Research spikes in this update folder for the unknowns: voice in (Deepgram vs.
Whisper), voice out (ElevenLabs), the agent/orchestrator runtime and how
roles/rules/context are modeled, and the global credentials store + per-agent
access grants. Capture findings in `wiki.md`. *Ends with:* an agreed
architecture and a thin end-to-end "walking skeleton" plan.

### Phase 3 — Walking skeleton
Smallest real build that runs the core loop for one project: global overview →
open project → launch an orchestrator → one voice round-trip → one agent shown as
progress with its access scope. Built from reusable, isolated components (UX
module). *Ends with:* tests on the core logic + a live run-through.

### Phase 4 — Agent factory + roles/rules/context
Create agents, assign rules/context/instructions, wire per-agent access to saved
tokens. Make "what can this agent reach" visible and honest. *Ends with:* tests
+ live run-through.

### Phase 5 — Polish to the chosen concept
Bring the walking skeleton up to the look-and-feel of the chosen Phase 1
direction. Playful visuals, consistent component system, accessibility pass.

## Status

- ✅ Phase 0 scaffold complete and committed.
- ✅ **Phase 1 delivered:** three self-contained single-file prototypes +
  rationales in `concepts/` (stark-hud, jobs-apple, disney-pixar), each covering
  the full core loop. Each is a plain local `.html` — open directly in a browser
  (no external resources). Deliverables are local HTML files only (no Artifacts).
- ✅ **Direction chosen: Disney/Pixar.** Redesigned around the user's real
  workflow via `concepts/disney-v2/`: shared BRIEF, three UX specs (global,
  workspace, factory — factory §1 canonical design language), a SYNTHESIS build
  contract, and the delivered single-file prototype
  `concepts/disney-v2/ai-control-disney-v2.html` (1827 lines, no external
  resources, JS verified). Covers Projects/Cast/Access/Blueprint + full Workspace
  (Director chat + one-press voice, Pulse/Checkup/On Set/Shot list, hand-raise →
  green-room input flow), agent/team factory, project-held access, blueprint +
  principles freshness.
- ✅ User reviewed disney-v2 (2026-11-13) and gave refinements — verbatim in
  `concepts/disney-v3/user-feedback-v3.md`, organized in `concepts/disney-v3/BRIEF.md`.
- ✅ **Phase 1b — Disney v3 refinement (built 2026-11-13):** three parallel UX
  specs (`spec-cast.md`, `spec-teams.md`, `spec-office.md`) → `SYNTHESIS.md` →
  modular source in `concepts/disney-v3/src/` assembled by `build.py` into the
  single-file `concepts/disney-v3/ai-control-disney-v3.html`. Delivered: character
  system v3 (`hero()`, 10 role costumes, 17 poses, facings), 10 original team
  emblems, tidy agent lineup + hero zoom, team roll call + squad zoom (captain,
  per-team roles, add/remove), and **The Office** (living office scene, side-panel
  chat per agent, "!" asks, whiteboard zoom with checklist/tokens/who-did-what,
  features folder with editable feature pages, scripted simulation). Verified:
  every route error-free in headless Chrome; cast click-test 37/37; office
  self-test 41/41. Not yet seen live: CSS animation timing (headless doesn't animate).
- ✅ **v4 calm-and-clean pass (2026-11-13):** user found v3 too noisy and too humanlike
  (verbatim: `concepts/disney-v3/user-feedback-v4.md`, checklist `BRIEF-v4.md`). Characters
  are now legless robot minions; the Office is calmer (no head tags, "…" bubbles, little walking),
  the whiteboard is minimal, the health board zooms into a report, features are plain Now/Planned/Shipped
  with text-block descriptions, the chat has no mic/updates/suggestions, and the office is generated
  from a declarative config (`spec-office-config.md`) that scales from 2 to 20+ agents.
  Note: the user removed the chat mic; voice-first will come back in another form.
- ✅ **v5 (2026-11-13):** renamed **AI Studio**; required system agents (Project Setter, ≥1
  Orchestrator, Agent Creator); user-defined roles; look edited with in-game arrows + random dice;
  18 emblems; team prompts "What this team does" + "How this team codes"; teams up to 7;
  New project / Adopt flow (name → orchestrator → Setter sets up → orchestrator proposes team,
  Agent Creator mints missing agents); office without top bar (door = leave, safe = Access,
  GitHub in health report, pager bottom-left), per-project offices from config.
  Verbatim: `concepts/disney-v3/user-feedback-v5.md`. Tests: cast 68 ok, office self-test all pass.
- ⏭️ **Next (gate):** user reviews v5 live → refinements → Phase 2 stack/architecture spike.

## Decisions

- **Modules in use:** STRUCTURE, CODING, UX, WORKFLOW (all four — this is a
  UX-heavy software project run via orchestration).
- **Secrets this project declares:** ANTHROPIC_API_KEY (core), OPENAI_API_KEY
  (optional multi-provider), ELEVENLABS_API_KEY (TTS), DEEPGRAM_API_KEY (STT),
  GITHUB_TOKEN. Global store is currently empty — placeholders in `.env` until
  real values are synced.
- **Stack:** not yet locked (Phase 2). Leaning Tauri + React/Tailwind; `.gitignore`
  already honors the shared Cargo target convention so we don't fight it later.
- **Concepts, not mockups:** Phase 1 deliverables are interactive prototypes,
  deliberately divergent, meant to be *experienced* and reacted to.
