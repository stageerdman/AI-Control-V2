# PROGRESS — B3 Secrets & access

Resume notes for a fresh agent. Plan lives in `update v1.md`; durable lessons in `wiki.md`.

## Plan (steps, each committed + pushed)
1. ⏳ `src/secrets/dotenv.ts` — pure parse/format of `.env` text (keeps comments/blank/unknown lines).
2. ⏳ `src/secrets/secretStore.ts` — `SecretStore` interface + file impl (atomic tmp+rename, 0600).
3. ⏳ migration 3 (`credentials`, `project_access`) + `src/db/credentials.ts` repo.
4. ⏳ `src/secrets/cabinet.ts` (create/replace/edit/delete/import) + `/credentials` routes.
5. ⏳ `src/secrets/projectAccess.ts` (grants, sync to project `.env`, `envFor` for B5) + `/projects/:id/access` routes.
6. ⏳ Leak tests (body, headers, logs, sqlite bytes) across every endpoint + error path.
7. ⏳ Real run on a temp controlHome copy; README, status, wiki.

## Decisions
- Credential delete is **not restorable** (a restore snapshot would have to hold the value).
