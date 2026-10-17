# Disney/Pixar v2 — UX spec: GLOBAL / MANAGEMENT surfaces

Cluster owner: Global/Management. Covers three screens that live **above** any
single project: **Projects home** (the first screen), **Access** (global key
cabinet + per-project grants), and **Blueprint** (default setup + principles +
per-project freshness). Built on the existing `disney-pixar.html` soul: warm
Pixar palette, cast-member SVGs, rounded cards, confetti/toast, reduced-motion
support. This is a design spec, not the prototype.

---

## 0. Where this cluster sits

Top-bar nav (reuse the existing pill `nav.stages`) carries three global stages:

> **Projects** · **Access** · **Blueprint**

Opening a project card hands off to the project-workspace cluster (not ours).
The three global screens are peers; **Projects** is home/default.

**Soul, stated once:** projects are *productions on the studio lot*. "On set
today" (active) vs "the back lot" (archive). Access is *the key cabinet*.
Blueprint is *the starter kit every new production is born from* — a model sheet.
Personality lives in language, one host mascot, and small celebrations — never
in the data rows, which stay plain and legible.

### Reuse from the existing prototype (don't re-invent)
- CSS vars: `--sun/--coral/--teal/--sky/--grape/--mint/--rose`, `--cream`,
  `--ink/--ink-soft`, `--panel`, `--r-lg/md/sm`, `--shadow*`.
- Components: `.panel`, `.btn`/`.btn-hero`/`.btn-ghost`, `.pill` (+`.live/.idle`),
  `.switch` toggle, `.keytag`, `.vault`/`.cred`, `cast()` SVG, `fireConfetti()`,
  `toast()`, `.sky-motes`, `prefers-reduced-motion` block.
- One font stack (`--font`); one or two weights per level. No new type families.

---

## 1. SCREEN A — PROJECTS HOME (first screen)

**Job:** every project at a glance, instantly scannable, one obvious way in.

### Information architecture (top → bottom)
1. **Header band** — brand (left), big **global search** (center), **New
   project** hero button (right). Optional small host mascot (a `cast` face)
   tucked by the brand; decorative only.
2. **"On set today"** — the *Working on* group. A prominent shelf of larger,
   living cards for active projects. Warm, front-of-house.
3. **"The back lot"** — the *Database* group. A calmer, denser grid of all
   saved projects (including the active ones' archived siblings and drafts).
4. **Empty/zero states** and a live result count.

Two groups are **visually separated** by: a section label with count, a thin
hairline divider, different card size/energy (active = bigger + live pulse;
database = compact + calm), and a cream-vs-muted background wash per shelf.

### Primary action
**New project** (single hero button, top-right). The expected repeated action —
opening a project — is a full-card click; it needs no button.

### Components & states

**`search-bar`** (one, global)
- Big rounded input, leading magnifier glyph, placeholder "Search projects…".
- Focus via click or **`/`** shortcut; `Esc` clears.
- Filters BOTH groups live (match name + one-line note). Shows result count in
  an `aria-live="polite"` region ("3 on set · 4 in the back lot").
- States: empty (placeholder), typing (live filter), no-match (friendly empty
  state: "No production by that name — start a new one?" + New project button).

**`project-card` — active variant (On set today)**
- Fixed elements (always visible, in this order):
  - **Logo tile** (56–64px rounded square, the project's *uploaded* icon) — the
    star of recognition. Big, top-left.
  - **Name** (h3) + **status pill**: `Live` (teal dot pulse) / `Needs input`
    (coral, if any agent/orchestrator is waiting — mirrors the project's
    input-request notification).
  - **Progress**: slim overall progress bar (reuse `.progress`) + `%`.
  - **Mini-cast**: up to 4 agent faces currently working (reuse the overlapped
    `.mini-cast` `cast` SVGs) + "+N" chip if more. Gives life, capped so it
    never crowds.
  - **Micro-badges row**: GitHub (connected ✓ / not) and visibility
    (Private 🔒 / Public). Tiny, monochrome, text-labelled.
  - One-line note ("Rebuilding checkout + voice search").
- States: default, hover (lift `translateY(-4px)`), focus-visible (grape ring),
  `needs-input` (coral left border + pill), live (teal accent).

**`project-card` — database variant (The back lot)**
- Compact: logo tile (40px) + name + last-touched ("edited 6d ago") + a quiet
  tag (`Archived` / `Draft` / `Idle`). No progress bar, no mini-cast.
- States: default, hover, focus-visible. A `Draft` tag reads "not launched yet".

**`logo-tile`** (shared component; simulate "uploaded" logos)
- Rounded square, a project-specific gradient background + a simple white glyph
  (monogram or icon). Decorative gradient is `aria-hidden`; the project **name**
  carries the accessible identity. Each project gets a distinct tile so the eye
  finds it before reading.

### Simplest flows
- **Open:** click card → project workspace. *(1 step)*
- **Find:** `/` → type → pick. *(≤3)*
- **New:** New project → name + drop a logo image → Create → opens the new
  project workspace with the blueprint already scaffolded. *(1 short modal)*

### Sample data (drop-in)
**On set today (active):**
- **Aurora Storefront** — coral→sun gradient tile, shopping-bag glyph. Live ·
  4 agents · 62% · GitHub ✓ · Private · "Rebuilding checkout + voice search".
- **Atlas Analytics** — navy tile, constellation/axis glyph. Live · 3 agents ·
  48% · GitHub ✓ · Private · "Nightly data pipeline & dashboards".
- **Lumi Health** — mint tile, leaf-heart glyph. Needs input · 2 agents · 30% ·
  GitHub ✓ · Private · "QA is waiting on a test account".

**The back lot (database):**
- **Muse Docs AI** — grape tile, quill glyph. Draft · edited 2d ago.
- **Orchard CRM** — amber tile, tree glyph. Idle · edited 9d ago · Public.
- **Pebble Notes** — sky tile, stacked-pebbles glyph. Archived · edited 3w ago.
- **Nimbus Deploy** — slate tile, cloud glyph. Idle · edited 5w ago.
- **Fern CMS** — green tile, fern glyph. Archived · edited 2mo ago · Public.
- **Tycho Telemetry** — violet tile, satellite glyph. Archived · edited 3mo ago.

---

## 2. SCREEN B — ACCESS (global cabinet + per-project grants)

**Model (make it honest and visible):**
`Global catalog of access entries` → each **project toggles** which entries it
may use → agents draw only from their project's grants, **none by default**.
Secret values are **always masked**, everywhere, including when editing.

An **access entry** = masked **API key** + **what it serves** (one line) +
optional **docs link** + optional **extra instructions**.

### 2A. Global access — "The Key Cabinet"
Warm dark vault panel (reuse `.vault` styling).

**IA:** header ("The Key Cabinet — saved once, granted per project") + **Add
access** (primary) + the list of entry cards + a reassurance footer
("🔒 Values are masked everywhere in AI Control, including logs.").

**`access-entry-card`**
- Colored **mark chip** (reuse `.cred .ic`) + **name**.
- **Masked value**: `ghp_••••••••7Qx2` (monospace, last-4 only; never the full
  value — not in DOM, clipboard, or logs).
- **Serves**: the one-line description.
- **Used by N projects** count (links to which, on expand).
- Row affordances: **Docs ↗** (if set), **Instructions** (expand chevron),
  **Replace key**, **Edit**.
- States: default, hover, **expanded** (shows extra instructions + the project
  list), **editing**, **replace-key** (write-only input; stored value stays
  masked, you can only paste a *new* one), **new** (blank add form).

**Add / edit form fields** (one modal):
`Name` · `Key` (write-only, masked on blur, shows last-4) · `What it serves`
(required one-liner) · `Docs link` (optional) · `Extra instructions` (optional
textarea). Primary: **Save to cabinet**.

**Primary action:** **Add access**.

### 2B. Per-project access — "What this project can reach"
Lives inside a project's settings but the *concept and component* are specced
here. Shows **all** cabinet entries as rows with a **per-project on/off toggle**
(allow/deny). Default **off** — a project reaches nothing until you grant it.

**`project-access-grid`**
- Header line: honest summary — "Aurora can reach **6 of 8** capabilities.
  Agents inherit only what you grant here."
- One **`access-toggle-row`** per cabinet entry: mark chip + name + serves +
  masked value + **switch** (reuse `.switch`, as `role="switch"`).
  - States: **granted** (teal switch, "Granted"), **denied** (grey, "Not
    granted"), **newly-available** (small "New" dot when a cabinet entry was
    added after this project — nudges review), hover, focus-visible.
- Auto-saves on toggle; a quiet toast confirms ("🔑 Stripe granted to Aurora").
- No destructive CTA; the toggles *are* the interaction.

### Simplest flows
- **Add a key:** Add access → fill name/key/serves → Save. *(1 modal)*
- **Grant to a project:** project → Access → flip the switch. *(1 toggle)*
- **Rotate a key:** entry → Replace key → paste new → Save (never reveals old).

### Sample data (drop-in)
| Mark | Name | Serves | Masked | Docs | Instructions | Used by |
|---|---|---|---|---|---|---|
| GH (grape) | GitHub | Clone, commit, push, open PRs | `ghp_••••7Qx2` | ✓ | "Use the ai-control bot account; never force-push `main`." | 4 |
| AI (teal) | OpenAI | LLM calls for agents & clarifier | `sk-••••a91` | ✓ | — | 5 |
| ✳ (sun) | Anthropic | Claude models for orchestrator + agents | `sk-ant-••••9f` | ✓ | — | 5 |
| S (sky) | Stripe | Payments: checkout, refunds | `sk_live_••••42` | ✓ | "Test key only outside production." | 1 |
| Fi (coral) | Figma | Read design files & export assets | `figd_••••cz` | ✓ | — | 2 |
| DB (sun-deep) | Postgres | Primary app database | `postgres://••••` | — | "Read-replica for analytics agents." | 2 |
| ▲ (rose) | Vercel | Deploy previews & production | `••••rllm` | ✓ | — | 2 |
| @ (mint) | Resend | Transactional email | `re_••••8k` | ✓ | — | 0 |

**Aurora project grants (example toggle state):** GitHub ✅, OpenAI ✅,
Anthropic ✅, Stripe ✅, Figma ✅, Vercel ✅, Postgres ❌, Resend ❌ → "6 of 8".

---

## 3. SCREEN C — BLUEPRINT (default setup + principles + freshness)

**Job:** see and adjust what every new project is born with, see the principles
projects follow, and see per-project whether those principles are up to date.

Hosted by a small **mascot** ("the Quartermaster" — a `cast` face in the
header) for warmth; content stays plain. Two tabs/sections on one screen:
**Starter Kit** and **Principles**.

### 3A. Starter Kit — default files & folder structure
**IA:** intro line ("Every new project is born from this kit") + an **editable
folder tree** where each file/folder carries an **editable description**.

**`blueprint-tree`** (nested list, `role="tree"`)
- Each node: folder/file glyph + path + inline **description** (click to edit).
- Node affordances: edit description, rename, add child, remove. MD files get a
  richer multi-line description field (satisfies "adjust the MD file
  descriptions").
- States: default, hover, **editing-description** (labelled input), **adding
  node**, folder collapsed/expanded.
- **Primary action:** inline edit (auto-save) — no separate submit; a toast
  confirms ("Blueprint updated").

**Sample default tree (drop-in, matches CLAUDE.md scaffold):**
```
my-project/
├─ .project            Project marker — modules used, secrets, generated flag
├─ CLAUDE.md           Compiled rulebook, built from the global modules
├─ .gitignore          Always covers .env
├─ .env                This project's secrets — never committed
├─ issues.txt          Running list of known issues & TODOs
├─ updates/            One folder per update
│  └─ 2026-10-17 NAME - OPEN/
│     ├─ update v1.md   The version plan — goal, phased roadmap, live status
│     └─ wiki.md        Durable decisions & lessons this update taught
└─ src/                Source — per-ecosystem layout
```

### 3B. Principles — what projects follow + per-project freshness
`CLAUDE.md` is compiled from global modules (Structure, Coding, UX, Workflow);
"up to date" = a project's compiled rulebook still matches the current modules.

**`principle-card`** (grid, grouped by module)
- Module tag (Structure / Coding / UX / Workflow / Project) + short statement.
- Read-mostly here; editing a module is a deeper flow (out of cluster) but link
  "Edit module".

**`project-freshness-list`** — the payoff component
- One row per project: logo tile + name + **status**:
  - **Up to date** (mint check + "rebuilt 2d ago").
  - **Needs rebuild** (coral + reason: "UX module changed since last compile").
- Status is **icon + text**, never color alone.
- Row action: **Rebuild** (runs `rebuild-claude-md`) → small confetti + toast
  ("✨ Lumi Health is back in sync"). Header offers **Rebuild all outdated**.
- **Primary action:** **Rebuild outdated** (the one button that resolves drift).

**Sample principles (drop-in):**
- *Structure* — "Modular by default: any piece understandable & fixable in
  isolation."
- *Coding* — "Keep it minimal — build only what's truly needed."
- *Coding* — "Test what matters; lock each phase with tests."
- *UX* — "Cut everything unnecessary — does this earn its place?"
- *UX* — "Minimal visual system: one or two fonts, a small deliberate scale."
- *Workflow* — "Commit AND push after every change."
- *Workflow* — "Act as an orchestrator — decompose, fan out, synthesize."
- *Project* — "Voice-first." · "Show programs, not terminals." · "Secrets are
  first-class and always masked."

**Sample freshness (drop-in):**
- Aurora Storefront — Up to date (rebuilt 2d ago)
- Atlas Analytics — Up to date (rebuilt 5d ago)
- Lumi Health — **Needs rebuild** — UX module changed since last compile
- Muse Docs AI — **Needs rebuild** — 3 principles drifted
- Orchard CRM — Up to date (rebuilt 3w ago)

---

## 4. Disney soul, expressed (without crowding signal)

- **Language & framing:** "On set today / The back lot", "The Key Cabinet",
  "born from this starter kit", "the Quartermaster". Warmth in the labels, not
  the data rows.
- **Living faces, capped:** mini-cast on active project cards (≤4 + "+N"); one
  host mascot per utility screen. Faces are small and peripheral; they never
  sit between the user and a number.
- **Honest masking framed kindly:** "You see where a key goes — never the key
  itself." The vault aesthetic signals safety.
- **Small, earned celebrations:** new project logo "pops" in; rebuilding a
  drifted project fires light confetti + toast. No celebration for routine
  toggles beyond a quiet confirm.
- **Calm by default:** database shelf and principle cards are muted and dense;
  energy is reserved for the active shelf and the one primary action per screen.

---

## 5. Accessibility notes (cluster-specific)

- **Masked secrets:** value shown as `••••last4`; accessible name conveys
  "GitHub token, hidden, ends in 7Qx2". The real value never enters the DOM,
  clipboard, or any log. Replace-key inputs are write-only.
- **Toggles:** `<button role="switch" aria-checked>` labelled by the access
  name; fully keyboard operable; state is text ("Granted"/"Not granted") not
  color alone.
- **Search:** labelled input; `/` shortcut *and* a visible affordance; result
  count in `aria-live="polite"`; `Esc` clears.
- **Project cards:** real links/buttons with visible focus ring (grape); logo
  gradient `aria-hidden`, name carries identity; "Needs input" conveyed by icon
  + text + border, not color alone.
- **Freshness status:** icon + text pairing (check / alert), never hue only.
- **Blueprint tree:** `role="tree"`/nested list semantics; editable
  descriptions are labelled fields; add/remove reachable by keyboard.
- **Contrast:** dark ink on cream ≥ 4.5:1; cream text on the dark vault verified
  ≥ 4.5:1; pills/tags checked at their small sizes.
- **Motion:** honor `prefers-reduced-motion` — disable mote drift, logo spin,
  live pulses, and confetti; keep all state changes instant and legible.

---

## 6. Buildability
One self-contained HTML file. All three screens are static scenes toggled by the
existing pill nav; all state is in-memory JS objects (projects, access entries,
blueprint tree, principles, freshness). Logos are inline SVG gradient tiles.
Reuse every component listed in §0. New components to add: `search-bar`,
`project-card` (two variants), `logo-tile`, `access-entry-card`,
`project-access-grid` + `access-toggle-row`, `blueprint-tree`, `principle-card`,
`project-freshness-list`.
