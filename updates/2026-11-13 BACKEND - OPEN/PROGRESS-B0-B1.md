# PROGRESS — B0 Foundation + B1 Cast & projects domain

Resume notes for a fresh agent. Plan lives in `update v1.md`; durable lessons in `wiki.md`.

## Done
- **B0** — `server/` scaffold (TS strict, ESM, Node 25, Fastify 5, zod 4, vitest 4, biome 2, tsx).
  `src/config.ts` (zod env → paths, `ensureDirs`), `src/errors.ts` (AppError + shared error shape),
  `src/fs/sandbox.ts` (`resolveInSandbox`), `src/db/connection.ts` + `migrations.ts` (user_version),
  `src/app.ts` (factory, injected deps), `GET /health`. 20 tests. Real run: curl /health OK.

## Next
- B1: schema migration → domain rules → repositories → routes (roles, agents, teams, projects, drafts) → seed.

## Gotchas
- `typescript@7` is installed (tsc 7.0.2) — works fine with `allowImportingTsExtensions` + `noEmit`; we run TS via tsx, never build.
- biome needs a `.gitignore` in `server/` (vcs.useIgnoreFile) or it errors.
- `node:sqlite` on Node 25 needs no flag and prints no warning.
