# PROGRESS — G1 Server (accesses, GitHub, ports, director freshness)

The UI builder's contract: exact API + event shapes. Commits prefixed `ACCESS G1:`. Full API table: `server/README.md`.

## Status
1. ✅ Accesses (multi-field) — migration 21, `/accesses` API, grants per access, `.env` sync of every field, "new" dot, prompts.
2. ⏳ GitHub (by default at setup + publish / visibility / auto-push)
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
