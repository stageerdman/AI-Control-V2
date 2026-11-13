# PROGRESS — U4 The Office (+ Reports space + global pager) — ✅ (FakeRunner only)

Resume notes. Spec = the prototype (`concepts/disney-v3/src/js/office-*.js`, `css/office.css`, feedback v4–v6) +
`spec-reports.md`. Code: `app/src/features/office/`, `app/src/features/reports/`, `Pager` in `pages.tsx`.

## Built
- **Scene from staffing** — `layout.ts` (prototype officeLayout + the Reports tray after the health board; the room's
  minimum width grows 1600 → 1760 so the planning wall + tray clear the Director's glass; windows drop first),
  `theme.ts` (room art ported + tray cabinet, 1–3 unread sheets with a coral tab), `engine.ts` (OE as a class:
  desks, chairs, couch, robots, "…" bubbles, "!" badge, hover card, lanes walking, carry-to-tray, GPU-layer zoom with the
  deferred `--z`/pause restyle).
- **Live state** — `state.ts` (pure): office view + open asks → each robot's activity; `agent.status` kinds map to
  the prototype's poses (reading/searching → reading, editing/tool → coding, running → testing, writing → reviewing,
  thinking/starting → planning); never reported = no session = **asleep** (couch, 3 seats, the rest nap at desks; the
  first status walks them to their desk); director idle = "Big picture"; "!" only from `ask.opened` (until answered).
  SSE from `lastEventId`; work/features/health/reports re-fetch on their events.
- **Chat panel** — director by default; click a robot → its thread (it turns to face you); threads API +
  `thread.message` merge; typing while busy; errors calm; `Open report` on messages with `reportId`; ask cards
  (options as chips, else a free answer) → `/asks/:id/answer`. **Goals:** to the director, an imperative message
  ("Build…", "Research…") or the **Start work** button → `POST /work`; the director answers in one local line
  ("On the whiteboard: … — X and Y on it."). No mic, no updates, no suggestions.
- **Wall** — whiteboard (% of the newest goal + in-progress features + tasks), health (latest grades/good/fix + GitHub
  + local repo + **Run health check**, never automatic), features folder (Now/Planned/Shipped identical rows, + New
  feature, feature page: name, status, Description/Vision text blocks, Save, Delete, unsaved-changes prompt on Esc),
  **Reports tray** → list / report (forked builder: `features/reports`, see below). Door → Projects; safe → U5's
  `ProjectAccessPanel` in a sheet; ▤ List mirror (no "Around the office"); ⤢ hide chat; keyboard (arrows/Home/End roving,
  `!` jumps to whoever needs you, Esc one layer back); narrow screens = chat drawer.
- **Reports** — list (unread bold + dot, Archived (n)), reading page (markdown subset, sanitised), mark read, archive +
  Undo, "Ask <author> a follow-up" → the author's chat with an `About: <title>` context; studio `#reports[/pid/rid]`;
  delivery walk on `report.filed`.
- **Pager** — global, bottom-left; polls `GET /asks?unseen=true` every 5 s; one page per office; the office you're in
  never pages you; leaving an office → `POST /asks/seen` → it drops off until a NEW ask; hidden in setup + zoomed boards.
- Server (tiny, free runner only): `AI_STUDIO_FAKE_PACE_MS` paces fake steps; a task saying "ask me" asks first.

## Tests
`layout.test.ts` (2/6/12/20 + splits/solo/windows), `state.test.ts` (status → activity, sleepers wake, asks → "!",
thread merge, wall facts, goal intent), `pager-logic.test.ts` (grouping, lines, fresh page, leaving = seen, hidden),
reports tests (helpers, markdown incl. XSS + intraword `_`, list/view). App: 153 tests, server 249; typecheck + biome clean.

## Real check (headless Chrome, fake runner, temp home/sandbox/control, :4461 + Vite :1460 proxy)
Project via API (draft → plan Ship-It + The Expedition (reporter) + Baron → accept → finish). Office loaded with the
team (shot `u4-office`); "Build the checkout page" → robots woke and switched reading → coding → done, whiteboard tasks
(`u4-working`, `u4-goal-chat`, `u4-board`); "Research payment providers…" → Professor carried the report to the tray
(`u4-deliver`), tray `Reports · 1 new` (`u4-tray-unread`) → list → report (`u4-reports`, `u4-report`) → follow-up chat
with the Professor (`u4-followup`, `u4-agent-chat`); director chat (`u4-director-chat`); features add/edit/status
(`u4-feature`, `u4-features`); health check run (`u4-health`); safe (`u4-safe`); "ask me" goal → "!" + hover card +
ask card answered (`u4-bang`, `u4-hover`, `u4-ask-card`); door → #projects; ask raised while on Projects → pager
(`u4-pager`) → click → that office (`u4-pager-office`) → left without answering → "All quiet"; `u4-studio-reports`, `u4-office-820`.

## Gaps / notes
- Goal lines the director "says" after Start work are local (not in the server thread) — they vanish on reload (the
  whiteboard keeps the goal).
- Follow-up context is a text prefix on the message ("About the report “…”: …"), shown as a label; the report body is
  not injected into the run (no server support).
- Overall % = the newest goal's progress (no project target like "v1.0" in the data).
- Health: no GitHub visibility toggle (no API) — status only; "runs locally" line replaced by the local repo facts.
- Seed projects with status "needs" but no real ask don't page (pager is asks-only, honest).
- Live (paid) run not done.
