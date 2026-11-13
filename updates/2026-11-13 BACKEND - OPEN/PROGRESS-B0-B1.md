# PROGRESS — B0 Foundation + B1 Cast & projects domain

Resume notes for a fresh agent. Plan lives in `update v1.md`; durable lessons in `wiki.md`.
How to run / API list: `server/README.md`.

## Done (both phases ✅ — 79 tests: B0 20, B1 59)
- **B0** — `server/` scaffold (TS strict, ESM, Node 25, Fastify 5, zod 4, vitest 4, biome 2, tsx).
  `config.ts` (zod env → paths, `ensureDirs`), `errors.ts` (AppError + one error shape),
  `fs/sandbox.ts` (`resolveInSandbox`, `toSandboxRelative`), `db/connection.ts` + `migrations.ts`
  (PRAGMA user_version), `app.ts` (factory, injected deps), `GET /health`.
- **B1** — migration 2 (roles, agents, teams, team_members, projects, project_teams,
  project_agents, drafts, trash). Pure rules in `src/domain/` (cast kinds, team roster, role
  names, ids, look). Repos per aggregate in `src/db/`, wired by `store.ts`. Delete/restore via
  `db/trash.ts`. Routes per resource. First-run seed (`seed.ts`) = prototype cast + 9 projects.
- Real runs: server started on a scratch home and on the default `~/.ai-studio` (migrated the
  B0 v1 db → v2 and seeded); curl'd /health, /agents, /teams, delete/restore, sandbox rejection,
  restart → no reseed.

## Next
- B2 Project Setter (see "For B2/B3" below).

## For B2 / B3
- Write every project path through `resolveInSandbox(config.sandbox, rel)`; store
  `toSandboxRelative` in `projects.folder` / `drafts.folder` (already validated by the repos).
- A draft → project hand-off doesn't exist yet: B2 adds e.g. `POST /drafts/:id/finish` that
  scaffolds the folder, creates the project from the draft (`orchestratorId`, `plan` → teamIds/
  agentIds), then trashes or deletes the draft — in one `store.tx`.
- `drafts.plan` is opaque JSON (`z.json()`); B6 owns its schema.
- `config.controlHome` (`~/.ai-control`) is read-only and never created by us — modules live
  in `modules/`, global secrets in `.env`.
- Add new tables as a NEW entry in `MIGRATIONS` (never edit a shipped one).
- Add new routes as a plugin `(store) => FastifyPluginAsync` and register it in `app.ts`.

## Gotchas
- `typescript@7` is installed (tsc 7.0.2) — fine with `allowImportingTsExtensions` + `noEmit`;
  imports use `.ts` extensions; we run via tsx, never build.
- biome needs a `.gitignore` in `server/` (vcs.useIgnoreFile) or it errors.
- `node:sqlite` on Node 25: no flag, no warning. `db.isTransaction` lets `tx()` nest safely.
- macOS temp dirs are symlinks (`/var` → `/private/var`): tests `realpath` their temp dirs, and
  the sandbox guard compares real paths.
- Multi-statement repo calls must run inside `store.tx(...)` (routes do this).
