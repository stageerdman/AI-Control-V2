# PROGRESS — B3 Secrets & access

Resume notes for a fresh agent. Plan lives in `update v1.md`; durable lessons in `wiki.md`.
API list: `server/README.md`.

## Done ✅ (24 tests: dotenv/store 6, cabinet + access API 16, leak 2 — 124 total)
1. `src/secrets/dotenv.ts` — pure parse/format; unknown lines kept byte-for-byte.
2. `src/secrets/secretStore.ts` — `SecretStore {get,set,delete,keys}`; `fileSecretStore(path)`
   re-reads per call; `writeFileAtomic` (tmp + fsync + rename, fchmod 0600, follows a symlinked target).
3. Migration 3: `credentials` (metadata, `has_value`, `last4`), `project_access` (FK cascades
   from projects and credentials). Repo `src/db/credentials.ts` (in `store.credentials`).
4. `src/secrets/cabinet.ts` + `routes/credentials.ts` — file write happens inside the db tx,
   so a failed write rolls the metadata back. `main.ts` imports the global `.env` on startup.
5. `src/secrets/projectAccess.ts` + `routes/access.ts` — view / partial grants / sync / `envFor`.
6. `test/secrets/leak.test.ts` — canaries through every endpoint + error path (409/422/400/404/
   500); checks bodies, headers, trace logs, sqlite (+WAL, then checkpointed). Mutation-checked:
   logging `req.body` or echoing the value in a response both fail it.
7. Real runs (scratchpad copy of `~/.ai-control`, port 4391): startup import of 2 fake keys,
   create/rotate/409/grant/sync/ungrant/409-no-folder/delete; project `.env` + global copy 0600;
   values in 0 log lines and 0 db bytes. Read-only live check on the real `~/.ai-control/.env`:
   it holds only comments → 0 imported; sha + mode unchanged.

## For B5 (agent runtime)
- `projectAccess(store, secrets, sandbox).envFor(projectId)` → `{ENV_VAR: value}` of granted
  credentials that have a value. Pass it as the run's env (merge over a *minimal* base env, not
  `process.env`, so nothing ungranted leaks in). Never put it in events, prompts or logs.
- Agents run with cwd = project dir, and `sync` puts the same keys in `<folder>/.env`; decide
  whether runs depend on the file (sync before run) or only on `envFor` (fresher, no disk).
- Redact before logging/streaming: any agent output containing a granted value should be
  masked (B4's events table notes "secrets redacted") — the values to scrub are `envFor`'s.

## Gotchas
- The real `~/.ai-control/.env` is 0644 today; the first API write makes it 0600.
- `.env` parsing is single-line only (multi-line quoted values are not supported, and the API
  rejects keys with line breaks; pasted trailing newlines are trimmed).
- Fastify 5 already replaces JSON parse errors with a fixed message (V8's own message quotes the
  body) — the leak test locks that in.
