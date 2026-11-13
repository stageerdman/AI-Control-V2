# PROGRESS — U2 Projects home + project setup space — ✅ done (fake runner only)

Resume notes. Code: `app/src/features/projects/` (Projects home) and `app/src/features/setup/` (the `#new` space).
Spec = the prototype (`concepts/disney-v3/src/js/studio.js`, `studio-new.js`, `css/studio.css`, `css/studio-new.css`).

## Built
- **Projects home** (`#projects`): the prototype's head ("The Studio Lot"), **Reports** button (unread coral dot from
  `GET /reports`, links `#reports` — U4's page), "+ New project", search (press `/`, Esc clears, kept across visits) with the
  live count line, shelves **In setup** (drafts) · **On set today** (live / needs) · **The back lot** (idle / draft / archived).
  Cards: logo tile (`project.tile`), orchestrator nick · agent count (team members + specialists, once each), mini-cast of real
  heroes (first one in `needs-input` when the project needs you), progress, note, GitHub badge; back-lot rows with
  "edited 2d ago" + Public. Loading / error (retry) / empty / no-match states.
- **Setup space** (`#new` → `#new/<draftId>`), every step on the drafts API, saved as you go (debounced PATCH, flushed on step
  change and on leaving); drafts show as "In setup" cards (tile, "Adopting · Team · Pixel", five step dots, ✕ delete with Undo via
  the trash token) and resume exactly at their step.
  0 Start (crew on stage; picking new/adopt creates the draft — `#new` alone leaves nothing behind) ·
  1 Name + "What is it?" (live tile + the real sandbox path; adopt = roving radio list from `GET /sandbox/folders`, git / .project
  meta, name suggested from the folder) · 2 Orchestrator (the stage is the radio group, ← →, quote from its prompt; picking a
  different one after a chat starts the team talk over) · 3 **Team** (plan on stage: squads under emblems with their own captains,
  specialists, the Creator's briefs as ghost robots + one "Tinker designs … when you accept" line; side chat — the orchestrator
  opens with a proposal once per draft, each message is one real turn, typing bubble, the message is kept on failure; **Accept** →
  Tinker on stage while `POST /accept` mints, minted teams/agents tagged "new" + celebrating, Tinker's chat lines, then
  "Set it up →"; nothing to mint → straight on) · 4 **Setup** (the Project Setter: checklist + progress driven live by
  `setup.step` from `GET /drafts/:id/events`, the finish response is the truth; then the project gets the draft's tile and goes
  on set (`status: live`); "Open the office →" → `#office/<id>` with confetti; failure = frustrated Setter, the server's message,
  Back / Try again).
- Focus follows the prototype: each step focuses its target (`[data-autofocus]`) or its heading; Enter continues on Name;
  `aria-current="step"`, `role=log` chat, progressbar values; reduced motion stops confetti / typing dots.

## Decisions / deviations (real data)
- **Step order is Start · Name · Orchestrator · Team · Setup** (prototype: … Setup · Team). The server's Setter
  (`POST /drafts/:id/finish`) creates the project and deletes the draft and refuses until the plan is accepted, so chat + accept
  must come first. ⚠ The user said in v5 "orchestrator enters after the technician set up the project" — keeping that order needs a
  backend split (a draft-scoped, idempotent `POST /drafts/:id/setup` that scaffolds, and `finish` = create the project only).
  Flagged for the user; the UI change would be just the step order.
- New agents/teams are briefs until accept (the prototype minted mid-chat) → ghosts on stage, minted on Accept.
- The Creator stays on stage ≥ 1.2 s (prototype 1.4 s) so a fast mint is still seen.
- A new project is PATCHed to `status: live` + the draft's tile after finish (server default is idle + a default tile).
- Mode is fixed per draft on the server → "Back" to Start and picking the other mode makes a new draft (name/about carried) and
  removes the old one.

## Tests (22 in my folders; app total 151 at commit time)
`setup/flow.test.ts` (step machine: what each step needs, orchestrator change resets the talk, quote; slugify = server; folder
title / ~ path; draft card mapping incl. clamping; plan view from API shapes — captains from the team, duplicates ghosted,
fresh tags, counts and lines; Setter checklist fold — live steps, kept/skipped, new-run reset, failure, unknown steps, finish
truth), `setup/components.test.tsx` (PlanStage from an API plan incl. briefs + Creator; DraftCard resume + delete),
`projects/model.test.ts` (shelves, search, count line, cast of a project, badges/tags, edited-ago, tile hash = prototype).

## Real check (free) — 2026-11-13
Fake-runner server (`AI_STUDIO_RUNNER=fake`, temp home/sandbox/control under the scratchpad, :4371) + an isolated Vite on :1432
proxying `/api` (Origin rewritten to the app origin) — nothing shared with the other builders' servers. Headless Chrome via a
small CDP script clicked: projects → + New → New project → name "Kite Notes" → Pixel → Ship-It proposal → "add a data
specialist" → "design a brand-new team for mobile" (plan shows the brief ghost) → Accept → Tinker minted *The Night Shift*
(Nova captains) → Set it up → 9 Setter steps → Open the office → `#office/kite-notes`; Projects shows it on set.
Adopt: pocket-recipes (git) → ← → picked Maestro (saved) → left to Projects (In setup card) → resumed → Accept (no briefs →
straight to Setup) → kept folder/git, appended .env to .gitignore, committed the additions → `#office/pocket-recipes`.
Live SSE proof: with the finish *response* held back 2.5 s in the page, the checklist reached 9/9 done (100 %) from the stream
alone while "Open the office" was still disabled. Error path: a name whose folder exists → 409 shown calmly with Back / Try again.
Delete draft → toast Undo → restored; delete from a card.
Shots: `shots/u2-*.png` (projects, new-0…4, new-3-chat, new-3-minted, new-4-live, new-office, projects-after, adopt-1…4,
projects-insetup, setup-error, delete-undo, projects-empty-search) — compared with `v6p-projects`, `v6-new-*`, `v6-new-chat`,
`v6-adopt-1`: same layout, type, colours and characters.

## Gaps / notes
- Step order vs the user's v5 rule (above) — needs the user's call / a small backend split.
- Project status isn't maintained by the server (only seed data has live/needs); new projects are set `live` on finish. Moving a
  project to the back lot (idle/archived) has no UI in the prototype either.
- No studio-wide event stream: the Reports dot refreshes when Projects mounts.
- Long sandbox paths (temp dirs) wrap in the folder list; the real default `~/dev/AI-Studio-Sandbox` is short.
