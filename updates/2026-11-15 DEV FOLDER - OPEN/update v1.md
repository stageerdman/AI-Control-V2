# DEV FOLDER — v1

**Goal:** every project lives in `~/dev/` — new ones are created there, and every `~/dev` folder not yet
under AI Studio shows on the Projects home under **Not adopted**, one click from adopting.

## Roadmap
- **P1 — Root = ~/dev.** `AI_STUDIO_SANDBOX` defaults to `~/dev` (was `~/dev/AI-Studio-Sandbox`).
  Adopting stays in place (never moves files). The installed app had no projects/drafts → no migration.
  Test: config default.
- **P2 — "Not adopted" shelf.** Projects home lists `GET /sandbox/folders`; click → adopt draft with the
  folder + name prefilled. Search filters it. Tests: model + shelf.
- **P3 — Verify & install.** Full test suites, build, install in /Applications, check the shelf live.

## Status
- [x] P1  - [x] P2  - [x] P3

## Decisions
- Folder deletion audit: the only `rmSync` on project paths removes a folder that a *new* project's first
  failed setup just created — safe with a root that holds real code.
- Row hint is one word ("GitHub" / "git"), not owner/repo: with ~60 folders the repo text truncated the
  name, and the name is what you scan for. Full name on hover.
- Verified live: backend reports sandbox `/Users/stage/dev`, `/sandbox/folders` lists 61; the shelf shows
  60 (one already picked by a draft), collapsed, then expanded at 1400px.
