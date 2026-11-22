# Vault folder access — update v2: the app's own data folder, automatic

**Goal:** every Mac app project's agents can always read and write that app's own data folder
(`~/Library/Application Support/<bundle id>`), with no Access Vault entry, no switch and no startup step.
The user decided an app's own data folder does not belong in the vault. Folder accesses stay in the vault
for any *other* folder the user adds by hand.

Why v2: v1 put the folder in the vault and needed the user to flip a switch, and the studio checked every
project on start to offer it. That is a step the user should never have to take for their own app.

## Phase 1: the folder reaches every run by itself

- `projectAccess.ownAppDataFolder(projectId)`: the project's bundle id (existing `bundleIdOf`) →
  `appDataFolder(home, id)` → the same guard as any folder (`liveFolder`: real path after symlinks, not too
  broad, no overlap with the studio's folders, must exist). A bundle id that isn't one plain folder name
  (`/`, `.`, `..`) is refused. Not a Mac app (no or several bundle ids, a 409) → nothing.
- `foldersFor` = the own folder + granted vault folders (deduplicated). It already feeds `--add-dir` per
  session and the `backup_folder` tool, so both pick it up unchanged.
- `agentAccess` adds the own folder as one line (`<Name> app data`), so the prompt names it and points at
  `backup_folder`, like any shared folder.
- Read on each fresh session (no caching): a bundle id added later, or a folder the app creates on first
  launch, is picked up on the next session.

## Phase 2: drop the vault route

- Remove `projectAccess.addAppDataFolder`, `offerAppDataFolders`, the on-start call in `app.ts` and
  `POST /projects/:id/app-data-access` (nothing in the app called it).
- Migration 50 deletes the entries v1 added automatically (folder set, no fields, the exact `serves` and
  `instructions` text v1 wrote — Pensieve's included) and their grants. Folder accesses the user made by
  hand are kept.

## Phase 3: tests, notes, wiki

- Tests: own folder reaches a run with no grant (real path, prompt names it, `--add-dir`); non-Mac project
  gets nothing; a missing folder isn't passed; a bundle id with a slash is refused; a vault folder shared
  by hand still reaches the run; the migration removes the v1 entry and keeps a hand-made one.
- Notes in this file + the update's wiki.

## Status

All three phases built. Code: `server/src/secrets/ownAppData.ts` (new), `projectAccess.ts` (`foldersFor`,
`agentAccess`; `addAppDataFolder` and `offerAppDataFolders` gone), `app.ts` (boot step gone),
`routes/accesses.ts` (route gone), `db/migrations.ts` (50). Tests: `server/test/secrets/folder-access.test.ts`;
`test/helpers.ts` gives every test app a temp home. The own folder carries a short instruction ("Quit the app
before changing its data.") and the prompt's folder line already points at `backup_folder`.

## Risks

- Every Mac app project now opens its own data folder to its agents by default. That is the user's
  decision; the guard still keeps it to that one folder.
- A sandboxed Mac app keeps its data under `~/Library/Containers/<id>/…`; not covered (as in v1).
