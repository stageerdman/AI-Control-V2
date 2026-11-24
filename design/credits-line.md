# The credits line

Feature `f-ai-credits-tracker`, Phase 3. Data and maths: `updates/2026-11-24 AI CREDITS TRACKER - OPEN/update v1.md`.

## User goal
"Will my agents run out before the limit resets?" Answer it in a glance, without opening anything,
and never let a run die from a limit the user didn't see coming.

Ranked: (1) is there enough left, at a glance → (2) if not, when does it run out → (3) when does it come back.
Exact burn rate is the least asked; it explains (2), so it sits in the card, in words.

## What was removed, and why
| Removed | Why |
|---|---|
| A number on the line itself | The length of the fill *is* the number. Words appear on the line only when they're needed (low, limited). |
| "Studio's share per agent" row in the card (in the v1 roadmap) | Not in the brief and not a top goal. It answers "who burned it", which belongs to Agent Performance. Add back only if people ask. |
| Settings, thresholds, toggles | One smart default (below). Nothing to set. |
| Showing every window (Opus/Sonnet 7-day, overage) | The line shows the **binding** window; the card adds at most one other row. Rare windows appear only when they bind. |
| A red bar | Red on the whole top edge reads as an error all the time. The warning uses warm colours, a word chip and a slow pulse. It never depends on colour alone. |
| A refresh button | It would cost quota (see "probe", deleted). The card says how old the reading is instead. |
| The chip on the line ("runs out ≈ 3:10 pm", "Limit reached · back at…") — *v2, 2026-11-24* | The user found it noisy. The warm, thicker, breathing line already says "careful"; the details are one hover away. Screen readers still hear the runs-out sentence (meter label + one announcement). |
| Burn rate and the verdict sentence in the card — *v2* | The user asked for the card to be just: 5-hour left, weekly left, both resets. "Runs out in ~40 min" was the same noise as the chip. |

## Where
- One strip fixed to the very top edge of the window, full width, above everything, on **both** the studio and the
  office layers (the office is where the burning happens). Not on the dev gallery.
- It takes no layout space: it is drawn over the top 3 px, so no screen moves. `pointer-events` only on its hit area.
- Visible line **3 px** (4 px when warning or limited). Invisible hit area **12 px** tall across the full width, so
  it's easy to hover; on touch, a tap anywhere along the top 24 px opens the card.

## The line, state by state
`left` = binding window's share left (0–1). Fill width = `left × 100%`, from the left edge. The used part is a
quiet track: `--color-line` on light screens, `rgba(255,255,255,.12)` on dark ones.

| State | When (from `/credits`) | Fill | Motion | Words on the line |
|---|---|---|---|---|
| `ok` | lasts until reset, > 15% left | Full rainbow, in order: sky → teal → mint → sun → coral → rose → grape. The gradient is 200% wide and drifts left to right, one loop per 24 s. | Faint shimmer: a soft white highlight (12% opacity, 80 px wide) glides across every 6 s. | none |
| `warning` | hits limit before reset, **or** ≤ 15% left, **or** Anthropic says `allowed_warning` | Same rainbow, but only the warm half (sun → coral → rose), so it reads "warm" at a glance without going red. Line grows to 4 px. | Shimmer every 2 s and the fill's right end breathes (opacity .7 ↔ 1, 1.6 s). | none |
| `limited` | `rejected` and not on overage | Track only, tinted coral at 35%. No fill. 4 px. | none (stillness says "stopped") | none |
| `stale` | newest reading > 15 min old | As `ok`/`warning` from the last reading, at 60% opacity. | Shimmer off. | none (age is in the card) |
| `fresh` | the window's `resetsAt` has passed, no new reading | Full rainbow, full width, at 60% opacity. | Shimmer off. | none |
| `none` | no reading ever | Track only, with a single slow shimmer every 10 s, so it's clearly "something lives here". | as said | none |
| `estimated` (Phase 5) | fallback in use | As `ok`/`warning`, with the fill drawn as dashes (8 px on, 3 px off). | as the state | none; the card says "estimated" |

No words ever sit on the line (v2: the chip was removed).

### Motion rules
- `prefers-reduced-motion: reduce` → no drift, no shimmer, no breathing. The colours, chip and words stay, so
  nothing is lost.
- Fill width changes ease over 600 ms (`--ease-out`). No spring: it's a gauge, not a toy.
- The tab hidden → animations paused (CSS `animation-play-state` via `document.hidden`), to save battery.

## The card
Opens on hover (after 150 ms, so passing the mouse to the tabs doesn't flash it), on keyboard focus, or on tap.
Closes on mouse leave (after 250 ms), Escape, tap outside, or focus leaving. Anchored under the pointer's x
position (clamped 12 px from the edges); from the keyboard it anchors at the right.

Width 280 px, radius `--radius-md`, white panel, `--shadow-panel`, 16 px padding, two type sizes only
(15 px semibold, 13 px regular `--color-ink-soft`).

v2 (2026-11-24): the card answers three things, top to bottom — how much of the 5-hour window is left, how much
of the week is left, and when each comes back. Nothing else.

```
 ┌────────────────────────────────────┐
 │ 49% left                    5-hour │  15 px semibold · window name 13 px soft
 │ ▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░       │  rainbow (warm when this window is low), 6 px
 │ 72% left                    Weekly │  the same row, same look
 │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░       │
 │ ────────────────────────────────── │
 │ 5-hour resets  Today 4:30 pm · in 2 hours │  label soft · day + time ink · countdown soft
 │ Weekly resets      Sat 9 am · in 4 days   │
 │ Updated 3 min ago                  │  13 px soft, only when > 2 min old
 └────────────────────────────────────┘
```

- Always 5-hour first, weekly second, whichever window the line follows. The dialog is named by the first title.
- Row states: limited → **"0% left · Limit reached"**, empty bar; fresh → **"100% left · Fresh window"**, dim
  full bar; no reading of that window yet → **"No reading yet"**, dim empty bar.
- Reset rows: day + time always carries the day — **"Today 4:30 pm"**, **"Tomorrow 9 am"**, **"Sat 9 am"** — then a
  one-unit countdown: **"in 40 minutes"**, **"in 3 hours"**, **"in 2 days"** (rounded, singular at 1). Unknown
  (fresh or no reading) → **"Known after the next run"**, no countdown.
- None at all: title **"No reading yet"**, one line: **"Usage appears after the first run."** Nothing else.
- Estimated: the first title gets a small soft suffix **"· estimated, studio use only"**.
- Data: both windows and their `resetsAt` already come in `windows[]` of `GET /credits` and its live events; no
  server change was needed.

Number and time rules:
- % left is a whole number, never "100% left" while anything is used (show 99%). Never below 0.
- Clock times in the user's locale and zone.
- Rare windows (Opus/Sonnet weekly) can still drive the line when they bind; the card shows the two plan windows.

## Accessibility
- The visible line is `role="meter"` with `aria-valuemin=0`, `aria-valuemax=100`,
  `aria-valuenow=<left %>`, and `aria-label` holding the plain sentence, e.g.
  "AI credits: 62% left, lasts until it resets at 4:30 pm". The hit area is a `button` with
  `aria-expanded` and `aria-controls` the card; it's the **first** tab stop of the page (it's at the top).
  Focus ring: 2 px `--color-sky`, under the line, visible on any background.
- The card is `role="dialog"` non-modal (`aria-modal` false), labelled by its title. No focus trap.
- Entering `warning` or `limited` announces once through a polite live region: "AI credits low: runs out in about
  40 minutes." Never repeats for the same window.
- Contrast: card text is ink on white (> 12:1). The line itself is decorative beyond the meter; meaning
  never rides on colour alone (card words, aria label, announcement).
- Reset rows are a `<dl>` (label → value), so screen readers pair them.
- Tap target: the top-edge tap zone is 24 px.

## Build spec (for Frontend)
- `app/src/features/credits/model.ts` (pure): `view(forecast, now, locale) → { state, leftPct, fillTone:
  'rainbow'|'warm'|'none', thick, dim, dashed, aria, announce, card: { title, empty|null, usage: [{ window, title,
  note|null, fill, tone, dim }], resets: [{ label, when, relative|null }], age|null, estimated } }`. All words above
  come from here and nowhere else.
- `app/src/features/credits/CreditsLine.tsx`: renders the strip and card from `view()`; subscribes to
  `GET /credits` and the `credits.changed` event; re-renders each minute.
- `app/src/features/credits/credits.css`: tokens only from `design/theme.css` (`--color-*`, `--ease-out`,
  `--radius-md`, `--shadow-*`). Gradient stops use the seven palette colours in the order above.
- Mounted once in `app/src/shell/Shell.tsx`, before `<Motes />`, for the studio and office layers.
- Tests: `model.ts` for every state, each verdict sentence, the time and "in ~X" rules, 99%-not-100%, and the
  binding/other-window swap. Component render for `none`, `ok`, `warning` (chip present), `limited`, and
  reduced motion (no animation classes).

## Assumptions (guesses — check)
- A 3 px line is noticed enough when calm, and the chip is noticed when low. Check: in the live pass, do people
  find the card without being told? Does anyone hit a limit without having seen the chip?
- 15% left / "runs out before reset" is the right moment to warn. Check: warnings that turned out false alarms.
- The chip doesn't collide with the office's top-right controls. Check in the live pass; if it does, move the chip
  to the top-centre.
- The warm-only rainbow reads as "careful" without red. Check: ask the user what the warning line means, cold.
