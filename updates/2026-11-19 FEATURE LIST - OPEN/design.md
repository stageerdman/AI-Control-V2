# Feature list: design

Jony, 2026-11-19. Roadmap: [`update v1.md`](update%20v1.md). Checked against `design/user-model.md`.

## 1. The user and the goal
The user runs the studio mostly by voice and opens the features folder to **answer three questions**:
1. *Where is X?* (find a feature fast: there are 50 now and the list keeps growing)
2. *What's going on?* (what's in progress, what's next, what's done and when)
3. *Add this.* (a new idea, typed quickly)

The review of 2026-11-19 shows the list gets long and messy: duplicates get merged, vague items are dropped,
some get put on hold. Today the only way to drop a feature is **Delete**, which loses the record that we
decided against it. Shelved and Denied keep that record without crowding the active list.

**Ranked:** find (most often) > see status and dates > add > change stage > edit the text.

### What I removed, and why
- **The "+ New feature" button at the bottom, and the separate add form.** Gone: the search field at the
  top adds too (§2.1). One control instead of two at the top.
- **The Vision field.** Merged into Description (the user asked for it). Two boxes made people ask "which
  one does this go in?"; one box doesn't.
- **"Added" / "Shipped" words on each row.** The group heading already says the stage, so the row shows
  only the date (the full words are in the tooltip and for screen readers).
- **A remembered filter.** Each open starts on All, so a filter you forgot never hides anything.
- **Sort options, multi-select filters, date ranges, a server search.** Nobody asked; tens of features
  don't need them.
- **A "finished date" the user sets by hand.** The server records it when the stage changes.

## 2. The list (features folder card)

```
← Office

Features
┌──────────────────────────────────────────────┐
│ 🔍  Search or add a feature                  │   ← one field (§2.1)
└──────────────────────────────────────────────┘
 [All 50] [Now 2] [Planned 20] [Shipped 28] [Shelved 1]   ← chips; Denied hidden (0)

NOW
 ◉  UX: Feature List                 40m of ~30m   19 Nov  ›
 ◉  Workflows                                      17 Nov  ›
PLANNED
 ○  Notifications                                  16 Nov  ›
 …
SHIPPED
 ✓  Time estimates                   1h 20m        19 Nov  ›
 …
SHELVED
 ‖  Agent Thinking Power                           19 Nov  ›
```

### 2.1 One field: search, and add
- Placeholder **"Search or add a feature"**. `type="search"`, label "Search or add a feature".
- Typing filters the list live (name **and** description, case-insensitive, spaces trimmed, matching words
  in any order: "list ux" finds "UX: Feature List").
- While there's text and **no feature has exactly that name**, the first row of the list is
  **`+ Add “<text>”`** (dashed border, the existing `.ob-add` look). Click or Enter on it: creates the
  feature in **Planned** (or in the selected stage if a chip for Now or Planned is on), clears the field,
  opens the new feature's page (as today).
- **Enter in the field:**
  - no matching features → add (the same as the Add row);
  - one or more matches → open the **first** match;
  - an exact name match → open it.
  The row Enter will act on shows a small `↵` at its right end, so Enter is never a guess.
- **Esc** in the field: clears it if it has text; otherwise Esc goes back to the office, as today.
- **↓** from the field moves focus into the rows; rows are normal buttons (Tab works too).
- New-feature names are capped at 120 characters (the server's limit); `maxLength` on the field.

### 2.2 Stage chips
- One row of chips under the field: **All**, **Now**, **Planned**, **Shipped**, **Shelved**, **Denied**, each
  with its count. Single choice. Tapping the selected chip goes back to All.
- **Counts follow the search** ("time" → All 3, Now 1, Shipped 2), so the chips also say *where* the matches are.
- A stage with **no features at all** has no chip (Shelved and Denied stay out of sight until used). The
  selected chip never disappears, even if the search drops it to 0.
- `role="radiogroup"` with `aria-label="Stage"`; each chip `role="radio"` + `aria-checked`; ←/→ move between
  them. Tap targets ≥ 32 px high, 13 px bold text (same as `.ob-sts` buttons; reuse those styles).
- Chips wrap to a second line on a narrow card; they never scroll sideways.

### 2.3 Rows
- Same row as today (`.ob-row`): mark · name · time tag · **date** · ›.
- **Date** (12.5 px, 800, `--ink-soft`, tabular numbers, like `.ob-time`):
  - Now / Planned → the day it was **added** (`createdAt`).
  - Shipped / Shelved / Denied → the day it was **finished** (`closedAt`).
  - Format: `19 Nov`; another year: `19 Nov 2025`. No relative times ("2d ago" keeps changing).
  - `title` and screen-reader words: "Added 19 November 2026" / "Shipped …" / "Shelved …" / "Denied …".
- **All:** groups in this order with the existing small uppercase headings: Now, Planned, Shipped, Shelved,
  Denied (empty groups not shown). **One stage chip:** no heading (the chip already says it).
- Order inside groups: Now and Planned by their order (priority); Shipped, Shelved, Denied newest first.
  The app shows the server's order as it comes.
- **Marks** (`.ob-mark`, 18 px), one per stage, never colour alone:
  - Now: sky ring with a dot (as today). Planned: empty ring (as today). Shipped: green with ✓ (as today).
  - **Shelved:** grey ring with two short vertical bars (a pause sign), `rgba(36,26,68,.3)`.
  - **Denied:** grey ring with a diagonal stroke (⊘).
  - Shelved and Denied **names are `--ink-soft`** (still ≥ 4.5:1 on white) so closed work reads quieter.
    No strike-through: it hurts reading and the mark already says it.

### 2.4 States
- **Loading:** "Loading…" (as today). The field and chips show at once; the field is usable.
- **Error:** "Couldn't load the features." (as today); the field is hidden (you can't add to something
  that didn't load).
- **Empty office:** no chips (nothing to filter), the field reads **"Add a feature"**, and under it:
  "No features yet. Type one above, or tell Pixel what to build first."
- **No matches:** the Add row, then "Nothing matches “xyz”." in `.ob-empty`. If a stage chip is on:
  "Nothing in Shelved matches “xyz”. **Search all stages**" (a link-button that sets All).
- **Adding:** the Add row shows "Adding…" and is disabled; the field keeps its text until it succeeds.
  **Add failed:** the server's message under the field (`role="alert"`), text kept.
- **Focus on open:** stays on "← Office" (as today, so the camera move isn't hijacked by the keyboard).
  `/` focuses the field while the card is open (small, common shortcut; also shown as the field's hint).

## 3. One feature (feature page)
```
← Features

UX: Feature List                         (editable name, as today)
Added 3 Nov · Shipped 19 Nov             (one muted line, 13 px)

[◉ In progress] [○ Planned] [✓ Shipped] [‖ Shelved] [⊘ Denied]

DESCRIPTION
┌───────────────────────────────────────────────┐
│ (one box, 10 rows, grows with its text)       │
└───────────────────────────────────────────────┘
Delete                                      Saved · [Save]
```
- **Date line:** "Added 3 Nov" always; plus "· Shipped 19 Nov" / "· Shelved …" / "· Denied …" when
  closed. Same format rules as rows. Updates after save (it's the server's date, not a guess).
- **Stage buttons:** the existing `.ob-sts` group with five buttons; wraps on narrow cards. Picking one
  is a draft change (saved with Save, as today). No confirmation for Shelve or Deny: it's undoable by
  picking another stage, unlike Delete.
- **Delete** stays, still with its confirmation. With Denied in place it's mostly for mistakes and duplicates.
- **Description:** one textarea, `rows={10}`, label "Description". Old Vision text already sits at the end
  of it after the migration, after a blank line; nothing to show for it in the UI.

## 4. What the server must provide
Exactly this; nothing else is needed for the design.

| # | What | Detail |
|---|---|---|
| 1 | **Five stages** | `status ∈ now · planned · shipped · shelved · denied`, in the DB check, the routes, the director's tools, the `feature.changed` event and the app types. |
| 2 | **`closedAt`** | `string \| null` (ISO) on every `Feature`. Set by the server when the stage becomes shipped/shelved/denied (also when moving between two of them); cleared when it goes back to now/planned; untouched by edits that don't change the stage. Never accepted from callers. |
| 3 | **`createdAt`** | Already there; unchanged. |
| 4 | **Back-fill** | Shipped features get `closedAt` from the latest event that shipped them, else `updated_at`. |
| 5 | **No `vision`** | Migration appends it to `description` (blank line between); removed from the table, the `Feature` type, POST/PATCH (now a 400), the director's and agents' tools, the orchestrator's summary. |
| 6 | **List order** | `GET /projects/:id/features`: Now, Planned by position; then Shipped, Shelved, Denied by `closedAt` newest first. |
| 7 | **Progress** | shipped ÷ (all − shelved − denied). |
| 8 | **Goal rules** | A goal linked to a planned, shelved or denied feature moves it to Now. A running goal never moves or ships a feature that is shelved or denied. |
| 9 | **Agent limit** | The agents' `feature` tool accepts only now / planned / shipped. |
| 10 | **Create in a stage** | `POST` already takes `status`; the app sends `now` or `planned` when that chip is on. No change. |

Not needed from the server: search, filtering, counts, date formatting (all in the app; the list is
already loaded whole).

## 5. Voice path
Voice-first rule: every action here has a spoken path through the director's tools (Phase 2):
"shelve the thinking dial", "deny the red phone", "bring thinking power back", "what did we ship this
week?" (the `features` tool's output carries the dates), "add notifications to the list".

## 6. Accessibility checklist
- Field: visible label for screen readers, `type="search"`, `/` hint in the placeholder area, Esc clears.
- Chips: radiogroup, arrow keys, `aria-checked`, ≥ 32 px targets, focus ring `--grape` 3 px (as elsewhere).
- Rows: stage in `sr-only` text (as today) plus the spoken date; the `↵` hint is `aria-hidden` and the field
  gets `aria-describedby` "Enter opens <name>" / "Enter adds <text>", updated politely.
- Marks are shape-coded, not only colour-coded. `--ink-soft` on white passes 4.5:1.
- Result count announced politely after typing settles (300 ms): "3 features".

## 7. Assumptions (guesses, check in Phase 5)
- *Guess:* the user wants Shelved and Denied visible under All (at the bottom), not hidden behind their
  chips. Check: if the bottom groups feel like clutter, collapse them to one line "Shelved (4) ›".
- *Guess:* Enter opening the first match is what people expect from a search field; adding happens only
  when nothing matches, so a stray Enter never creates a duplicate.
- *Guess:* a date per row (not relative time) is enough to answer "what shipped lately".
