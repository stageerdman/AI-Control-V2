# PROGRESS — G1 Server (accesses, GitHub, ports, director freshness)

The UI builder's contract: exact API + event shapes. Commits prefixed `ACCESS G1:`. Full API table: `server/README.md`.

## Status
1. ✅ Accesses (multi-field) — migration 21, `/accesses` API, grants per access, `.env` sync of every field, "new" dot, prompts.
2. ✅ GitHub — a repo by default at setup (user's change), opt-outs, publish / visibility, auto-push, agents never push.
3. ⏳ Ports + setting-prefixed commands
4. ⏳ Director chat freshness
5. ⏳ CLAUDE.md rebuild endpoint

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
