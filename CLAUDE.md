# AI-Control-V2

A voice-controlled command center for running AI the way you'd run a studio:
launch orchestrators and whole teams of agents, design the agents and the rules
they follow, and watch everything through playful, high-signal visuals instead
of a terminal. Orchestrators act as managers (big picture only); teams (UX,
engineering, etc.) each have their own roles, rules, and context. You describe
what you want by voice, a clarifier agent helps shape the idea, and a factory
lets you mint new agents, wire their access to APIs/tokens, and see overviews of
every project and every saved credential.

This file is compiled from the global modules in `~/.ai-control/modules/`
(STRUCTURE, CODING, UX, WORKFLOW). Rebuild it with the `rebuild-claude-md`
routine when the modules change. Keep project-specific rules in the last section.

---

## Structure

Every project carries the standard AI Control scaffold:
- `.project` — the project marker: the `modules:` it uses, its `secrets:`, and `claude_md_generated`.
- `CLAUDE.md` — this file, compiled from the global modules.
- `.gitignore` — always covers `.env`.
- `.env` — this project's secrets (never committed).
- `updates/` — one folder per update.
- `issues.txt` — running list of known issues and TODOs.

The `updates/` folder: each update is `updates/YYYY-MM-DD <NAME> - OPEN/` while
in progress, flipped to `- CLOSED/` when done (reopen by flipping back). Inside:
- **`update vX.md`** — the version-X plan (`X` starts at 1): goal, phased
  roadmap, and live status (what's done, decisions made, what's next). Bump to
  v2, v3… on a substantial rework.
- **`wiki.md`** — durable decisions and lessons this update taught: principles,
  what works and what doesn't. Knowledge, not status.
- **Optional extra files** — logs and any isolated research-spike code.

Per-ecosystem conventions: follow each stack's own norms (`src/`, `tests/`, the
standard layout). Keep small projects flat; add folders only as the project
grows into them. **Rust/Tauri:** build output goes to the shared Cargo target
(`~/.cargo-shared-target`), never a per-project `target/` — don't add a
`target-dir`/`CARGO_TARGET_DIR` override. A missing local `target/` is expected.

**Modular by default:** structure everything so any piece can be understood and
fixed in isolation, with its own bounded context — clear boundaries, minimal
cross-coupling.

## Coding

- **Modularize for isolated context.** Write code so any part can be picked up,
  understood, and fixed on its own. Draw clear module boundaries with small,
  explicit interfaces; keep cross-module coupling low so a change stays contained.
- **Keep it minimal.** Build only what's truly needed — no abstraction, config,
  or layers on speculation. Prefer reuse over duplication, but don't
  over-generalize before there's a second real caller.
- **Test what matters.** Cover core logic, risky paths, and anything that would
  silently regress; skip tests for trivial glue. Phases in a roadmap mostly end
  with tests that lock in what they built.
- **Idiomatic to the ecosystem.** Match the conventions, naming, and idioms of
  the stack and surrounding code. Read the neighbors before writing; follow the
  ecosystem's standard tooling for formatting, linting, and layout.

## UX

This project is almost entirely a user-facing surface, so UX is first-class.
- **Always bring in UX experts.** For any user-facing surface, launch a
  dedicated UX expert agent to think the experience through. For a surface with
  multiple parts, launch several in parallel — each owning a part — and act as
  the orchestrator synthesizing their thinking.
- **Cut everything unnecessary.** Approach every UI as Steve Jobs would:
  relentlessly remove anything that isn't truly needed. Default answer to a new
  element, option, or screen is "does this earn its place?"
- **Minimal visual system.** Keep fonts to one or two, used consistently; same
  discipline for colors, spacing, and sizes — a small, deliberate scale. Aim for
  a polished, modern result; lean on solid primitives (Tailwind / shadcn-style)
  rather than hand-rolled one-offs.
- **Standardized, reusable, isolated components.** Define a thing once and reuse
  it everywhere. Keep each component isolated with a clear interface so it can be
  restyled or fixed without touching the rest.
- **Fundamentals.** Responsive across targeted sizes; accessible by default —
  real contrast, keyboard reachability, sensible focus, meaningful labels.
  Sensible defaults, fast feedback, and honest error states over decoration.

Note: the product's own aesthetic is intentionally playful and visual (progress
bars and living overviews instead of raw terminals). "Minimal" governs the
*system* — few primitives, no clutter — not the *personality*.

## Workflow

- **Commit AND push after every change.** No change left uncommitted or
  unpushed. Each working change is its own small, focused commit — one logical
  unit — pushed to the remote immediately. Never commit secrets (`.env` stays in
  `.gitignore`). Everything lives on GitHub.
- **Roadmaps and phases.** Any non-trivial update starts with a roadmap broken
  into phases, recorded in the update's `update vX.md`. Most phases end with
  tests that lock in what they built. Track status as you go.
- **Research spikes.** For a new API, unfamiliar library, or genuinely new
  design, run a throwaway spike outside the main code, inside the update folder,
  in an isolated environment. Capture findings in the update's `wiki.md`.
- **Act as an orchestrator.** Prefer delegating to focused agents over doing
  everything inline: decompose, fan out, synthesize. For anything with a UX
  dimension, launch UX expert agents (several in parallel for different parts).
- **Verify before moving on.** Verify by running the actual thing, not just a
  green test, before you commit and move to the next phase.

---

## Project-specific rules

- **Voice-first.** The primary interaction is voice: describe intent in words, a
  clarifier agent shapes it. Every feature should have a sensible voice path, not
  only a click path.
- **Show programs, not terminals.** The user watches *progress and state*
  (progress bars, living overviews, what access each agent has) — never a raw
  terminal. Treat the terminal as an implementation detail to be hidden.
- **Roles carry different context.** Orchestrators get the big picture only;
  teams and agents get role-specific rules, context, and instructions. Preserve
  this separation in both the data model and the UI.
- **Secrets are a first-class view.** Tokens/APIs are saved globally and granted
  per agent/project; the UI must make "what can this agent reach" visible and
  honest. Never surface secret *values* in the UI or logs.
- Stack is not yet locked — see the current update's `update vX.md`. Likely
  direction: Tauri (Rust) desktop shell + React/Tailwind front-end, which is why
  `.gitignore` already honors the shared Cargo target convention.
