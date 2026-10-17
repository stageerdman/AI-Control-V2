# User flow — the user's own description (verbatim intent)

Captured 2026-10-17. This is the user's own description of how they use AI Control,
in their words (lightly de-transcribed, meaning preserved). The organized,
build-ready version lives in `BRIEF.md`; this file preserves the source so nothing
drifts as we iterate. The Disney/Pixar v2 prototype
(`ai-control-disney-v2.html`) is the first build against this.

---

We're going with the **Disney vibe**, but improve the UX of the whole thing so it
matches my behavior easily and is very simple and nice to use. Here's how I use it:

- **First thing: I want to see all my projects.** The projects should have
  interesting icons so I can recognize them fast — let's say each project has a
  **logo of its own, uploaded to its main file**.

- I then **open a project**. In the project — especially an existing one — I want
  to see **several statistics about it**. I want to see **how organized it is
  against our standards**: an AI, once in a while, could check e.g. how
  **modularized** it is, how **clean** the code is, how much **reusability of
  features** there is — and give a **rating** of that.

- I also want to see the **list of all features** in the project that are already
  **done** and the ones **planned**. They can be in one list, that's okay.

- The **big thing in the project is the AI chat**. There can be several, but it's
  an **orchestrator** — my **manager** that I'm talking with. The orchestrator can
  **launch teams and agents** that will work on the project. In some nice way I
  want to **see what agents and teams are working on what**. The manager is
  **always available to chat** and can **always check the progress** of the agents
  or teams. I can see an **overall progress bar of the project**, or of the
  **current feature(s)** being implemented.

- I can **always see whether the project is connected to GitHub**, if it's
  **private or not**, and **where I can test the app** currently: if I can test it
  on a **URL**, I should see the URL; if I need to open the app, I should see the
  capability to **open the app**.

- **If any agent or orchestrator requires user input**, I should see
  **notifications on top**. In the project I should see an agent somehow **asking
  me for input** — I'd open it, see what they're asking, and **give them the
  example / input**.

- I want a **window where I can see all the agents we have defined**. An **agent is
  basically a definition** that has a **system prompt specific to that agent**. The
  **orchestrator can only use these agents**.

- I want an **agent factory** where I can **design the agents**, and also where I
  can **create teams of agents**. A **team** has **specific instructions**, and
  then **each individual agent** in it also has **specific instructions** — so the
  agent's AI has context not only for itself but also for the team. The
  orchestrator can always decide whether to call **a single agent or the whole
  team**.

- **Keep the playfulness**: being able to design the **colors** and pick how
  **agents and teams look**, and **funny naming** capabilities — leave that, it's
  fun.

- I always want to see **separately the projects I'm working on** and **separately
  the projects I have in my database**, and be able to **search projects super
  easily**.

- The **voice should just be a feature of the orchestrator** — so I can open a
  project and with **one press** start talking with the orchestrator.

- **Access / keys**: I want to see this in the **global overview** or some **access
  settings**. In access I do the following: I **provide API keys**, I **describe
  what the access is serving**, and I **optionally describe where to find
  documentation** for this access, or provide **more instructions**. The keys /
  access are **NOT provided to agents** — **agents by default don't have access**.
  **The project has access.** Access is **managed by the project**. In a project I
  want to see **all the possible access capabilities** and be able to **allow them
  or turn them off**.

- I also want to see **global shared files**: when we establish a project we
  create some **default files with default instructions**, and I want to see **how
  the default setup looks** and be able to **adjust it** — adjust what's in the
  **MD file descriptions** and the **overall folder structure** of the product. So
  whenever I create a new project it follows some **principles** — usually AI
  establishes that, but AI looks for some principles. I want to **see those
  principles** and, in each project, see **if the principles are up to date**.
  First that; second, the capability of **managing how the original folder looks**.

---

**Status note:** user reviewed the Disney v2 prototype and likes it. Some
improvements remain (to be specified next session). Continuing later.
