# Feature list — update v1

Serves **UX: Feature List** (`f-ux-feature-list`) and closes **Change location of Add New Feature**
(`f-put-button-to-add-new-feature-request-on`), which is point 4 of it.

## Goal
The features folder is the user's map of the product. Make it fast to find a feature, honest about
what was dropped, and quick to add to:
1. Two more stages: **Shelved** (paused, may come back) and **Denied** (decided not to build).
2. A **search field** and a **stage filter** at the top of the list.
3. Each feature shows **when it was added**, or **when it was finished** (shipped, shelved or denied).
4. **Adding a feature happens at the top**, not under the list.
5. **Description and Vision become one field**: Description.

Design and the exact server contract: [`design.md`](design.md) (same folder).

## Status
- [x] Roadmap and design (Jony, 2026-11-19).
- [x] Phase 1: server data. [x] Phase 2: server rules (Uncle Bob, 2026-11-19; see "API (as built)" below).
  [x] Phase 3: the list. [x] Phase 4: the feature page (Jony, 2026-11-19; see "App (as built)" below).
  [~] Phase 5: live check: done against the real 53 features (read from the running server, mapped the way
  migration 46 does); not yet looked at in a real window (narrow card, screen reader) once the server is installed.

## App (as built, Phases 3–4)
- `features/office/feature-list.ts` (pure): `filterFeatures`, `stageCounts`, `visibleChips`, `exactMatch`,
  `enterAction`, `newStage`, `featureDate`, `dateLine`, `STAGES`, `STAGE_LABEL`, `isClosed`.
- `features/office/FeatureList.tsx`: the folder card (field, chips, groups, Add row, states, keys: Enter,
  Esc, ↓/↑, ←/→, `/`). `board-parts.tsx`: `Back`, `Mark` (five shape-coded marks), `useFeatures`.
- Feature page (`Board.tsx`): date line under the name, five stage buttons (wrap), one Description.
- `estimates.ts` `featureTags`: open = now|planned, so shelved/denied rows show what they took.
- Live check on real data: 53 rows, chips `All 53 · Now 1 · Planned 21 · Shipped 30 · Shelved 1` (Denied
  hidden), "list ux" → UX: Feature List, 21 descriptions carry merged Vision text.

## Phases
Phases 1–2 are server (one checklist item); 3–4 are app (one item, starts after 1–2 land);
5 is the check. Phase 3 and 4 can be built in parallel once the API is in.

### Phase 1: the data (server)
- **Migration 46** rebuilds `features` (SQLite can't change a `CHECK`):
  - `status CHECK (status IN ('now','planned','shipped','shelved','denied'))`.
  - New column `closed_at TEXT NULL`: when it entered shipped / shelved / denied.
  - The **vision column is removed**. Its text first moves into description:
    `description = trim(description) || '\n\n' || trim(vision)` when vision isn't empty
    (just `vision` when description is empty).
  - Back-fill `closed_at` for shipped rows: the time of the latest `feature.changed` / `feature.shipped`
    event that put it in shipped; else `updated_at`.
  - Keep `features_by_project` index.
- `db/features.ts`: `FEATURE_STATUSES` gets `'shelved', 'denied'`; `Feature` gets `closedAt: string | null`
  and loses `vision`; `FeatureCreate` / `FeaturePatch` lose `vision`.
- `closed_at` is set by the repo, never by callers: entering a closed stage (shipped/shelved/denied) from
  an open one (now/planned), or moving between two closed stages, sets it to now; going back to open clears it.
  Saving without a stage change leaves it alone. Creating straight into a closed stage sets it.
- `list()` order: Now, Planned (by `position`), then Shipped, Shelved, Denied (each by `closed_at` newest
  first, then position).
- **Tests** (`server/test/db/features.test.ts`, `server/test/routes/features.test.ts`):
  migration merges vision into description (both, one, neither); shipped rows get a back-filled date;
  `closedAt` set / kept / moved / cleared on every transition above; list order; `vision` in a POST or
  PATCH is a 400; the two new stages are accepted.

### Phase 2: the rules around the stages (server)
- **Progress** (`office/lifecycle.ts`): shipped ÷ (all − shelved − denied). If nothing is left, fall back
  to the goal % as today.
- **Goals and features** (`crew/dispatch.ts`):
  - `linkFeature`: a goal linked to a *planned or shelved* feature moves it to Now (clears `closedAt`).
    *Denied* also moves to Now: the director only links when the user asked for that work.
  - `featureFollows`: only moves a feature whose stage is Now or Planned. A feature the user shelved or
    denied while a goal ran is left where the user put it (no pct changes, no auto-ship).
- **Director tools** (`office/feature-tools.ts`): status enum from `FEATURE_STATUSES`; `can` / descriptions
  name the five stages and the voice paths ("shelve X", "deny X", "bring X back"); `vision` argument removed.
  `features` output shows the date (`added 3 Nov` / `shipped 12 Nov`).
- **Agent tool** (`office/agent-feature-tool.ts`): agents may set `now | planned | shipped` only. Shelving
  and denying are the user's or the director's call. `vision` removed.
- **Event** (`domain/events.ts` `feature.changed`): status enum gets the two stages; payload adds `closedAt`.
- **Orchestrator summary** (`office/threads.ts`) and **fake brain**: drop vision, include status as-is.
- **Timesheet / estimates**: unchanged on the server (samples stay shipped-only).
- **Tests:** progress ignores shelved/denied; a goal on a shelved feature moves it to Now; a goal finishing
  on a shelved feature doesn't ship it; the agent tool refuses `shelved` / `denied`; the director tool
  accepts them; the event carries the new status.

### Phase 3: the list (app, `Board.tsx` Folder → its own `FeatureList.tsx`)
Spec: design.md §2. A search field at the top that also adds; stage chips under it with counts; rows with a
date; Shelved and Denied groups at the end.
- Pure helpers in `features/office/feature-list.ts`: `filterFeatures(list, query, stage)`,
  `stageCounts(list, query)`, `featureDate(f, today)`, `enterAction(list, query, stage)` (what Enter will do).
- `estimates.ts` `featureTags`: "open" means now|planned (not "not shipped"), so a shelved feature shows
  what it took, not "so far of ~30m".
- `api.ts`: `FeatureStatus` adds the two stages; `Feature` gets `closedAt`, loses `vision`.
- **Tests** (`feature-list.test.ts`): search matches name and description, any case, ignores extra spaces;
  stage + search combine; counts follow the search; zero-count stages hidden except the selected one;
  Enter opens the exact-name match, else the first match, and adds only when nothing matches; the Add row
  shows whenever no feature has exactly that name; a new feature lands in the selected Now/Planned chip;
  dates (this year → "19 Nov", other year → "19 Nov 2025", screen-reader words "added …", "shipped …").

### Phase 4: the feature page (app)
Spec: design.md §3. One Description field; five stage buttons; the date line under the name.
- **Tests:** draft has no vision; saving sends only changed fields; the date line for every stage.

### Phase 5: live check
Run the app against a copy of the real data: vision text merged and readable; shipped dates look right;
search, chips, Enter, keyboard only, screen reader labels; narrow card (360 px) wraps chips and stage
buttons cleanly. Then mark both features shipped.

## Decisions
- **One field to search and add** (design.md §2.1). The brief asked for a search bar *and* an add button
  on top; one field does both, so the top of the list has one control, not two.
- **Shelved ≠ Denied.** Shelved = "not now"; Denied = "no". Both count as closed: out of progress, at the
  bottom, dated.
- **No new "finished" field for the user to set.** The date is a fact the server records on stage changes.
- **Filter is not remembered.** Each open starts on All, so nothing is hidden by a filter you forgot.
- **Search is in the app**, not the server: an office has tens of features, already loaded.
- **Agents can't shelve or deny.** That is a product decision; it stays with the user and the director.

## What the server must provide (summary; full contract in design.md §4)
1. Five stages: `now | planned | shipped | shelved | denied`, accepted everywhere a status is.
2. `closedAt` on every feature (ISO or null), set by the server on stage changes, back-filled for shipped.
3. `createdAt` (exists).
4. No `vision`: merged into `description` by migration, gone from the API, tools and events.
5. List order: Now, Planned by position; Shipped, Shelved, Denied by `closedAt` newest first.
6. Progress, goal linking and auto-ship rules for the two new stages (Phase 2).
7. Agent tool limited to now/planned/shipped.

## API (as built, Phases 1–2)
What the app can rely on now. Differences from the plan above are marked **(changed)**.

**Feature** (every read, list item, POST/PATCH answer):
```
{ id, projectId, name, status: 'now'|'planned'|'shipped'|'shelved'|'denied',
  order (1-based in its stage), pct: number|null, owner: string|null,
  description: string, createdAt: ISO, updatedAt: ISO, closedAt: ISO|null }
```
- `GET /projects/:id/features`: Now, Planned (by `order`), then Shipped, Shelved, Denied (each `closedAt`
  newest first, then `order`).
- `POST /projects/:id/features` `{name, status?, order?, pct?, owner?, description?}`. Creating straight into
  a closed stage sets `closedAt` to now.
- `PATCH /projects/:id/features/:featureId`, same fields, all optional.
- `closedAt` is the server's: open → closed and closed → another closed stage set it to now; closed → open
  clears it; a save that keeps the stage leaves it alone.
- **(changed)** Bad input, including `vision` or `closedAt` in a body, is a **422** (this codebase's
  validation status), not 400.
- Event `feature.changed {featureId, name, status, order, closedAt, …}` (`deleted: true` on delete).
- Stage rules live in one pure module, `server/src/domain/feature-stages.ts` (`FEATURE_STATUSES`,
  `AGENT_FEATURE_STATUSES`, `isClosed`, `closedAtAfter`); the app can mirror `isClosed` = shipped|shelved|denied.

**Migration 46** (runs once on start):
- Vision text merged into description (`description\n\nvision`, or just one when the other is empty);
  the column is dropped.
- `closedAt` back-filled for shipped rows from the event that shipped them (the first "shipped" event after
  the last "open" one, so later edits don't move the date), else `updated_at`.
- **(changed)** Features named `Shelved: X` / `Denied: X` move to that stage, the prefix dropped from the
  name (e.g. "Shelved: Agent Thinking Power" → "Agent Thinking Power" in Shelved), dated from `updated_at`.
  Positions are renumbered in every stage.

**Rules:**
- Progress = shipped ÷ (all − shelved − denied); if nothing is left, the goal % as before.
- A new goal linked to a planned, shelved or denied feature moves it to Now (`closedAt` cleared).
- A goal that finishes on a feature the user closed while it ran leaves it alone (no pct, no auto-ship).
- Director tools (`features`, `add_feature`, `edit_feature`) take all five stages and show the date:
  `f-x — X [planned #1, added 3 Nov]`, `[shelved #2, shelved 19 Nov]` (year added when not this year).
- The agents' `feature` tool takes now/planned/shipped only: `"status" is one of: now, planned, shipped.`
- The timesheet rollup counts a feature as finished when it is closed (any of the three).

**App compat done with it** (so the app builds; the real UI is Phases 3–4): `api.ts` `Feature` has
`closedAt` and no `vision`; the feature page dropped the Vision field.
