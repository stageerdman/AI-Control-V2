# Spec — Reports (APP UI, U1 backend + U4 office + studio route)

Ground truth: `user-request.md` — *"reports or paperwork somewhere… I see the reports from AI, the recent
ones… if I ask for some research, it arrives there… nice, very simple, human readable… only specific teams
or roles create reports."* Taste: v4–v6 feedback (no noise, super clean). Siblings: the features folder,
whiteboard and health board zoom cards (`office-board.js`). Reports is **one more paper object**, not a new app.

## 0. Rules
1. **Paper, not a feed.** A report is a finished document someone hands you. No chat-like stream, no
   notifications centre, no counters on the scene.
2. **One quiet signal.** A new report = a sheet in the tray. Nothing pops, toasts, or pages you.
3. **Read like a letter.** One column, generous measure, prose first. Metadata is one line.
4. **Two actions, max.** *Ask a follow-up* and *Archive*. Everything else earns its place or stays out.

## 1. Where it lives

### 1.1 In the office — the Reports tray
A short **filing cabinet with a wooden letter tray on top**, standing on the floor against the back wall,
to the **right of the health board, ≥ 56 px gap**, before the windows. Floor-standing (not wall-hung) so it
reads as furniture, not a fourth board on the planning wall. Label plate on the drawer: `REPORTS`.

```
 back wall ─────────────────────────────────────────────────────────────────────────────
  ┌door┐ ⏲   📮 🚀    ┌FEAT┐ ┌──────── WHITEBOARD ────────┐ ┌HEALTH┐     ┌▭▭▭┐  ┌win┐ │glass corner
  │    │    out dep   │    │ │  64%   ▬▬▬   ☐ ☐ ☐         │ │ A  B │     │▭▭▭│← tray│  safe · plaque
  │    │              └────┘ └────────────────────────────┘ │ C    │   ┌─┴───┴─┐    │
  │    │                                                    └──────┘   │REPORTS│    │
 floor ────────────────────────────────────────────────────────────────┴───────┴──────
```
- Layout (`office-layout.js`): `objects.reports = { x: health.x + 116 + 56, y: 236, w: 92, h: 150,
  stand: {x: +46, y: 424}, label: 'Reports' }`; the window loop starts after it. In a narrow room
  (size2) windows drop first — the tray always fits.
- It is the **4th interactive wall object** (folder · whiteboard · health · reports), plus door and safe.
  Same hover lift + focus ring as the health board. Hover tag (only on hover/focus): `Reports` or
  `Reports · 2 new`.

### 1.2 How a new report is signalled
- **Delivery is real work, so it animates once:** when `report.filed` arrives, the author robot stands,
  walks the back lane to the tray, drops a sheet, walks back (≈ 4 s; uses the existing carrying pose).
- **Unread = paper in the tray.** 0 unread: empty tray. 1–3+: 1–3 sheets stacked (caps at 3), the top one
  with a small **coral tab** sticking out. That is the whole signal. No "!" (that stays for asks only),
  no badge number on the scene, no chat "office update", no pager entry (pager = *needs you*; reports don't).
- **Exception — you asked for it.** If the report answers a request made in a chat thread, the reply in
  *that* thread is one line: *"Scout filed it — Payment providers compared."* with an inline `Open report`
  link. Only the thread that asked; never elsewhere.

### 1.3 Studio-wide — `#reports`
- Entry: a **paper-tray icon button** in the Projects home header, right of search (label "Reports",
  icon + word, a 6 px coral dot when any project has unread). Nav stays 4 items; pager stays for asks.
- `#reports` is a plain scene (no office): the same list component, newest first, across all projects;
  each row gains the project name. Opening a row opens the report page in place (§3); the meta line's
  project name links to that office.

## 2. The Reports list (zoom card, sibling of Features)
Route `#reports` inside the office sub-routes (`OB_OBJ.reports = 'reports'`), card width 600 px like
the folder. Camera zooms to the tray, scene scrim, card fades in.

```
 ┌───────────────────────────────────────────────────────┐
 │ ← Office                                              │
 │ Reports                                               │
 │                                                       │
 │ ● Payment providers compared              2 h ago   › │
 │   🤖 Scout · ◆ Research Crew                           │
 │   Stripe wins on fees under 10k/mo; Adyen if we go EU.│
 │ ───────────────────────────────────────────────────── │
 │   Checkout accessibility review           Yesterday › │
 │   🤖 Lint · ◆ Ship-It                                  │
 │   3 blockers on the card form; everything else passes.│
 │ ───────────────────────────────────────────────────── │
 │   …                                                   │
 │                                         Archived (4)  │
 └───────────────────────────────────────────────────────┘
```
- Row = one button: **title** (16/600; 700 + coral dot when unread), **when** right-aligned (relative:
  "2 h ago", "Yesterday", then "12 Nov"), author line (xs robot portrait + name · team emblem `xs` +
  team name; no team → name only), **summary** clamped to 1 line (ink-soft). Chevron like features rows.
  Newest first, no grouping; unread is shown, not sorted to the top.
- **No filters, no search, no kind tabs.** A project has a handful of reports a week; revisit when a real
  list passes ~30. `kind` is shown only on the report page.
- Footer link `Archived (n)` (only if n > 0) swaps the list to archived rows, header `← Reports`.
- Studio `#reports`: identical rows, author line becomes `🤖 Scout · ◆ Research Crew · Aurora Storefront`.

## 3. A report page — `#report/<id>`
Card widens to **720 px** (reading width), same scrim. Marked read when opened.

```
 ┌──────────────────────────────────────────────────────────────┐
 │ ← Reports                                                    │
 │                                                              │
 │ Payment providers compared                                   │
 │ 🤖 Scout · ◆ Research Crew · Research · Today 14:05           │
 │ ❝ Which payment provider should the storefront use? ❞        │
 │                                                              │
 │ Stripe wins on fees and setup time under 10k orders a month. │
 │ Adyen only pays off if we launch in the EU this year.        │
 │ ──────────────────────────────────────────────────────────── │
 │ ## What we compared                                          │
 │ Fees, payout speed, EU coverage, SDK quality…                │
 │  • Stripe — 1.5% + 25c, payouts in 2 days                    │
 │  • Adyen — interchange++, needs volume                       │
 │ ## Recommendation                                            │
 │ …                                                            │
 │ Sources                                                      │
 │  1. Stripe pricing ↗   2. Adyen pricing ↗   3. src/pay.ts    │
 │ ──────────────────────────────────────────────────────────── │
 │                         [ Archive ]  [ Ask Scout a follow-up ]│
 └──────────────────────────────────────────────────────────────┘
```
- Order: title (h2, 26/800) → meta line (one line, 13/700 ink-soft) → **question** (only if present;
  15/600, in a soft left-ruled quote) → **summary** as the lead (18/600, ink) → hairline →
  **body** → **Sources** (numbered; web links open in the system browser with ↗; file paths as mono text,
  not links) → footer actions.
- **Ask a follow-up** (hero button): opens the office chat panel on the **author**, thread primed with a
  context chip `About: Payment providers compared` (the body goes into the run's context, not the chat).
  On `#reports` (studio) it first opens that project's office. Author deleted → button reads
  `Ask <orchestrator>`. **Archive** (ghost): back to the list, toast `Archived · Undo`. Archived reports
  show `Unarchive` instead. No delete, no share, no mark-unread, no edit.

**Typography for long reading** (same system font; no second face):
- Body 17 px / 1.6, measure **≤ 68ch**, ink `#241a44` on white; paragraphs 0.9 em apart.
- Headings: `#`/`##` → 20/800, `###` → 16/800; 1.6 em above, 0.5 em below. Never uppercase in prose.
- Lists indented 1.25 em, 0.35 em between items; `**bold**` 700; inline code mono 0.92 em on a soft tint.
- Code blocks: mono 14/1.5, horizontal scroll inside the block only. Tables: hairline rows, no zebra.
- Markdown subset rendered **sanitised** (no raw HTML, no images in v1). The card scrolls; the back
  button and footer stay sticky.

## 4. Data & filing (backend, U1)

### 4.1 Shape — table `reports` (new migration)
```ts
Report {
  id: string                       // 'rep_…'
  projectId: string
  kind: 'research' | 'review' | 'status' | 'other'
  title: string                    // 4–80 chars, plain text
  summary: string                  // 1–2 sentences, ≤ 280 chars, plain text — the list line + lead
  body: string                     // markdown, ≤ 40 000 chars
  question: string | null          // what it answers, in the asker's words (≤ 200)
  sources: { title: string; url?: string; path?: string }[]   // ≤ 20; url http(s) only; path project-relative
  author: { agentId: string; name: string; teamId: string | null; teamName: string | null } // snapshot: survives deletes/renames
  runId: string | null             // provenance: the run that filed it
  goalId: string | null            // + itemId: the whiteboard item it closes, if any
  itemId: string | null
  threadId: string | null          // the chat thread that asked (drives §1.2's one reply)
  createdAt: string                // ISO
  readAt: string | null
  archivedAt: string | null
}
```
UI renders live agent/team look by id when they exist, else the snapshot name with a neutral robot.

### 4.2 Who can file
- New boolean **`reporter`** on **roles** and **teams** (`PATCH /roles/:id {reporter}`, `/teams/:id`).
  A run may file iff its agent's role is a reporter **or** it runs for a reporter team (`teamId`).
- Cast UI: one switch per role/team, "Files reports". Orchestrators, Project Setter and Agent Creator never
  file (big picture / crew). Health checks stay on the health board — not duplicated into Reports.

### 4.3 `file_report` — the MCP tool
- Served by the same per-run MCP server as `ask_user`, **registered only for qualifying runs** (others
  never see it). Input: `{title, summary, body, kind, question?, sources?}` (strict zod, limits above).
- The server stamps `projectId`, `author` (from the run), `runId`, `goalId/itemId/threadId` (from the run's
  origin), `createdAt`. Returns `{id}`. Max **2 reports per run** (3rd → tool error "one report per
  question — update the brief instead").
- Emits `report.filed {reportId, projectId, authorAgentId, title}` — never the body (events stay small).
  `report.read` / `report.archived` too, so a second window stays in sync.
- Endpoints: `GET /projects/:id/reports[?archived=1]` → `{reports (no body), unread}` ·
  `GET /projects/:id/reports/:rid` (full) · `PATCH /projects/:id/reports/:rid {read?, archived?}` ·
  `GET /reports?limit=50` studio-wide newest first + `unread` total (Projects header dot).

### 4.4 When the orchestrator routes to a reporter
- In the `dispatch` contract, items gain `report?: true`. The orchestrator sets it when the goal asks for
  **knowledge, not change**: research, compare, investigate, audit/review, "find out", "write up",
  "what's the status of…". The item goes to a reporter-capable captain/specialist; its brief ends with
  *"Answer with file_report; question: <the user's words>."* The item is done when the report is filed
  (whiteboard task links to it).
- Mixed goals ("research X, then build it") → a report item first, build items after (existing order rule).
- No reporter staffed → the orchestrator says so in chat in one line and offers to add one (Agent Creator);
  it never writes the report itself.

## 5. States, access, motion
| State | Office card / `#reports` |
|---|---|
| Empty, reporter staffed | "No reports yet. Ask for research — *'Compare payment providers'* — and it lands here." |
| Empty, no reporter | "Nobody on this project files reports yet. Turn on **Files reports** for a role or team in Cast." (link) |
| Loading | 3 static placeholder rows (no shimmer); report page: title + 4 grey lines |
| Error | "Couldn't load reports." `Try again` — the scene behind stays usable; Esc still closes |
| Gone (404 / deleted project) | "This report isn't here any more." `← Reports` |

- **Keyboard:** tray is in the office tab order (folder → whiteboard → health → reports → safe); Enter
  opens; Esc = one layer back (page → list → office); Tab trapped in the card like siblings; rows are
  buttons in DOM order. Report page: focus lands on the title (`tabindex=-1`) so reading starts there.
- **Screen reader:** card `role="dialog"` `aria-label="Reports"`; row label
  "Unread. Payment providers compared, by Scout, Research Crew, 2 hours ago. Stripe wins on fees…";
  page is real headings (`h2` title, body `h3`+), question as `blockquote`, sources as `ol`. A new report
  is announced once, politely: "New report from Scout: Payment providers compared." Unread dot is
  never colour-only (bold title + "Unread" in the label).
- **Reduced motion:** no delivery walk — the sheet just appears in the tray; card opens without zoom
  (sibling behaviour); no hover lift.
- **Voice:** "Any new reports?" → orchestrator lists unread titles in one line · "Open the payment one"
  → opens it · "Read me the summary" → speaks summary · "Archive it" · "Ask Scout why Adyen" → follow-up
  thread. All go through the existing chat → UI command path.
