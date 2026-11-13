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
- **Setup space** (`#new` → `#new/<draftId>`) in the **user's order** (v5: the Setter sets it up first, then the
  orchestrator enters and picks the team), every step on the drafts API, saved as you go (debounced PATCH, flushed on step
  change and on leaving); drafts show as "In setup" cards (tile, "Adopting · Setup · Pixel", five step dots, ✕ delete with Undo
  via the trash token) and resume exactly at their step.
  0 Start (crew on stage; picking new/adopt creates the draft — `#new` alone leaves nothing behind) ·
  1 Name + "What is it?" (live tile + the real sandbox path; adopt = roving radio list from `GET /sandbox/folders`, git / .project
  meta, name suggested from the folder) · 2 Orchestrator (the stage is the radio group, ← →, quote from its prompt, saved as you
  pick) · 3 **Setup** (the Project Setter on the draft, `POST /drafts/:id/setup`: checklist + progress driven live by `setup.step`
  from `GET /drafts/:id/events`, the response is the truth; no Back once done, as in the prototype; "Call in Pixel →"; a set-up
  draft resumes here all done without running again; failure = frustrated Setter, the server's message, Back / Try again) ·
  4 **Team** (plan on stage: squads under emblems with their own captains, specialists, the Creator's briefs as ghost robots + one
  "Tinker designs … when you accept" line; side chat — the orchestrator opens with a proposal once per draft, each message is one
  real turn, typing bubble, the message is kept on failure; **Accept** → Tinker on stage while `POST /accept` mints, minted
  teams/agents tagged "new" + celebrating + Tinker's chat lines, then "Open the office →"; nothing to mint → straight on;
  `POST /finish` creates the project → confetti → `#office/<id>`).
- **Server (U2 change, coordinator's call):** `POST /drafts/:id/setup` runs the Setter on the draft (live steps, idempotent:
  again = only what's missing, the first commit remembered; the draft owns the folder — hidden from `/sandbox/folders`, no second
  draft may claim it, PATCH folder → 409); migration 14 (`drafts.setup_at`, `setup_commit`). `finish` no longer scaffolds: it
  creates the project from the set-up folder + accepted plan in one transaction, **on set (`status: live`) with the name's tile**
  (server `domain/tile.ts` = the app's hash), 409 when the folder vanished; a never-set-up draft is set up first (back-compat).
  `DELETE /drafts/:id` never touches the disk and returns `keptFolder` → the UI's undo toast says "its folder … stays in the
  sandbox (adopt it any time)". A failed *first* setup of a new project removes only the folder that run created.
- Focus follows the prototype: each step focuses its target (`[data-autofocus]`) or its heading; Enter continues on Name;
  `aria-current="step"`, `role=log` chat, progressbar values; reduced motion stops confetti / typing dots.

## Decisions / deviations (real data)
- The user's step order is kept (see the server change above); first build had Team before Setup — replaced.
- New agents/teams are briefs until accept (the prototype minted mid-chat) → ghosts on stage, minted on Accept.
- The Creator stays on stage ≥ 1.2 s (prototype 1.4 s) so a fast mint is still seen.
- Mode is fixed per draft on the server → "Back" to Start and picking the other mode makes a new draft (name/about carried) and
  removes the old one (only before setup — no way back after it).

## Tests
App: 23 in my folders (app total 153): `setup/flow.test.ts` (step machine in the user's order — Setup needs `setupAt`, Team needs
a staffed plan; orchestrator change resets the talk; slugify = server; draft card mapping; plan view from API shapes; Setter
checklist fold incl. "already set up"), `setup/components.test.tsx` (PlanStage from an API plan; DraftCard resume + delete),
`projects/model.test.ts`. Server: 4 new in `test/routes/setter.test.ts` (setup → idempotent re-run → folder locked → finish
creates live project with the tile and no new commit, events re-filed; adopt keeps files + one owner per folder; delete keeps the
folder + `keptFolder` + undo restores the set-up draft; vanished folder / pending briefs / no name) — server total 249.

## Real check (free) — 2026-11-13, after the order change
Fresh fake-runner server (`AI_STUDIO_RUNNER=fake`, temp home/sandbox/control in the scratchpad, :4371) + an isolated Vite on :1432
proxying `/api`. Headless Chrome (CDP script):
New: projects → + New → "Kite Notes" → Pixel → **Setup** (with the setup *response* held back 2.5 s in the page, the checklist
reached 9/9 done, 100 %, from the stream alone while "Call in Pixel" was still disabled) → Call in Pixel → Ship-It proposal →
"add a data specialist" → "design a brand-new team for mobile" (ghost brief) → Accept → Tinker on stage → *The Night Shift*
minted (Nova captains) → Open the office → `#office/kite-notes`; the project is `live` with the coral/sun quill tile (server-set).
Adopt: pocket-recipes (git) → → Maestro → left → resumed from the card → Setup (kept folder + git, appended .env, committed the
additions) → left again → resumed: "All set up", no second run → Call in → Accept (no briefs) → `#office/pocket-recipes`.
Errors/undo: a new draft named like an existing project → 409 shown calmly with Back / Try again; a set-up draft deleted → toast
"its folder throwaway stays in the sandbox (adopt it any time)" + Undo → restored; the folder is still on disk.
Shots `shots/u2-*.png`: projects, new-0…2, new-3-live, new-3, new-4, new-4-chat, new-4-minting, new-4-minted, new-office,
projects-after, adopt-1…4, projects-insetup, setup-error, delete-undo — compared with `v6p-projects`, `v6-new-*`,
`v6-new-chat`, `v6-adopt-1`: same layout, order, type, colours and characters.

## Gaps / notes
- Project status after creation isn't maintained by the server (new projects start `live`; nothing moves them to needs/idle yet).
  Moving a project to the back lot has no UI in the prototype either.
- A deleted set-up draft leaves its folder in the sandbox (by design); it shows up again in the Adopt list.
- No studio-wide event stream: the Reports dot refreshes when Projects mounts.
- Long sandbox paths (temp dirs) wrap in the folder list; the real default `~/dev/AI-Studio-Sandbox` is short.
