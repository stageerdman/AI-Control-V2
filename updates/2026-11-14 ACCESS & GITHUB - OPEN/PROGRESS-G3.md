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
2. ✅ GitHub — Name step: `⎇ GitHub · private repo` switch (draft `github`, default from `GET /settings`),
   "keeps origin (owner/repo)" with no switch for an adopted folder with a remote, a quiet hint when gh isn't
   signed in (never blocks). Rivet's checklist ends with a `GitHub` row; `githubDetail` maps every server line to
   the spec copy (done / push failed / kept / off / CLI / name taken / other → skipped, setup still finishes);
   "(local only)" gone. Health: `GithubRow` (`office/github.ts` pure state) — repo link ↗, Private/Public switch
   (going public = inline confirm, focus on Keep private; private = at once), last push (`pushed 2 min ago` /
   `not pushed yet` / amber `last push didn’t go through` + `Try again`), unpublished → `Publish to GitHub…` inline
   form (owner from `GET /github/status`, name check, Private default) → one confirm sentence with the commit count;
   gh not ready → how-to hint + `Check again`. Server: `POST /projects/:id/github/push` for Try again (tested).
   Studio default: a switch under the Blueprint's Starter Kit ("A private GitHub repo"). Projects cards: the
   "GitHub not connected" chip is gone (chip only when published). `github.changed` / `github.push` refetch health.
   Shots `g3-setup-github`, `g3-setup-github-setter`, `g3-setup-github-skipped`, `g3-gh-missing`, `g3-gh-publish`,
   `g3-gh-confirm`, `g3-gh-published`, `g3-gh-public-confirm`, `g3-gh-push-failed`, `g3-github-default`.
3. ✅ Ports — `features/ports`: "· Ports" text button in the Projects count line opens **The Switchboard** (read-only
   wide sheet: project · block · app port running/stopped · also listening, with the agent holding a spare;
   projects with a folder only, on set first then the back lot muted; `GET /ports` on open + every 5 s while open;
   name → office). Health App details gain `Ports 3330–3334 · app on 3330 · 3331 also listening · All ports`
   (opens the sheet with that row highlighted + focused). **Cut:** "Free" (no stop-a-listener route) and "Outside
   any project" (`GET /ports` doesn't scan outside the blocks). Shots `g3-ports`, `g3-ports-app-row`.
4. ⏳ Blueprint Rebuild.
5. ⏳ G4 ship.
