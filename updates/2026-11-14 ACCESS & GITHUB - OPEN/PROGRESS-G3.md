# PROGRESS — G3 App UI (access, GitHub, ports, rebuild) + G4 ship to /Applications

Commits prefixed `ACCESS G3:` / `ACCESS G4:`. Spec: `spec-ux-G2.md`. Contract: `PROGRESS-G1.md`.

## Status
0. ✅ Two small server additions the spec needs (G1 didn't expose them): `GET /github/status`
   `{gh: 'ready'|'missing'|'signed-out', login}` (publish form's owner prefix, the "sign in" hints) and
   `remote: {url, github}` on `GET /sandbox/folders` (the Name step's "keeps origin"). Tests in `github.test.ts`, `setter.test.ts`.
1. ⏳ Access (multi-field editor, templates, safe grants, "new" dot, `/accesses`).
2. ⏳ GitHub (Name step switch, Rivet's row, health row, studio default).
3. ⏳ Ports (the Switchboard).
4. ⏳ Blueprint Rebuild.
5. ⏳ G4 ship.
