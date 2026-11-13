# AI Studio server

Local backend for AI Studio: the Cast (roles, agents, teams, system agents), projects and
setup drafts. TypeScript on Node 25, Fastify, zod, built-in `node:sqlite`. Run from source via tsx — there's no build step.

## Run

```sh
npm install
npm run dev        # watch mode on http://127.0.0.1:4319
npm start          # same, no watch
npm test           # vitest (in-memory sqlite + temp sandbox, Fastify inject)
npm run typecheck  # tsc --noEmit
npm run lint       # biome check   (npm run format to auto-fix)
```

The first start creates the data dir and sandbox, migrates the db and seeds the prototype
cast (14 agents, 10 roles, 4 teams, 9 projects). The seed runs once per database and never
brings back things you deleted.

## Environment

| Var | Default | What |
|---|---|---|
| `AI_STUDIO_HOME` | `~/.ai-studio` | data dir (`studio.db`), created 0700 |
| `AI_STUDIO_SANDBOX` | `~/dev/AI-Studio-Sandbox` | every project folder must resolve inside it |
| `AI_CONTROL_HOME` | `~/.ai-control` | global modules (read only) + secrets: `.env` is the one file we write here (0600, atomic, other lines kept) |
| `PORT` | `4319` | |
| `HOST` | `127.0.0.1` | local only by default |

## Layout

```
src/
  main.ts            entry: config → dirs → db → seed → listen
  app.ts             Fastify factory (deps injected) + shared error handler
  config.ts          zod env → paths
  errors.ts          AppError + parse(): { error: { code, message, details? } }
  fs/sandbox.ts      resolveInSandbox / toSandboxRelative (no '..', no escape via symlink)
  domain/            pure rules, no I/O: cast.ts, teams.ts, roles.ts, look.ts, ids.ts
  db/                connection, migrations (PRAGMA user_version), one repo per aggregate,
                     trash.ts (delete + restore tokens), store.ts (wires them)
  routes/            one file per resource
  blueprint/         modules → CLAUDE.md compile, scaffold file templates (read-only on AI Control home)
  secrets/           dotenv.ts (parse/format), secretStore.ts (atomic 0600 .env), cabinet.ts, projectAccess.ts
  setter/            scaffold/adopt/inspect, local git, finishDraft (draft → project)
  seed.ts            the prototype's cast and projects
test/                mirrors src
```

## API

Errors: `400 bad_request` (malformed JSON) · `404 not_found` · `409 conflict` (a studio rule
blocks it: second setter, last orchestrator, team full, captain not a member…) · `422 invalid`
(body fails validation or references an unknown id; `details` lists the issues). Bodies are
strict — unknown keys are 422.

| | |
|---|---|
| `GET /health` | version, paths, db ok (503 when the db is down) |
| `GET POST /roles` · `GET PATCH DELETE /roles/:id` | user-defined role names; rename shows on every agent |
| `GET POST /agents` · `GET PATCH DELETE /agents/:id` | `kind` set at creation only; each agent carries `teamIds`, `projectIds`, `canDelete {ok, why}` |
| `GET POST /teams` · `GET PATCH DELETE /teams/:id` | `PATCH {captainId}` to change captain |
| `POST /teams/:id/members` · `PATCH DELETE /teams/:id/members/:agentId` | add / edit job / remove (captain passes on) |
| `GET POST /projects` · `GET PATCH /projects/:id` | `orchestratorId`, `teamIds` (teams first), `agentIds` (specialists), `folder` (sandbox-relative) |
| `DELETE /projects/:id` | 204; forgets the record, never touches the folder |
| `GET POST /drafts` · `GET PATCH DELETE /drafts/:id` | setup drafts: mode, step, orchestrator, `plan` (opaque JSON), `chat` |
| `POST /trash/:token/restore` | undo a delete |
| `GET /blueprint` | global modules (name, description) + the scaffold tree the Setter creates |
| `POST /drafts/:id/finish` | Project Setter: draft → project + scaffold (new or adopt) + local commit; returns `{project, steps, commit}` |
| `GET /projects/:id/scaffold` | what's on disk vs the expected scaffold, plus git head/commit count |
| `GET /sandbox/folders` | top-level sandbox folders not yet under AI Studio (Adopt picker) |
| `GET POST /credentials` · `GET PATCH DELETE /credentials/:id` | Key Cabinet: `name`, `envVar` (fixed; derived from name if omitted), `serves`, `docsUrl`, `instructions`; `value` on POST only; responses carry `hasValue`, `last4`, `projectIds` |
| `PUT /credentials/:id/value` | replace key `{value}` (write-only) |
| `POST /credentials/import` | register keys already in the global `.env` (also runs on startup), refresh last-4 after hand edits |
| `GET PUT /projects/:id/access` | every cabinet entry with `granted`; `PUT {grants: {credentialId: bool}}` toggles (partial) |
| `POST /projects/:id/access/sync` | write the granted secrets into `<folder>/.env` (managed block, 0600), ensure `.gitignore` has `.env`; returns `{file, written, removed, missing, gitignore}` — names only |

**Delete & restore.** `DELETE` on an agent, role, team or draft hard-deletes it and returns
`{ deleted: {kind, id}, restoreToken }`. The token restores it once, within 7 days, as far
as the rules still allow (a seat on a team that filled up since is skipped). Deleting an
agent removes it from every team (captaincy passes to the next member) and project; deleting
an orchestrator hands its projects and drafts to the first other orchestrator, and restoring
hands them back.

**Secrets.** Values live only in `$AI_CONTROL_HOME/.env` (and, once synced, in a granted
project's `.env`). The db holds metadata + last-4 (none for values under 12 chars). No
response, header or log line ever contains a value — `test/secrets/leak.test.ts` checks every
endpoint and error path, and the sqlite bytes. Credential `DELETE` removes the value too and
is **not restorable** (`restorable: false`; an undo snapshot would have to keep the value);
it lists `projectIds` whose `.env` still holds the key until their next sync. Projects reach
nothing until granted.
