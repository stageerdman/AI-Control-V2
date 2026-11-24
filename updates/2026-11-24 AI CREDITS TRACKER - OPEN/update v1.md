# AI Credits Tracker — v1

## Goal
Add one thin, sparkly, multi-colour line across the top of AI Studio. It always answers three questions:
1. **How much is left** before we hit the plan limit?
2. **At our current pace, when do we hit it**, or do we reach the reset first?
3. **When does the limit reset?**

Feature: `f-ai-credits-tracker`. This file covers the research, the roadmap and (in Phase 3) the design.

## The data source (research, 2026-11-24)

### First principles
- A subscription (Pro/Max) has **no published token or credit number**. The limit is a set of rolling windows
  (5-hour, 7-day, and sometimes per-model 7-day ones). Anthropic reports each window only as **% used plus a reset
  time**. So "credits left" is really **100% minus % used**. Any absolute token "limit" we show would be made up.
- Only Anthropic knows the real % used. That's because the user's own Claude Code sessions, claude.ai chats, and
  every studio run all draw from the same windows. Counting our own tokens can never give the truth. It only
  covers the studio's share.

### What we have: the CLI already tells us, and we throw it away
Every `claude -p --output-format stream-json` run the studio starts writes a `rate_limit_event` line. The CLI writes
one whenever an API response moves the rounded utilization or a reset time. We have captured real ones on this
machine (CLI 2.1.322, `apiKeySource: none`, so a subscription), in `server/test/fixtures/live-*.jsonl` and
`.tmp-live/home/runs/*.jsonl`:

```json
{"type":"rate_limit_event","rate_limit_info":{"status":"allowed","resetsAt":1794630600,"rateLimitType":"five_hour",
 "overageStatus":"rejected","overageDisabledReason":"out_of_credits","isUsingOverage":false,
 "unifiedWindows":{"five_hour":{"utilization":0.15,"resetsAt":1794630600,"status":"allowed"},
                   "seven_day":{"utilization":0.53,"resetsAt":1794808800,"status":"allowed"}}}, ...}
```

- `unifiedWindows.<window>.utilization` is a **fraction from 0 to 1**.
- `resetsAt` is in **epoch seconds**.
- `status` is one of `allowed`, `allowed_warning` or `rejected`.
- Other window names can appear: `seven_day_opus`, `seven_day_sonnet`, `overage`.
- `server/src/runtime/stream.ts` ignores this line today. Nothing in `server/src` reads `rate_limit`.

**Decision: this is the primary source.** Why:
- It's exact, because it comes from Anthropic's own rate limiter.
- It costs nothing extra: no extra requests and no tokens.
- It's already on our pipe. Every claude process goes through `claudeCliRunner` (`server/src/runtime/claude-cli.ts`
  › `lines.on('line')`), so there's a single place to tap it.

**Caveat:** the event isn't formally documented. Every field must be treated as optional. If the shape changes, the
parser drops the reading and the line shows "no reading". It never shows a wrong number.

### Sources considered and deleted
| Source | Verdict |
|---|---|
| Status-line JSON `rate_limits` (official, documented: `used_percentage` 0–100, `resets_at` epoch s) | Same numbers, but only for *interactive* sessions with a status-line script. We'd have to install a script into the user's own Claude Code settings. That's invasive, and we already have the data. **Deleted.** |
| `GET api.anthropic.com/api/oauth/usage` (what `/usage` uses) | It would work while the studio is idle. But it's undocumented, and it means reading the user's OAuth token out of the Keychain. That breaks "never touch secret values". **Deleted.** We'll revisit only if staleness turns out to hurt in practice. |
| A tiny "probe" run (`claude -p` with Haiku) to refresh when idle | Burns a little of the very quota we measure, and adds a moving part. **Deleted from v1.** Phase 4 notes when to add it back. |
| HTTP `anthropic-ratelimit-*` headers | These are for API keys only. The CLI doesn't pass them to us. **N/A.** |
| Our own token log (`runs` + `crew_time` tokens, `runs.cost_usd`; Agent Performance) | Not the truth for a subscription (see above). **Kept** in two roles: (a) the fallback, when an account sends no `unifiedWindows` (API key, Bedrock, Vertex); (b) "who is burning it": the studio's share of the burn, per agent. |

### Staleness, honestly
The readings only arrive while a run is going. When the studio is idle, the last reading stays true until its
`resetsAt`, apart from use outside the studio. Once `resetsAt` passes, we know that window reset. Then we show
"fresh window, next reading with the next run". The line always says how old its reading is once it's more than
about 15 minutes old.

## How the numbers are worked out (pure, server-side)
These are worked out for each window `w` from the readings stored for that window, all sharing the same `resetsAt`:
- `left = 1 − u_now`.
- `start = resetsAt − length(w)`, where the length is 5 h or 7 d.
- **Burn rate.** The default is the slope over the last 60 minutes of readings, which needs at least 2 readings
  and at least 2 points of rise. If there aren't enough, use `u_now / (now − start)`, the average since the window
  opened. Utilization comes in 1% steps, so a short slope on its own would be noise.
- `hitsAt = now + left / rate`. If `hitsAt ≥ resetsAt`, the verdict is **"lasts until reset"**. Otherwise the
  verdict is **"hits limit at T"**.
- **The line shows the binding window.** That's the one with the earliest `hitsAt`, or the highest `u` if neither
  hits. It's usually the 5-hour window, but it's the weekly one when the week is nearly used up.
- `status: rejected` with `isUsingOverage: false` means **limited now, until resetsAt**. The line shows that
  outright.

## Roadmap

### Phase 1: Server: capture the readings
- `stream.ts`: add a pure `parseRateLimit(line) → LimitReading | null`, where `LimitReading` is
  `{ at, status, windows: { name, used (0–1), resetsAt (ISO) }[], overage: { using, status } }`. The parser takes
  the fields defensively: it accepts a fraction or a percent, and epoch seconds or milliseconds, and drops anything
  it doesn't recognise.
- `claudeCliRunner(opts)` gets `onLimits?(reading)`, which is called from the line handler. This keeps the
  RunEvent consumers (service, dispatch, setup-chat, creator, health) unchanged.
- New module `server/src/credits/`: `store.ts`. Migration `limit_readings(at, window, used, resets_at, status)`,
  written only when something changed. It keeps 8 days of readings, and older rows are pruned on write. The data is
  studio-wide, not per project, because there's one account.
- **Tests:**
  - Parse every real fixture line in `server/test/fixtures/live-*.jsonl`.
  - A bare event, an unknown window, percent and millisecond variants, junk and a non-limit line all return null or
    a partial result. Nothing throws.
  - Store dedupe and prune.
  - The runner calls `onLimits`, tested with a fake CLI script that prints a limit line.

### Phase 2: Server: forecast and route
- `server/src/credits/forecast.ts` (pure): readings plus `now` give a list of windows with
  `{ name, used, left, resetsAt, ratePerHour, hitsAt | null, verdict, readingAgeMs }`, plus `binding` and `state`.
  `state` is one of `ok`, `warning`, `limited`, `stale` or `none`.
- `GET /credits` returns the forecast. A `credits.changed` event goes out on the studio's existing event stream
  after each new reading, so the line moves live without polling. A plain timer re-forecasts once a minute, so
  "hits at" and "resets in" stay current while idle.
- The studio's share comes from Agent Performance spans: tokens in the binding window's span, per agent. It reuses
  `performance/spans.ts`, so no new recording is needed.
- **Tests (clock injected):**
  - A steady burn hits before reset.
  - A slow burn lasts until reset.
  - Too few readings falls back to the average since the window opened.
  - The window reset leaves "fresh, no reading".
  - Weekly is the binding window when it's nearly used up.
  - `rejected` gives `limited`, but `rejected` with overage in use doesn't.
  - No readings at all gives `none`.
  - The route's shape is locked.

### Phase 3: App: the sparkly line
**Designed (Jony, 2026-11-24). Full spec: `design/credits-line.md`.** In short:
- **The line.** A 3 px strip over the very top edge, on the studio and the office (not the gallery). It takes no
  layout space. The fill is the **binding window's share left**, from the left edge, in a drifting seven-colour
  rainbow (sky → teal → mint → sun → coral → rose → grape) with a faint shimmer every 6 s. The used part is a quiet
  track. There's no number on the line: its length is the number.
- **Calm vs warning.** `ok` is the full rainbow, slow. `warning` (runs out before reset, or ≤ 15% left, or
  `allowed_warning`): the line grows to 4 px, keeps only the warm colours (sun → coral → rose), shimmers every 2 s,
  its end breathes, and a small chip at the top-right says **"runs out ≈ 3:10 pm"**. `limited`: no fill, a
  coral-tinted track, chip **"Limit reached · back at 4:30 pm"**. It never turns red, and meaning never rides on
  colour alone.
- **Other states.** `stale` (> 15 min) and `fresh` (window reset, no reading yet) are dimmed, with no shimmer.
  `none` is the track with one slow shimmer. `estimated` (Phase 5) has a dashed fill.
- **The card** (hover after 150 ms, focus, or tap; 280 px). Title "62% left" plus the window name, a mini rainbow
  bar, "Using about 9% an hour", the verdict in one line ("Lasts until it resets at 4:30 pm" / "Runs out in ~40 min
  (≈ 3:10 pm) · resets 4:30 pm"), the other window in one row, and "Updated 3 min ago" when it's more than 2 min old.
- **Deleted from the earlier sketch:** the per-agent "studio's share" row (not a top goal; it belongs to Agent
  Performance), any settings, a refresh button, and showing every rare window.
- **Accessibility.** `role="meter"` with the plain sentence as its label. The hit area is the first tab stop
  (`button`, `aria-expanded`). The card is a non-modal dialog. One polite announcement on entering warning or
  limited. `prefers-reduced-motion` stops all motion and keeps the colours and words.
- **Build:** `app/src/features/credits/{model.ts, CreditsLine.tsx, credits.css}`, mounted once in
  `app/src/shell/Shell.tsx`. All the words come from the pure `model.ts`.
- **Tests:**
  - `model.ts`: every state, each verdict sentence, the time and "in ~X" rules, 99% never shown as 100%, and the
    binding/other-window swap.
  - Component render for `none`, `ok`, `warning` (chip shown), `limited` and reduced motion.
  - Live check: run the app, start one real run, see the line fill in. Also check the chip clears the office's
    top-right controls.

### Phase 4: Voice path, and a decision on idle refresh
- Voice/chat: Pixel, and any agent, can answer "how much credit do we have left?" from `GET /credits`. That works
  through a small read-only `credits` studio tool, or as a single line in the orchestrator's context. Pick
  whichever is fewer parts. The orchestrator can also read `limited` / `hitsAt` to stop starting big work it can't
  finish, as a hint only.
- Decision gate: if the live use in Phase 3 shows that stale readings mislead, add the deleted Haiku probe back.
  It would run at most once per 30 minutes, only while the app is open and the studio is idle, and only if the user
  turns it on. Otherwise it stays deleted.
- **Tests:** the tool or context line text for each state, and that it refuses nothing and leaks no secrets.

### Phase 5: Fallback when Anthropic gives no windows (only if needed)
- This applies when readings arrive with no `unifiedWindows`, or none ever arrive. That happens with an API key,
  Bedrock or Vertex. The `init` line shows `apiKeySource` ≠ `none`.
- The fallback: the user sets one limit in the card, either "$ per day" or "tokens per 5 hours". The line then
  works it out from our own token log (`runs` tokens and `cost_usd`, `crew_time`) over a rolling window, with the
  same forecast maths. It's labelled **"estimated: studio use only"**.
- Build this phase only if a user without subscription windows shows up. The current account sends them.
- **Tests:** estimate maths against a seeded token log, the label, and that a real reading always beats the
  estimate.

## Status
- [x] Research: data source chosen and verified against real stream lines on this machine (2026-11-24, Elon).
- [x] Design of the line and card: `design/credits-line.md` (2026-11-24, Jony).
- [x] Phase 1 · [x] Phase 2 · [x] Phase 3 · [ ] Phase 4 · [ ] Phase 5 (conditional)
- Phase 3 shipped (2026-11-24, Jony): `app/src/features/credits/` (`model.ts` pure words/looks, `api.ts`
  `useCredits` on `GET /credits/events` only — it sends on connect, so no separate GET, `CreditsLine.tsx`,
  `credits.css`). Injected into the shell like the Pager (`<Shell TopLine={CreditsLine}>`), so the shell stays
  feature-free; drawn on studio + office, not the gallery.
  - Decisions in the build: a low-but-lasting warning chip reads **"12% left · resets 4:30 pm"** (the spec's
    "runs out ≈" only fits the hits case). Screen-reader label and the announcement use words ("about 1 hour
    28 minutes"), never `~ ≈ ·`.
  - Live check: this checkout's server on a spare port with seeded readings → the real SSE frame through the
    app's model gave warning, 18% left, chip "runs out ≈ 10:54 pm", "Using about 12% an hour". Not yet seen
    by eye in the window (no screenshot tool here): the office chip-overlap check in the spec is still open.
  - A backend older than Phase 2 answers 404 on the stream: the line stays "No reading yet" and retries quietly.
- Phases 1–2 shipped (2026-11-24, Uncle Bob), all in `server/src/credits/`:
  - `reading.ts` `parseRateLimit` (lives here, not in `stream.ts`: the RunEvent parser stays about runs).
    `LimitReading = { at, windows: { name, used, resetsAt, status }[], overage }`.
  - `store.ts` (migration 57 `limit_readings`, dedupe per window, 8-day prune), `forecast.ts` (pure),
    `share.ts` (studio share from Agent Performance spans), `credits.ts` (the service: record → watchers).
  - `claudeCliRunner({ onLimits })` feeds it; main.ts shares one `credits` between the runner and the app.
  - **Live updates: `GET /credits/events`**, a dedicated SSE stream (event `credits`, data = the whole view), not
    the project event log: that log is per project, the credits are studio-wide. Sends on connect, after every
    changed reading, and once a minute. `GET /credits` returns the same view once.
  - View: `{ state, binding, windows: [{ name, used, left, resetsAt, opensAt, ratePerHour, hitsAt, verdict,
    readingAgeMs }], readingAgeMs, at, studioShare: [{ agentId, name, tokens, share }] }`. Verdicts: `limited`,
    `hits`, `lasts`, `fresh`. State order: `none` › `limited` › `warning` (runs out before reset, ≤ 15% left, or
    Anthropic's `allowed_warning`) › `stale` (newest reading > 15 min) › `ok`. Unknown windows (`overage`) are
    listed, never bind. `studioShare` stays in the API (the design keeps it off the card; Phase 4's voice path can
    use it).
