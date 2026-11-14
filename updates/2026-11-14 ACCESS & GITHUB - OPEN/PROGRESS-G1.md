# PROGRESS — G1 Server (accesses, GitHub, ports, director freshness) — ✅ done (372 tests, live check run)

The UI builder's contract: exact API + event shapes. Commits prefixed `ACCESS G1:`. Full API table: `server/README.md`.

## Status
1. ✅ Accesses (multi-field) — migration 21, `/accesses` API, grants per access, `.env` sync of every field, "new" dot, prompts.
2. ✅ GitHub — a repo by default at setup (user's change), opt-outs, publish / visibility, auto-push, agents never push.
3. ✅ Ports + setting-prefixed commands — a stable 5-port block per project, PORT per run, `NAME=value <cmd>` hook, `GET /ports`.
4. ✅ Director chat freshness — truth-labelled snapshot every turn, session rotation (12 turns / new goal after a finished one) with a recap.
5. ✅ CLAUDE.md rebuild endpoint — `POST /projects/:id/claude-md/rebuild`.

## 1. Accesses

**Data.** An access is a named bundle of fields. Migration 21 turns every B3 credential into a one-field access with the
**same id** (`c-…`), field `f-<credentialId>` labelled `Key` (secret), and carries every grant over (`access_grants`).
The `.env` is untouched: env var names are the same. New accesses get ids `a-<slug>`; fields `f-<access-slug>-<label-slug>`.

```ts
type AccessField = {
  id: string; label: string;
  envVar: string;          // unique across the whole cabinet (one global .env)
  secret: boolean;         // false = a username / URL: `value` is included
  hasValue: boolean;
  last4: string | null;    // null when no value or value < 12 chars
  value?: string;          // ONLY when secret === false and hasValue
};
type Access = {
  id: string; name: string; serves: string; docsUrl: string | null; instructions: string;
  fields: AccessField[];   // ≥ 1, in order
  projectIds: string[];    // granted to
  createdAt: string; updatedAt: string;
};
```

**Routes** (all bodies strict; 422 invalid, 409 env var clash `{existingId, fieldId}`, 404 unknown):
| route | body | → |
|---|---|---|
| `GET /accesses` | | `Access[]` |
| `GET /accesses/:id` | | `Access` |
| `POST /accesses` | `{name, serves?, docsUrl?, instructions?, fields: [{label, envVar?, secret? = true, value?}] (1–20)}` | 201 `Access` (envVar default: `NAME_LABEL`, e.g. Stripe + Secret key → `STRIPE_SECRET_KEY`) |
| `PATCH /accesses/:id` | `{name?, serves?, docsUrl?, instructions?}` | `Access` |
| `DELETE /accesses/:id` | | `{deleted: {kind: 'access', id}, restorable: false, projectIds}` — values removed from the global .env |
| `POST /accesses/:id/fields` | `{label, envVar?, secret?, value?}` | 201 `Access` |
| `PATCH /accesses/:id/fields/:fieldId` | `{label?, envVar?, secret?}` | `Access` (moving envVar moves the value) |
| `DELETE /accesses/:id/fields/:fieldId` | | `Access`; 409 when it's the last field ("delete the access instead") |
| `PUT /accesses/:id/fields/:fieldId/value` | `{value}` (single line, ≤ 8192, trimmed) | `Access` |
| `POST /accesses/import` | | `{imported: Access[], refreshed: string[] (access ids)}` |
| `GET /projects/:id/access` | | `ProjectAccessView` (below) |
| `PUT /projects/:id/access` | `{grants: {accessId: boolean}}` (partial) | `ProjectAccessView` |
| `PUT /projects/:id/access/:accessId` | — | grant → `ProjectAccessView` |
| `DELETE /projects/:id/access/:accessId` | — | revoke → `ProjectAccessView` |
| `POST /projects/:id/access/seen` | — | `{projectId, seenAt}` — call when the user opens the project's Access sheet |
| `POST /projects/:id/access/sync` | — | `{file, written: envVar[], removed, missing, gitignore: 'present'\|'added'}` (every field of every granted access) |

```ts
type ProjectAccessView = {
  projectId: string; granted: number; total: number;
  seenAt: string;          // last POST …/seen (the project's createdAt before the first one)
  newCount: number;        // accesses created after seenAt → the "new" dot
  accesses: (Access & { granted: boolean; isNew: boolean })[];
  entries: { credentialId, name, envVar, serves, hasValue, last4, granted }[]; // @deprecated B3 rows (first field)
};
```

**Event** (project stream, ids only): `access.changed {accessId, change: 'granted' | 'revoked' | 'updated' | 'deleted'}` —
granted/revoked on that project; updated/deleted on every project the access is granted to. Refetch `GET …/access` on it.

**Route changes.** New: everything under `/accesses`, `PUT/DELETE /projects/:id/access/:accessId`, `POST /projects/:id/access/seen`.
Changed: `GET/PUT /projects/:id/access` gained `seenAt`, `newCount`, `accesses` (`entries` kept). **Kept for the current app
(B3 compat, remove after G3):** `GET POST /credentials`, `GET PATCH DELETE /credentials/:id`, `PUT /credentials/:id/value`,
`POST /credentials/import` — a credential = an access read through its first field (same ids, same shapes as before).
Removed: nothing.

**Agents.** Every agent run (not the orchestrator's chat) gets every field of every granted access in its env, and a prompt
section "Access you have": `- Stripe (payments): Secret key → \`STRIPE_SECRET_KEY\`, Account → \`STRIPE_ACCOUNT\`. How: …`
(`(not set yet)` for a field without a value). Never a value.

**Leak tests.** `test/secrets/accesses.test.ts` (canaries through every access route incl. error paths, logs at trace, the
event log; non-secret values are the one thing shown) + the B3 `leak.test.ts` (still green through the compat routes).

## 2. GitHub

**User's change (mid-G1):** new and adopted projects get a GitHub repo **by default** at setup. Default private, named after
the folder (the project slug); an adopted folder with an origin keeps it. Opt out per draft or studio-wide. gh missing / logged
out never fails setup.

**Setup payload change.**
- `POST /drafts` and `PATCH /drafts/:id` accept `github: boolean | null` (null / absent = the studio default). Drafts carry `github`.
- `POST /drafts/:id/setup` accepts an optional body `{github?: boolean}` (saved on the draft first). No body = as before.
- The Setter's steps end with one more `setup.step` (draft stream, and in the `/setup` / `/finish` response `steps`):
  `{step: 'github', status: 'running', detail: 'Connecting GitHub'}` then one of
  - `done` — `Created https://github.com/<owner>/<slug> (private) and pushed` (or `… — the push failed: <why>`)
  - `kept` — `Kept its GitHub repo <owner>/<repo>` · `Kept its remote (<url>) — not on GitHub`
  - `skipped` — `GitHub is off for this project — publish any time from health` · `GitHub not connected — Publish — <reason>`
    (reasons: gh isn't installed / gh isn't logged in — run `gh auth login` … / GitHub didn't create the repo: <gh's words>)
- Studio setting: `GET /settings` → `{githubByDefault: boolean}`; `PATCH /settings {githubByDefault}` → same.

**Project payload** (`GET /projects`, `/projects/:id`): `github: {connected, private, published, url, visibility}`.
`connected` = `published`, `private` = visibility ≠ public (the old two keys, now honest — the seed's fake "connected" flags are
gone). `PATCH /projects/:id` no longer accepts `github` (422): GitHub state only moves through setup / publish / the switch.

**Routes.**
| route | body | → |
|---|---|---|
| `GET /projects/:id/github` | | `GithubView` |
| `POST /projects/:id/github/publish` | `{name?: /[A-Za-z0-9._-]{1,100}/, visibility?: 'private' \| 'public'}` (default private) | 201 `GithubView & {pushed: boolean}` |
| `PATCH /projects/:id/github` | `{visibility: 'private' \| 'public'}` | `GithubView` — ask the user to confirm before going public (the server doesn't) |

```ts
type GithubView = {
  published: boolean;
  url: string | null;                          // https://github.com/owner/repo
  visibility: 'public' | 'private' | 'internal' | null;
  lastPush: { ok: boolean; at: string; note?: string; commit?: string } | null;
  note?: string;  // "GitHub not connected — Publish" | "Couldn’t push to GitHub: <git's words>" — show calmly; absent = fine
};
```
409 messages are written for the user (show as-is): "GitHub CLI (gh) isn’t installed — install it (brew install gh), then publish
again" · "gh isn’t logged in — run `gh auth login` in Terminal, then publish again" · "This project already has a remote (origin →
<url>)" · "Nothing to publish yet — the project has no commit" · "This project isn’t on GitHub yet — publish it first" (visibility) ·
"GitHub didn’t create the repo: <gh>".

`GET /projects/:id/health` gains `github: GithubView`.

**Events** (project stream): `github.changed {published, url, visibility}` (publish, visibility switch) ·
`github.push {ok, commit?, note?}` (after each merge to main on a published project; one at a time).

**Agents never push:** every run with a shell gets `--disallowed-tools Bash(git push),Bash(git push *)` (deny beats allow).
The studio's pushes use `gh auth git-credential` as the git credential helper for github.com, so a logged-in gh is enough.

**Config:** `AI_STUDIO_GH_BIN` (absolute; default the first of /opt/homebrew/bin/gh, /usr/local/bin/gh, /usr/bin/gh). Tests use
`server/test/github/stub-gh.ts` (a real script: bare repos in a temp dir, `GIT_CONFIG_*` insteadOf for pushes) — no network, no
real repo, ever.

## 3. Ports and setting-prefixed commands

**Blocks.** Each project owns 5 consecutive ports in 3100–3999 (migration 23 `port_blocks`, allocated on first use, never
overlapping): `app` = block[0] = the port "Run the app" uses (same as F3's for existing projects), `spares` = the next 4.

**Agent runs** (not the orchestrator's chat) get `PORT` = a spare no other live run of that project holds (so parallel agents
never collide; all held → the first), `AI_STUDIO_PORTS` = the 4 spares comma-separated, `AI_STUDIO_APP_PORT` = the app's.
The brief says: `- Ports: your PORT is 3932 (already in your environment; this project's spares are 3932, 3933, 3934, 3935 in
AI_STUDIO_PORTS). 3931 is the project's app port — the studio's "Run the app" uses it; don't bind it. Servers read their port
from PORT. Stop any server you start before you finish.`

**Setting-prefixed commands.** `NAME=value [NAME2=value2] <allowed command …>` is approved by a PreToolUse hook passed with
`--settings` (`src/runtime/shell-hook.ts` → `shell-prefix.ts`). Literal values only (bare, `'…'` or `"…"`); refused anywhere in
the command: `$`, backticks, `;`, `&`, `|`, `<`, `>`, `(`, `)`, `\`, newlines; refused names: PATH, IFS, ENV, BASH_ENV, SHELL, HOME,
PS4, PROMPT_COMMAND, NODE_OPTIONS, auth overrides, `LD_…`, `DYLD_…`, `GIT_…`, `npm_config_…`; the program must be on the shell
allow-list; `git push` is refused. A refusal reaches the agent as the hook's reason (plain words). Plain commands keep the old rules.

**Route:** `GET /ports`
```ts
{
  range: { from: 3100, to: 3999 },
  projects: {
    projectId: string; name: string;
    block: { app: number; spares: number[] };              // 4 spares
    app: { status: 'stopped' | 'running' | 'exited'; port: number | null; url: string | null };
    ports: { port: number; role: 'app' | 'spare'; listening: boolean; heldBy: { runId: string; agentId: string | null } | null }[];
  }[];
}
```
`listening` is a live 200 ms connect check on 127.0.0.1 and ::1 (something answers — the studio's app, an agent's server or
anything else on the Mac). No events; poll it while the Ports room is open (every few seconds is cheap).

## 4. Director chat freshness

Server-only; nothing changes in the API. Every orchestrator chat turn's task starts with
`Studio summary right now: {…}` (one JSON line) and then: `This summary is the truth right now: exactly N goals are active on
the whiteboard. Where it disagrees with anything said earlier in this chat, trust it.` The summary's `whiteboard` now holds
**active goals only** (with items), plus `activeGoals: N` and `finishedGoals: [{goal, status}]` (last 3); features, people, health,
unread reports and open questions as before. Its system prompt says to trust the summary and drop older ideas.

**Rotation** (migration 24, `thread_sessions`): the orchestrator thread's resumed CLI session starts fresh (a) after 12 turns,
or (b) on the first chat turn after the user posts a goal while an earlier goal has finished. The fresh session's task carries
"This is a fresh session. A short recap of this chat so far …" with the last 6 lines (each ≤ 300 chars). The thread the user
sees is unchanged — one continuous conversation.

Regression test: `server/test/office/director-freshness.test.ts` (the stale session says "four goals"; after one goal finished
and ONE new one is posted, the next turn is a fresh session told "exactly 1 goal is active", and the turn after resumes the new
session) + the 12-turn rotation.

## 5. CLAUDE.md rebuild

`POST /projects/:id/claude-md/rebuild` (no body) → `{file: 'CLAUDE.md', changed: boolean, modules: string[], commit: string | null}`.
Recompiles from the global modules; everything from the last `## Project-specific rules` heading (outside code fences) to the end
is kept byte for byte. No such heading → 409 "CLAUDE.md has no "## Project-specific rules" section — add that heading above the
project's own rules, then rebuild" (file untouched); no folder / no CLAUDE.md → 409. Stamps `.project` `claude_md_generated:
<today>`, commits both (`AI Studio: rebuild CLAUDE.md from the modules`), pushes when published. Again with nothing new →
`changed: false, commit: null`. Pairs with the Blueprint's "modules changed since" (`GET /projects/:id/scaffold` →
`claudeMdGenerated` vs `GET /blueprint` module `updatedAt`).

## Live check — 2026-11-14 (real Claude Code 2.1.322, claude-opus-5-5)
Isolated backend on **:4701**: data dir + AI Control home in the scratchpad (`g1/home`, `g1/control` = a copy of the modules —
the real `~/.ai-control/.env` is untouched, md5 checked before/after), `AI_STUDIO_GH_BIN` = a **stub gh** (bare repos in the
scratchpad, `GIT_CONFIG_*` insteadOf for the push — no real GitHub repo), real runner.
| step | result |
|---|---|
| access | `POST /accesses` "Demo API": Key (secret) → `DEMO_API_KEY` (last4 shown), User (non-secret) → `DEMO_API_USER` (value shown) |
| project | draft "G1 Port Check" → setup → `github: done` "Created https://github.com/stub-owner/g1-port-check (private) and pushed" (stub) → finish → `~/dev/AI-Studio-Sandbox/g1-port-check`, payload `github.published: true` |
| grant | `PUT /projects/g1-port-check/access/a-demo-api` → granted 1. (First try sent `content-type: application/json` with no body → Fastify 400 — see For the UI.) |
| ports | block app 3339, spares 3340–3343 |
| run | Captain Semicolon, task: write server.js on `process.env.PORT` answering which access env vars are set (booleans only), start it with `PORT=<your PORT> node server.js`, fetch, stop |
| outcome | the agent ran **`PORT=3340 node server.js`** (background) — **approved by the hook on the first try** — fetched `{"port":3340,"DEMO_API_KEY":true,"DEMO_API_USER":true}`, stopped it (it noted `kill` isn't allowed and used a node one-liner), no commit. 7 turns, succeeded |
| leaks | the key's value: 0 hits in the run's stream log, the server log, the events table and the sqlite bytes (db + WAL) |
**Plan usage:** 2 Claude Code runs, 8 turns (1 run cancelled at 1 turn after the bad grant call, 1 run of 7 turns). No crew calls.

## For the UI (G3)
1. **Access sheet → "Add new access":** `POST /accesses` with `fields[]`; edit fields in place (`PATCH …/fields/:fieldId`), add
   (`POST …/fields`), remove (`DELETE …/fields/:fieldId`; the last one is 409 — offer "delete the access"), set a value
   (`PUT …/fields/:fieldId/value`, write-only — never prefill). Show `last4` for secret fields, `value` for non-secret ones
   (`secret: false`: usernames, URLs). Suggested env var = `NAME_LABEL` (the server derives it when `envVar` is omitted).
2. **"New" dot:** `GET /projects/:id/access` → `newCount` / per-access `isNew`; call `POST /projects/:id/access/seen` when the
   user opens that project's Access sheet (the dot goes away). Refetch on `access.changed`.
3. **Grant/revoke:** `PUT` / `DELETE /projects/:id/access/:accessId` (or the old `PUT {grants}`), then `POST …/access/sync` to write
   the project's `.env` (agents get the env directly either way).
4. **Old routes:** `/credentials*` still work (first-field view) — switch to `/accesses` and they can go.
5. **Empty-body requests:** don't send `content-type: application/json` without a body (Fastify answers 400). Send `{}` or no
   content-type for `PUT …/access/:accessId`, `POST …/seen`, `POST …/sync`, `POST …/claude-md/rebuild`, `POST …/github/publish`.
6. **GitHub in health:** `github.note` is the calm line ("GitHub not connected — Publish" → a Publish button; "Couldn’t push to
   GitHub: …"). Publish = `POST …/github/publish {visibility}` (private default, ask before public); the switch = `PATCH …/github
   {visibility}` — **confirm before going public** (the server doesn't ask). 409 messages are user-ready.
7. **Setup screen:** a GitHub toggle (default on, from `GET /settings`) → `POST /drafts/:id/setup {github}` or the draft's `github`;
   the Setter's step list gains a last `github` step (done / kept / skipped with a plain reason). The setup flow's commit-step copy
   "commit what was added (local only)" (`app/src/features/setup/flow.ts`) should drop "(local only)" — the server's did.
8. **Ports room:** poll `GET /ports`; show each project's block, the app port, which spare a running agent holds (`heldBy.agentId`),
   and `listening`. No events.
9. **Project payload:** `github.published/url/visibility` are real now; the seed projects read "not on GitHub" (their old
   "connected" flags were placeholders). `PATCH /projects` no longer takes `github`.

## Known gaps
- `kill` isn't on the agent shell allow-list — agents stop their own servers with a node one-liner (worked live). Fine for now.
- The auto-push uses `gh auth git-credential` for https; an origin with ssh uses the user's ssh setup as-is.
- Visibility for an adopted repo is asked once at setup; if it changes on github.com, the studio's record is stale until the
  next switch (health checks still probe it live in `git.github`).
- Auto-push runs only on `item.merged` (top-level items into main); the user's own commits are pushed with the next merge.
