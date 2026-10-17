# Disney/Pixar v2 — workflow-matched redesign brief

The user picked the **Disney/Pixar** soul (agents as cast members with faces,
moods, warmth, playful customization). This v2 redesigns the whole experience to
match how the user actually works. Starting aesthetic = the existing
`concepts/disney-pixar.html` (reuse its character SVG system, warm palette,
rounded forms, confetti/celebration, reduced-motion support). Make it **simpler
and nicer to use** than v1 — fewer steps, obvious next action, calm but playful.

Deliverable is a **single self-contained local `.html` file** (all CSS/JS/SVG
inline, NO external resources, NO Artifacts — ever). Fully clickable with
believable simulated data.

## How the user works (verbatim intent, organized)

### 1. Projects home (the first thing)
- See **all my projects** at a glance.
- Each project has **its own uploaded logo/icon** (stored in its main file) for
  fast visual recognition — simulate uploaded logos (distinct per project).
- **Two separate groups:** "projects I'm working on" (active) vs "projects in my
  database" (all saved/archived). Keep them visually separate.
- **Super easy search** across projects.

### 2. Project workspace (opening a project — the main surface)
When opening an existing project, show rich at-a-glance state:
- **Standards health ratings.** An AI periodically audits the project against our
  standards and rates: how **modularized** it is, how **clean** the code is, how
  much **feature reusability** there is. Show these as ratings/scores.
- **Feature list:** features already **done** + features **planned** (one list is
  fine; make done vs planned legible).
- **Orchestrator = the AI chat (your manager).** The big thing in the project.
  You talk with it. It can **launch teams and agents** to work on the project.
  - **Voice is just a feature of the orchestrator:** open a project and with
    **one press** start talking to the orchestrator. Not a separate screen.
  - Manager is **always available to chat** and can always **check progress** of
    agents/teams.
  - See, in a **nice way, which agents and teams are working on what.**
- **Overall project progress bar**, and/or progress of the **current feature(s)**
  being implemented.
- Always visible: **connected to GitHub?** and **private or public?**
- **Where to test the app now:** if testable at a **URL**, show the URL; if it's
  an app you open, show an **"open app"** capability.
- **Input-request notifications on top:** if any agent/orchestrator needs user
  input, show a notification at the top. Inside the project, an agent visibly
  **asks for input**; you open it, see what it's asking, and give it the
  input/example.

### 3. Agents library (definitions)
- A window listing **all defined agents**. An **agent = a definition** with a
  **system prompt** specific to that agent.
- The **orchestrator can only use these defined agents**.

### 4. Agent & Team factory
- **Design agents** (the definition + system prompt).
- **Create teams of agents:** a team has **its own instructions**, and **each
  agent in the team also has specific instructions** — so an agent's AI carries
  context for **itself AND its team**.
- The orchestrator can choose to call **a single agent OR a whole team**.
- Keep the **playfulness:** design **colors**, pick how **agents and teams look**
  (the Disney cast look), and **funny naming**. This stays fun.

### 5. Access (managed by PROJECT, not per-agent)
- Access lives in the **global overview** and/or an **access settings** area.
- An access entry = **API key** + **what the access serves** (description) +
  optional **where to find its documentation** + optional **extra instructions**.
- **Agents have NO access by default.** The **PROJECT holds access.** Access is
  **managed at the project level.**
- In a project: see **all possible access capabilities** and **toggle each
  on/off** (allow/deny per project).

### 6. Global shared files / default setup / principles
- See the **global shared files**: the default files + default instructions
  created whenever a project is established.
- See **how the default setup looks**, and **adjust** it — the **MD file
  descriptions** and the **overall folder structure** of a new project.
- **Principles:** new projects follow principles (AI establishes/looks for them).
  See those principles, and **per-project, see whether the principles are up to
  date** for that project.

## Design rules to honor
- Disney soul: characters/cast, warmth, delight, story — but **high-signal and
  legible**; personality must not crowd out state.
- Simpler than v1: one obvious primary action per screen; minimal chrome.
- Voice = one-press inside the orchestrator chat only.
- Never show secret values (API keys always masked).
- Accessible: contrast, keyboard reachable, focus states, labels,
  prefers-reduced-motion.
- Single self-contained `.html`, no external resources, delivered as a local file.
