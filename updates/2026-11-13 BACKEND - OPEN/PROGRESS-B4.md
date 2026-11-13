# PROGRESS — B4 Live events

Resume notes. Plan: `update v1.md`; lessons: `wiki.md`; API: `server/README.md`.

## Done ✅ (27 new tests → 151 total)
- Migration 4: `events` (AUTOINCREMENT id = SSE id, `scope` project|draft, `scope_id`, `type`,
  `payload` JSON, `at`) + triggers that drop a log when its project/draft is deleted.
- `src/domain/events.ts` — zod catalogue: `setup.step`, `setup.failed`, `agent.status`,
  `ask.opened`, `ask.answered`, `checklist.item`, `feature.changed`, `progress`, `tokens`.
- `src/events/redact.ts` — every known secret value (from the SecretStore) and common key shapes
  → `••••`, anywhere in any string. `src/events/bus.ts` — `EventBus` interface, in-process fan-out.
  `src/events/log.ts` — `append` (validate → redact → insert → publish), `after`, `copy`.
- `src/http/sse.ts` — subscribe-then-replay (no gap, no dup), `Last-Event-ID` > `?after=`,
  `retry: 2000`, heartbeat comments (15 s), cleanup on close, streams ended on app close.
- `src/http/cors.ts` — exactly `http://localhost:1420`, `tauri://localhost`, same-origin; any other
  Origin → 403 (also blocks drive-by POSTs from web pages); no Origin → allowed (curl).
- Routes: `GET /projects/:id/events`, `GET /drafts/:id/events`, dev-only `POST /projects/:id/events`
  (not registered when `NODE_ENV=production`).
- Finish is now async: validate + dry-run insert → scaffold (async git, yields per step, each step
  appended to the draft stream) → one tx (create project, copy setup events to it, delete draft).
  Failure → `setup.failed` on the draft stream, no project, new folder removed.
- Sandbox guard now follows dangling symlinks (found while testing the failure path).
- Real run (defaults): curl SSE on hello-studio, two dev publishes arrived live; Last-Event-ID
  resume; CORS allow ×2 / 403 evil / 204 preflight.

## For B5
- Publish with `events.append('project', id, { type, payload })` on the instance passed to
  `buildApp({ events })` (main.ts builds it today via the default — create it in main and share it
  with the runner). Don't append inside a tx that might roll back.
- Add event types in `EVENT_SCHEMAS` when a screen needs them.

## Gotchas
- zsh doesn't word-split `$VAR` — pass file lists to biome/git literally.
- Fastify `inject()` can't test streams (it waits for the end): tests listen on port 0 and use
  `test/sse-client.ts`.
- Hijacked SSE replies skip Fastify's header pipeline: `openStream` copies hook-set headers (CORS).
