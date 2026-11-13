# Disney v5 — checklist + shared contract

> **Contract implemented** (Builder A, commit 43da2ae — `data-cast.js` + `hero.js`):
> `AGENTS[i].kind` ('agent'|'setter'|'orchestrator'|'creator'), `kindOf(a)`, `AGENT_KINDS`, `KIND_LABEL`, `KIND_ABOUT`;
> system agents `a-setter` (Rivet), `a-pixel` (Pixel) + `a-maestro` (Maestro) orchestrators, `a-creator` (Tinker) — appended AFTER the regular ten;
> `systemAgents()`, `orchestrators()`, `agentsOfKind(k)`, `isSystemAgent(a)`, `castOrder()`;
> `DIRECTOR` is now a `let` = current orchestrator — call `useOrchestrator(PROJECTS[i].orchestrator)` when opening a project; `agentById('director'|'pixel')` → it;
> `canDeleteAgent(a)` → `{ok, why}`, `deleteAgent(id)` → undo rec, `restoreAgent(rec)`; system agents can't join teams (`addMember` refuses).
> Roles: `ROLES` = `[{id, name}]` (records stringify to their name), `roleById`, `roleByName`, `roleName(x)`, `roleUsage(id)`, `addRole(name)`, `renameRole(id, name)`, `deleteRole(id)` → undo rec, `restoreRole(rec)`.
> **`agent.role` stays the role NAME string** (display-safe); `PROMPT_TEMPLATES` removed. B: in `data-office.js _wsGen` prefer `ROLES[k].name` (works either way).
> Look: `agent.look = {hat, tool, body, antenna, face, hue, decal?}`; `applyLook(agent, slot, v)`, `setWholeLook(agent, look)`; hero.js `HATS`, `TOOLS`, `LOOK_SLOTS`, `lookFromLegacy(a)`, `randomLook()`, `lookAnchors(look, px)`. Agents without `look` still render from v4 fields.


Source: `user-feedback-v5.md` (verbatim). Everything not listed stays as v4 (calm, minimal,
robot minions). Three builders, disjoint files — see ownership.

## Shared data contract (Builder A implements in data-cast.js; B and C code against it)
- `AGENTS[]` entries gain `kind: 'agent' | 'setter' | 'orchestrator' | 'creator'` (default 'agent').
  - **Project Setter** — exactly one (`kind:'setter'`, id `a-setter`), technician look, editable prompt, cannot be deleted.
  - **Orchestrators** — one or more (`kind:'orchestrator'`); Pixel becomes `a-pixel` (`agentById('director')`/`'pixel'` keep resolving to the project's orchestrator for back-compat). At least one must always exist (last one can't be deleted).
  - **Agent Creator** — exactly one (`kind:'creator'`, id `a-creator`), cannot be deleted.
  - Helpers: `systemAgents()`, `orchestrators()`, `agentsOfKind(k)`.
- **Roles are user-defined**: `ROLES` becomes an editable list of `{id, name}` (seed a few, all renamable/deletable); `agent.role` = role id or free name. Role is just a label + prompt context — it NO LONGER drives the look.
- **Look is independent of role**: `agent.look = {hat, tool, body, antenna, face, hue}` (slot ids from hero.js `LOOK_SLOTS`). `hero()` renders from `agent.look`; old agents get looks migrated from their old role gear so they still look the same.
- Agents are **shared definitions**: many projects can use the same agent; each project runs its own instance, **no shared memory**. Show that honestly on the agent page.
- `PROJECTS[]` entries gain `orchestrator: <agentId>`; `PROJECTS[i].github = {connected, private}`; drop the online test URL (apps run locally).

## A. Cast, looks, roles, system agents, emblems  (owner: cast.js, teams.js, cast.css, data-cast.js, hero.js, hero.css, emblem.js, emblem.css, gallery.js)
- [ ] A1 More emblems (~8): playful **nods** to Apple, SpaceX and other popular culture (e.g. rainbow-stripe fruit, booster landing on a droneship, Falcon-ish grid fins, Matrix rain, flux capacitor, arcade ghost, a lightsaber duel, pizza planet…). Same patch style as the existing 10. **Original artwork that evokes — never a real logo/wordmark.**
- [ ] A2 System agents: Project Setter (technician: hard hat/tool belt/clipboard look), Orchestrators (Pixel + one more demo orchestrator), Agent Creator (inventor/designer look). Shown in Cast as a distinct "Studio crew" group at the front of the lineup with a small "Required" marker; prompts editable; delete rules enforced (setter/creator never; orchestrators down to 1).
- [ ] A3 Custom roles: create, rename, delete roles (simple inline list/combobox on the agent page: pick existing or type a new one). No fixed 10 roles.
- [ ] A4 In-game look editor: on the hero zoom, **arrows ‹ › next to the character** for each slot (hat at head level, tool at hand level, body, antenna, colour…) like a game character creator; one **dice = random look** (looks only). Remove the look chips from the right panel and remove the name dice.
- [ ] A5 Agent page states "Used in N projects · each project runs its own copy — no shared memory."
- [ ] A6 Teams: unchanged except roles shown are the agent's custom role.

## B. The Office  (owner: office-*.js, office.css, data-office.js)
- [ ] B1 Drop the top bar entirely inside a project.
- [ ] B2 **Door = leave the office** (back to Projects). Hover label "Leave office".
- [ ] B3 **Safe** behind the Director's desk = **Access** (project access grants, masked). Clickable.
- [ ] B4 Health report gains **GitHub: connected · private/public** (and the project's local app run info, e.g. "Runs locally — open with …"). No online test URL anywhere.
- [ ] B5 **Pager** bottom-left: a small playful pager device listing teams/agents that need you; scroll through; click → camera pans to that team's pod and highlights it. If you visit and do nothing, it drops off the pager (doesn't come back unless a new ask arrives). The "!" over agents stays as is.
- [ ] B6 The Director is the project's chosen orchestrator (from `PROJECTS[i].orchestrator`).
- [ ] B7 Agent Creator moment in the sim: when the orchestrator needs someone new, the Agent Creator walks in through the door, a new bot "assembles" at a free desk, creator leaves. Project Setter only appears in the setup flow (C).
- [ ] B8 Overall % stays visible somewhere minimal (e.g. on the whiteboard and/or Director's wall) now that the top bar is gone.

## C. Studio shell + project creation  (owner: studio.js, data-studio.js, core.js, app.js, base.css, studio.css, shell.html)
- [ ] C1 Rename **AI Control → AI Studio** everywhere (title, logo text, copy).
- [ ] C2 **New project / Adopt existing** flow: (1) name/folder (adopt = pick an existing folder not yet under AI Studio), (2) **choose an orchestrator** (character picker, at least one exists), (3) **Project Setter** runs setup — shown as a short playful progress scene (technician bot sets up scaffold: .project, CLAUDE.md, .gitignore, updates/, issues.txt, GitHub), (4) orchestrator enters and **proposes a team** (from Cast; may say "I'll ask the Agent Creator for a <role>" — Agent Creator mints the agent/team, it joins the Cast), (5) open the new project's office. Keep it calm, few steps, keyboard accessible.
- [ ] C3 Projects data: `orchestrator`, `github {connected, private}`, no test URL.
