# PROGRESS — G3 App UI (access, GitHub, ports, rebuild) + G4 ship to /Applications

Commits prefixed `ACCESS G3:` / `ACCESS G4:`. Spec: `spec-ux-G2.md`. Contract: `PROGRESS-G1.md`.

## Status
0. ✅ Two small server additions the spec needs (G1 didn't expose them): `GET /github/status`
   `{gh: 'ready'|'missing'|'signed-out', login}` (publish form's owner prefix, the "sign in" hints) and
   `remote: {url, github}` on `GET /sandbox/folders` (the Name step's "keeps origin"). Tests in `github.test.ts`, `setter.test.ts`.
1. ✅ Access — the app is on `/accesses` (no `/credentials` calls left; the server's legacy routes stay).
   `AccessEditor` (one wide sheet: create + edit; 3 templates as a radiogroup that steps aside once a value is
   typed; field rows label / env var (placeholder = NAME_LABEL, read-only once saved) / 🔒 toggle (label decides
   until touched) / value (secret = uncontrolled password input) / ✕). `editor.ts` = the pure model + `planSave`
   (create = one POST; edit = meta PATCH, field PATCHes, PUT values, removes first but never the last field
   before adds; Secret→not secret = move aside, re-add plain under its env var, drop the old one — the old
   secret is never read back). The safe: whole-access grant switches (`PUT/DELETE …/access/:accessId`),
   env var line with `••••last4` / `(no value yet)` and `…N more`, coral "new" dot + sr-only prefix, new first;
   `POST …/access/seen` on open, dots kept until close; the office safe gets the dot and
   "Safe — <project> access, N new"; `access.changed` refetches. Shots `g3-access`, `g3-access-edit`,
   `g3-access-template`, `g3-safe-new`.
2. ⏳ GitHub (Name step switch, Rivet's row, health row, studio default).
3. ⏳ Ports (the Switchboard).
4. ⏳ Blueprint Rebuild.
5. ⏳ G4 ship.
