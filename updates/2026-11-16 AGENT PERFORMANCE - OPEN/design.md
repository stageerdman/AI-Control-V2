# Agent performance — design

States preview: [`states.html`](states.html) (open in a browser).

## User goal
"Who on this office's team is doing the work, what does it burn, and where is it stuck?" Open it any time, scan
it in ten seconds, and leave knowing one thing to change: add an agent, share the load, or stop asking someone
who isn't needed.

**Feeling:** a coach's clipboard after the match. Calm, honest, a little proud. Not a stock ticker, not a
report card.

## The one decision: grow the clock, don't add a screen
The office already has a door for this: the **wall clock** opens **Agent time** (`TimeSheet`): total time,
kind of work, who put it in. That is half of a performance view. So the clock's sheet grows into it. No new
route, panel, tab bar or top-bar button (the office rule: everything new is a thing in the room).

- Sheet title: **How the team works** (was "Agent time"). Sheet name: "How the team works on {office}".
- Clock label stays (`Agent time: 6h 20m, 2 agents working now`); its title adds "— open how the team works".
- Everything is **per office** (per project). There is no studio-wide view in this design.

## What I cut (and why)
- **Money.** Runs use the user's subscription; the clock already says "no money anywhere". We show tokens, not
  dollars. (Kept as-is from the clock's own rule.)
- **Red / green trends.** More tokens is not bad and fewer requests is not good. Trend arrows are neutral
  (`--ink-soft`), the words carry the meaning.
- **Leaderboard medals, scores, "efficiency %".** Agents aren't racing. We show shares, not grades.
- **A chart per agent (sparklines on every row).** Ten tiny charts are noise. One chart; tap an agent and the
  chart becomes theirs.
- **Free date pickers, CSV export, custom metrics.** Three ranges cover "this week, this month, ever".
- **Cache read / write / input / output as four columns.** One token number. The split lives in the agent's
  detail line, in words.
- **Live-updating graphs.** The numbers count up while someone works (the clock already polls every 30 s);
  the chart redraws on that same beat, never more.

## Layout (one scroll, top to bottom)

```
┌───────────────────────────────────────────────────────┐
│ How the team works                                 ✕  │
│ Everything the crew did on AI Studio.                 │
│                                                       │
│ [ 7 days | 30 days | All time ]          ● 2 working  │  ← range + live pill
│                                                       │
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐       │
│ │ AGENT TIME  │ │ TOKENS      │ │ REQUESTS    │       │  ← three measures; one is picked
│ │ 6h 20m      │ │ 4.1M        │ │ 38          │       │     (sun underline = picked)
│ │ ↑ 24% vs    │ │ ↑ 9% vs     │ │ ↓ 3 vs      │       │
│ │ last week   │ │ last week   │ │ last week   │       │
│ └─────────────┘ └─────────────┘ └─────────────┘       │
│                                                       │
│ ▁ ▃ ▂ ▅ ▇ ▃ ▆                                         │  ← trend: the picked measure per day
│ T W T F S S M                                         │
│                                                       │
│ WORTH A LOOK                                          │
│ ◐ Blair did 52% of the work. Another designer could   │  ← at most 3 plain flags
│   share it.                                           │
│ ○ Quill wasn't asked this week.                       │
│                                                       │
│ WHO DOES THE WORK                     by team ▾       │
│ Design · 3h 10m                                        │  ← team header (only if 2+ teams)
│ (bot) Blair   Studio Design   ████████████░  3h 02m ↑ │
│ (bot) Quill   Writer          ░             8m      ↓ │
│ Engineering · 3h 10m                                   │
│ (bot) Rivet ★ Captain         ███████░░░░░  1h 50m    │
│ …                                                     │
│                                                       │
│ KIND OF WORK                                          │  ← unchanged from today
│ Coding & building  ██████████       3h 40m            │
└───────────────────────────────────────────────────────┘
```

### 1. Range
A segmented control: **7 days** (default) · **30 days** · **All time**. Remembered per office (local).
"All time" starts at the office's first work (`since`).
- Days are the user's local days. "7 days" = today and the 6 days before.
- `role="radiogroup"`, arrow keys move, the picked one is a sun pill with ink text.

### 2. Three measures (the cards are also the chooser)
| Card | Number | What counts | Detail line (on the agent row, in words) |
|---|---|---|---|
| **Agent time** | `worked()` as today | run time + crew calls; parallel agents add up | "11 runs · 140 turns" |
| **Tokens** | `4.1M`, `840k`, `920` | every token a run used: input + output + cache write + cache read | "1.2M new · 2.9M re-read" (re-read = cache read) |
| **Requests** | a count | each time the agent was asked for something: a task brief / run, a call they answered, a chat turn | "6 tasks · 4 calls · 2 chats" |

- Tap a card (or arrow within the group, `role="radiogroup"` "Measure") → the chart and the team list switch
  to that measure. Default: **Agent time** (the clock's own measure, so the door matches the room).
- Big number: 32 px, weight 900, tabular. Label: the same 13 px uppercase `--ink-soft` as `.ts h3`.
- **Trend line** under it: `↑ 24% vs last week` / `↓ 3 vs last month` (counts under 20 use the plain
  difference, not %). "last week" = the 7 days before; "last month" = the 30 before. All time: no trend line.
  Previous period empty → `new this week`. Same → `same as last week`.
- Picked card: white panel, 3 px sun underline, `aria-checked`. Others: `rgba(36,26,68,.04)` fill, no line.

### 3. Trend chart
One bar per day for the picked measure (7 bars, or 30; All time: one bar per **week**, at most 26, older weeks
fold into the first bar labelled "earlier").
- Flat bars, radius 6 on top, 4 px gap, **sun** (`--sun`). Today's bar: sun with a 2 px `--sun-deep` outline
  while anyone works (it's still growing).
- Empty day: a 3 px tall `--line` stub, so "nothing" still has a shape.
- No y-axis, no grid. The tallest bar carries its value as a label above it; everything else on hover/focus.
- Day letters under the bars (7 days); 30 days shows only every Monday's date (`Nov 4`).
- **Hover / focus a bar** → a small ink tooltip: `Tue, Nov 12 · 2h 10m · 410k tokens · 9 requests` (all three,
  so one look answers "was that a busy day in every sense?").
- **Agent picked** (tap a row below): bars switch to that agent's own **hue** (one of the 7 character
  colours), the chart title says `Blair · tokens per day`, a ✕ chip `Blair ✕` clears it. Team totals come back.
- Height 96 px (72 px at ≤ 640). Keyboard: the chart is one tab stop; ← → move between bars.

### 4. Worth a look (the bottleneck finder)
At most **three** plain sentences, worked out from the range. This is the part that answers "where should we
add agents or delegate better". Order = the order below; first three that apply.

| Flag | When | Line |
|---|---|---|
| **Carrying the load** | one agent has > 50% of the team's agent time, team has 3+ agents, 2h+ total | "Blair did 52% of the work. Another {role} could share it." |
| **Work waited** | tasks or calls queued for a busy agent, total wait > 30 min | "Work waited 2h 10m for Rivet while they were busy." |
| **Stops early** | ≥ 3 runs and ≥ 1 in 3 ended failed, cut off or out of turns | "4 of Rivet's 9 runs stopped early." |
| **Heavy reader** | an agent's share of tokens is twice their share of time, and > 25% of all tokens | "Pixel used 40% of the tokens in 15% of the time." |
| **Not asked** | an agent on the office's team has 0 requests in the range (7 or 30 days) | "Quill wasn't asked this week." |

- Each line: a 10 px dot in the agent's hue + the sentence (15 px, weight 700). The agent's name is a button:
  it picks that agent (chart + row), same as tapping the row.
- Nothing applies → one quiet line: "Nothing stands out. The work is spread well." (`--ink-soft`).
- Fewer than 3 requests in the range → the section hides (too little to judge).
- These are hints, never actions. No "Hire" button here; the user says it to the director (voice path).

### 5. Who does the work
The existing "Who put it in" list, grown up.
- Row: mini bot (`Hero size="xs"`, idle, front) · name + role (role in `--ink-soft`) · a **share bar** in the
  agent's own hue · the number for the picked measure · a trend arrow (`↑`, `↓`, nothing when within ±10%).
- Sorted by the picked measure, most first. Ties: name.
- **Grouping:** if the office has 2+ teams, rows sit under team headers (`Design · 3h 10m`, 13 px, weight 800),
  captain first with a small ★ before the role ("★ Captain"). Teams are sorted by their total. The director
  (orchestrator) sits in its own group on top, **Director**, because they think for everyone.
  A `by team ▾ / everyone` switch (plain text button) flattens it to one list. One team → flat, no switch.
- The share bar's width is the agent's share of the **office** total (not the team's), so bars compare
  across teams. Min width 2% when the number is > 0.
- **Tap a row** → it opens a detail line under it (and picks the agent in the chart):
  `11 runs · 140 turns · 1.2M new + 2.9M re-read tokens · 6 tasks · 4 calls · 2 chats · last asked 2h ago`.
  Tap again (or the chart's ✕) to close. One row open at a time. `aria-expanded` on the row button.
- Working right now → the bot's pose is `work` instead of `idle` and a tiny live dot sits on the number.
- Agents on the team with **nothing in the range** stay listed at the bottom, faded to 55%, number "—". (That's
  the "not asked" story; hiding them would hide the problem.)
- **Retired agent** (deleted): ghost bot, "A retired agent", still counted.

### 6. Kind of work
Unchanged from today's sheet, under the list. It follows the range; it always shows **time** (kinds are about
time). When an agent is picked it filters to them too, titled `Blair's kind of work`.

## States
All shown in `states.html`.
1. **Loading** — the title, the range, three cards with grey bars where numbers go (no spinner), "Reading the
   clock…" hint. The chart area keeps its height so nothing jumps.
2. **Error** — "Couldn't read how the team works: {reason}" + **Try again** (as today), focus on the button.
3. **Empty office** — no work ever: one bot-less line, "No work yet. This fills in once the crew starts." Range,
   cards, chart and list hide. Agents on the team are not listed (nothing to compare).
4. **Quiet range** — work exists, but none in the range: cards show `0` / `—` with `vs last week` trends,
   chart shows stubs, one line "Nobody worked on {office} in the last 7 days." + a text button **See all time**.
5. **Normal** — as the layout.
6. **Live** — `● 2 working` pill (the clock's `Pill tone="live"`), today's bar outlined, working agents in
   `work` pose with a live dot; numbers re-read every 30 s.
7. **Agent picked** — chart in the agent's hue, their row open, the ✕ chip, "Kind of work" filtered.
8. **One agent** — no grouping, no share bars (100% says nothing), no "Carrying the load" flag; the trends and
   chart still show.
9. **Narrow (≤ 640 px)** — the sheet is full width; cards stay in one row but shrink (number 22 px, trend
   line drops "vs last week" → `↑ 24%`, the full words stay in its name); chart 72 px; rows drop the role
   text (it's in the detail line). The preview also shows a retired agent (ghost bot) here.
10. **Tokens not known** — older runs (before tokens were saved) or crew calls without a token count:
    they count as 0 and, if any are in the range, the Tokens card adds a small `*` with the title "Some
    early work wasn't measured in tokens." No apology banner.

## Motion
- Switching measure or range: bars grow from the floor (`scaleY 0 → 1`, 240 ms `--ease-spring`, 12 ms stagger
  left → right); share bars slide to their new width (200 ms `--ease-out`); numbers swap with a 120 ms fade.
- Picking an agent: bars recolour in place (160 ms colour transition), no regrow.
- The live bar breathes (opacity 1 → .8 → 1, 2.4 s) — the only loop on the sheet.
- Reduced motion: no grow, slide, breathe; everything swaps at once.

## Copy rules
- Tokens: `920`, `12k`, `840k`, `4.1M` (one decimal under 10M). The word "tokens" only on the card label and in
  tooltips/detail lines.
- Time: the clock's `worked()` (`6h 20m`, `45m`, `under a minute`).
- Agents are "they" in every sentence the studio writes.
- Never "efficiency", "score", "rank", "cost", "$".

## Voice path
- "How's the team doing?" / "Who's busiest?" / "Show me performance" → opens the sheet on the office in view
  (7 days, Agent time).
- "How many tokens did Blair use this month?" → opens the sheet, 30 days, Tokens, Blair picked; the director's
  chat also answers it in one line.
- "Where's the bottleneck?" → opens the sheet scrolled to **Worth a look**; the director reads the flags aloud.

## Accessibility checklist
- Range and measure are real radiogroups with names ("Range", "Measure"); the chart is a `role="img"` with a
  summary name ("Agent time per day, last 7 days: most on Friday, 2h 40m") and focusable bars for detail.
- Every number has a text equivalent (no meaning only in bar length or colour); trend arrows have words
  (`aria-label="up 24% from last week"`).
- Agent hues are never the only label: the name is always next to the bar or dot.
- Contrast: ink on white panel, sun pill with ink text (`#241a44` on `#ffc24b`) — existing AA pairs. Share bars
  in mint / rose / sun are decorative (the number carries the value).
- Focus: 3 px sun ring, as everywhere.

## Data the view needs (for whoever builds it)
One read per office and range, so the sheet stays one request:
- per day (or week): time ms, tokens, requests — total and per agent;
- per agent in the range: time, runs, turns, tokens (new / re-read), requests (tasks / calls / chats), last asked,
  runs that stopped early, queued wait; and the same three totals for the previous range (for trends);
- team membership (teams, captains, the director) for grouping, and who is working now.
The existing work clock already has time, runs, turns and `live`; runs already store tokens. **Requests from
calls** and **queued wait** come from the comms log / call queue — if wait isn't recorded yet, the
"Work waited" flag simply never shows until it is.
