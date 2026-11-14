# G2 — UX spec: Access, GitHub publishing, Ports

Status: written 2026-11-14 for G3. The server shapes come from the Decisions in `update v1.md`. The G1 builder
fixes exact field names in `PROGRESS-G1.md`; where this spec names a field, read it as intent, not as an API contract.

Ground rules for all three surfaces (from the user's feedback v3–v6):
- **No new chrome.** No new top-nav tab, no new office object, and no banners. Each surface lives inside a place
  that already exists: the Key Cabinet page, the safe behind the director, the health board, and the Projects page.
- **Reuse the primitives.** Use `Sheet`, `Field`, `TextArea`, `Switch`, `Button`, `Chip`/`Pill`,
  `Loading`/`ErrorState`/`EmptyState`, and `toast`. Introduce no new colours: "new" uses the pager's coral
  dot, OK uses `ob-ok`, and a failure uses the existing amber/`ob-bad` tone, never a red banner.
- **Calm failure.** A failure is one plain sentence where the thing lives, with a single next step. Never a modal
  and never a stack trace.
- **Secrets are write-only.** No secret value ever appears in React state, the DOM, a toast, or a log. The
  uncontrolled-input pattern from `AccessForm.tsx` carries over to every secret field. The only representation is
  `••••last4`.
- **Voice path.** Every action can be asked of the director in words ("give Tip Splitter the Stripe access",
  "publish this to GitHub", "which ports is Atlas using?"). For anything that grants, publishes (outside setup),
  or goes public,
  the director **opens the right surface with the request filled in**, and the user's press is what commits it.
  The director never presses for the user.

---

## 1. Add new access

An **access** is one named service ("Stripe", "Postgres prod") holding one or more **fields**. Each field has a
label, an env var, a secret flag, and a value. Projects are granted a whole access, never single fields.

### 1a. The Key Cabinet page (`#access`)

**Layout.** This is the same page and the same `SceneHead` and `.vault` panel as today (u5-access.png). Only the
copy and the row content change.

```
THE KEY CABINET
Saved once — granted per project                 [Import from .env]  [＋ Add new access]
An access is everything one service needs — keys, a username, a URL.
Agents hold nothing by default; a project grants it, and secrets stay masked everywhere.

┌ 🔐 Accesses ─────────────────────────────────────────────────────────────┐
│ You see where an access goes — never its secrets.                        │
│ ┌──────────────────────────────────────────────────────────────────────┐ │
│ │ [S]  Stripe                                                          │ │
│ │      Payments: checkout, refunds                                     │ │
│ │      3 fields · Used by 2 projects      Docs ↗  Details ▾  Edit      │ │
│ └──────────────────────────────────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────────────────────────────────┐ │
│ │ [DB] Postgres prod                                                   │ │
│ │      Main database                                                   │ │
│ │      4 fields · 1 without a value · Used by 1 project  Details ▾ Edit│ │
│ └──────────────────────────────────────────────────────────────────────┘ │
│ 🔒 Secrets are masked everywhere in AI Studio, including logs.          │
└──────────────────────────────────────────────────────────────────────────┘
```

- **Row (collapsed).** The row shows the mark (from `credLook`), **Name**, the "serves" line if there is one, and
  a meta line. The meta line is `N fields`, then `· K without a value` only when K > 0 (amber text), then
  `· Used by N projects`. Then come the affordances: `Docs ↗` (only if a docs link is set), `Details ▾`, and
  `Edit`.
  - A single-field access keeps today's look: name followed by `••••wxyz`, or the plain value if the field is not
    secret. The meta line reads just `Used by N projects`. Migrated keys therefore look exactly as they did.
- **Row (Details open).** This shows a quiet field list and then the existing prose:

  ```
  Secret key        STRIPE_SECRET_KEY        ••••wxyz
  Publishable key   STRIPE_PUBLISHABLE_KEY   pk_test_51Hx…   (not secret, shown in full on hover/focus)
  Webhook secret    STRIPE_WEBHOOK_SECRET    no value yet
  Instructions: Test keys only outside production.
  Granted to Aurora Storefront, Tip Splitter.
  Secret values never enter the screen, clipboard, or logs.
  ```
  The field list has three columns: label, env var in mono, and value. A value is `••••last4`, the plain value if
  not secret (clipped to 24 characters with `…`, full text in `title`), or `no value yet` (muted). Nothing in the
  list is clickable.
- **Removed from the row:** the per-key "Replace key" / "Add key" buttons. Replacing a value now happens in Edit,
  per field.
- **Sort order:** by name, A–Z. No filters and no search until there are more than about 20 accesses.

**Copy**

| Where | Text |
|---|---|
| Hero button | `＋ Add new access` |
| Panel title / sub | `🔐 Accesses` / `You see where an access goes — never its secrets.` |
| Footer | `🔒 Secrets are masked everywhere in AI Studio, including logs.` |
| Meta | `3 fields` · `1 without a value` · `Used by 2 projects` (singulars: `1 field`, `Used by 1 project`, `Used by no projects`) |
| Details, not granted | `No project holds it yet — grant it from a project's safe.` |
| Import toast | `🔑 2 new accesses imported · 1 refreshed — masked` / `🔑 The cabinet already matches the global .env` |

Import keeps today's behaviour: each `.env` line becomes a one-field access. No grouping guesswork happens on
import. The user can merge fields by hand in Edit.

**States**
- Loading: `Opening the cabinet…`. Error: `ErrorState` with retry, as today.
- Empty: `EmptyState` with title `The cabinet is empty`, body `Add an access, or import the keys already in your
  global .env.`, and the action `＋ Add new access`.

### 1b. The access editor (Sheet, `wide`)

This one sheet serves both create and edit. It replaces `AccessForm`'s three modes: there is no separate
"Replace key" mode, because replacing is per field inside Edit.

```
Add new access                                                     ✕
Start from   ( API key )  ( Username + password )  ( URL + token )     ← create only, until a value is typed

Name               [ Stripe                                   ]
What it serves     [ Payments: checkout, refunds              ]

Fields
  Label              Env var                  Secret   Value
  [ Secret key    ]  [ STRIPE_SECRET_KEY    ]  [🔒]    [ ••••••••••••          ]  ✕
  [ Publishable   ]  [ STRIPE_PUBLISHABLE   ]  [  ]    [ pk_test_51Hx…         ]  ✕
  ＋ Add field

Docs link          [ https://…                                ]
Instructions for agents
                   [ Test keys only outside production.       ]

[ Save access ]     🔒 Saved secrets are never shown again — you can only paste a new one.
                                                        Delete access…   ← edit only
```

**Templates: kept, as a segmented control of three.** They earn their place for one reason: they set the
labels, the env var suffixes, and the secret flags correctly in one press. Getting the secret flag wrong is the
one mistake that matters here. The control is shown only when creating, and it disappears the moment any value
is typed, so it never becomes a mode. `API key` is pre-selected, which means the default new access is one secret
field labelled `API key`. Choosing a template replaces the field rows (labels, suffixes, and flags only, never
typed values).

| Template | Fields (label → env suffix, secret?) |
|---|---|
| API key | `API key` → `_API_KEY` 🔒 |
| Username + password | `Username` → `_USERNAME` · `Password` → `_PASSWORD` 🔒 |
| URL + token | `URL` → `_URL` · `Token` → `_TOKEN` 🔒 |

Cut from templates: "Database" (just URL + username + password, reachable with `＋ Add field`), "OAuth app", and
anything service-branded. Three templates is the ceiling.

**Field rows**
- **Label.** Required, short, and human ("Secret key").
- **Env var.** Auto-suggested as `envVarFor(name + " " + label)` and shown as a placeholder until edited
  (e.g. `STRIPE_SECRET_KEY`). It is editable until the access is saved and read-only afterwards, the same rule as
  today, with the hint `Fixed once saved — it's the name agents see.` The server decides the final value. Show the
  server's validation error inline under the row: `Already used by Postgres prod` or `Letters, digits and _ only`.
- **Secret.** An icon toggle button showing 🔒 when on. It is a real `<button aria-pressed>` labelled
  `Secret: Secret key`. The default comes from the label as the user types: on if the label contains key, token,
  secret, password, pass, or pwd; off otherwise. The user can always override it, and the toggle stays visible
  so the default is honest.
- **Value.**
  - Secret field: an **uncontrolled** `type="password"` input with `autoComplete="new-password"`. On a saved field
    it is empty, with the placeholder `••••wxyz — paste to replace` or `No value yet — paste one`. Leaving it empty
    means "keep the current value".
  - Non-secret field: a normal controlled text input pre-filled with the saved value.
  - **Turning Secret off on a saved secret field** cannot reveal the value, so the value is cleared. Inline
    note under the row: `Not secret any more — paste the value again so it can be shown.` If the user saves with
    it empty, the field ends up `no value yet`.
  - Turning Secret on for a non-secret field keeps the value, which is masked from then on.
- **✕ remove.** It is `aria-label="Remove Secret key"` and is disabled when it is the only field (an access needs
  at least one). Removing a saved field takes effect on Save. If projects hold the access, a note appears under
  Save: `Removing STRIPE_WEBHOOK_SECRET — projects keep it in their .env until their next sync.`
- **`＋ Add field`** is a text button that appends an empty non-secret row and focuses its Label.

**Save**
- The button reads `Save access`, and `Saving…` while busy. When it runs, read every secret input once, clear them
  all, and only then send the request. This is the same discipline as today.
- On success, close the sheet and show the toast `🔑 Stripe saved to the cabinet`, or `🔑 Stripe saved — 1 new
  secret in, still masked` when a secret was pasted.
- On error, show one `role="alert"` line above Save (`formError`) and per-field messages under their rows. Secret
  inputs are already cleared, so the alert must say so: `Nothing was saved — paste the secrets again.`
  (only if any secret had been typed).
- Required fields are Name and at least one field with a label. A field with no value is allowed and shows as
  `no value yet` everywhere.

**Delete.** Keep today's `DeleteConfirm`, re-worded:
`Delete Stripe?` / `This removes all 3 fields from the cabinet and the global .env. It can't be restored —
keeping an undo would mean keeping the secrets.` / holders line `Still held by Aurora Storefront — their .env keeps
STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY until their next access sync.` / buttons `Delete for good` and `Keep it`.

**Keyboard and accessibility**
- The sheet is focus-trapped (as `Sheet` already does) with initial focus on the Name field (or the first template
  segment when creating). Escape closes the sheet and clears all secret inputs.
- Templates are a `role="radiogroup"` with arrow-key movement.
- The field rows are a `<fieldset>` with `<legend>Fields</legend>`. Each input has its own label (visually hidden
  per-row labels: `Label for field 2`, `Env var for Secret key`, `Value for Secret key`).
- `＋ Add field` focuses the new row's Label. Removing a row moves focus to the previous row's ✕, or to
  `＋ Add field` if no row precedes it.
- Enter in any input submits. Enter in the Instructions textarea inserts a newline, as usual.

### 1c. A project's cabinet (the safe behind the director)

**Layout.** This is the same `ProjectAccessPanel` sheet (u5-project-access.png): one row per access, each with a
grant switch. Granting a whole access is the only grant there is.

```
What Tip Splitter can reach                                              ✕
Tip Splitter can reach 2 of 5 accesses. Agents get only what you grant here.

┌──────────────────────────────────────────────────────────────────────┐
│ ● [S] Stripe                                       Granted   [●══]  │
│       Payments: checkout, refunds                                   │
│       STRIPE_SECRET_KEY ••••wxyz · STRIPE_PUBLISHABLE_KEY · …1 more │
└──────────────────────────────────────────────────────────────────────┘
│   [DB] Postgres prod                           Not granted   [══○]  │
│       DATABASE_URL · DATABASE_USER · DATABASE_PASSWORD ••••x9      │
...
[Sync to .env]  Writes the granted accesses into Tip Splitter's .env (never committed).
```

- **The field line** answers "what does an agent get" by listing the env var names in mono, separated by ` · `.
  A secret field adds its `••••last4`. A field with no value adds `(no value yet)` in muted text. After 3 names
  the line collapses to `· …N more`, a button that expands the full list inline in the same row:
  `Secret key → STRIPE_SECRET_KEY ••••wxyz`, one field per line. A one-field access shows a single name and never
  needs the expander.
- **The switch** auto-saves and is optimistic, as today. Its toasts are `🔑 Stripe granted to Tip Splitter
  (3 fields)` and `🔒 Stripe revoked from Tip Splitter`.
- **Count line:** `Tip Splitter can reach N of M accesses. Agents get only what you grant here.`
- **Sync.** The button and behaviour are unchanged, and `syncSummary` lists env var names, which already works
  per field. Empty-value fields are reported as `no value yet for STRIPE_WEBHOOK_SECRET`.

**The "new" dot**
- An access added to the cabinet since this project last opened its safe gets a small coral dot (the pager's dot,
  8 px) to the left of its mark, plus `<span class="sr-only">New since you last looked: </span>` before the name.
  New accesses sort first.
- **On the safe in the office:** the same dot sits on the safe object when the project has any unseen access.
  This is the one place it earns its place, because without it the user would never think to open the safe. The
  safe's accessible name becomes `Safe — Tip Splitter access, 2 new`.
- **When it clears:** the panel marks the accesses as seen when the sheet **opens** (one call). The dots stay
  visible until the sheet **closes**, so the user actually sees what was new. On the next open they are gone.
- No count badge, no toast, and no pager entry for new accesses. A new access is not something that "needs you".

**States**
- Loading: `Opening the safe…`. Error: `ErrorState` with retry.
- Empty cabinet: `The cabinet is empty — add one under Access.` (a link to `#access`).
- Switch failure: revert the switch and show the toast `⚠ Couldn't change Stripe — <reason>`, as today.

**Keyboard and accessibility**
- Each switch is labelled `Grant Stripe to Tip Splitter`, and its state text (`Granted` / `Not granted`) stays
  visible, so the meaning is never colour-only.
- The `…N more` expander is a `<button aria-expanded>`.
- The dot is `aria-hidden`; the sr-only prefix carries its meaning.

### 1d. Cut on purpose
- Per-field grants. Grants are per whole access, as the Decisions require. Half a Stripe is never what you want.
- Copy to clipboard or "reveal", for anything secret, anywhere.
- Field types beyond secret / not secret (no URL validation, no "email" type). The secret flag is the only
  distinction that changes behaviour.
- A separate "Replace key" sheet and per-row "Replace key" buttons. Replacing happens per field in Edit.
- Grouping on `.env` import. Guessing that `STRIPE_*` lines belong together would be wrong often enough to
  surprise the user.
- Access icons or colour pickers. The mark stays derived from the name.
- Expiry dates and rotation reminders.

---

## 2. GitHub: a repo by default, plus the public/private switch

**Changed by the user on 2026-11-14:** "repo github must be also established by default". This changes the
Decisions entry "opt-in per project". The **main path** is now that the Project Setter (Rivet) creates a
**private** repo during Setup. A manual **Publish to GitHub** stays, but only as the fallback for three cases:
setup ran without `gh`, the user skipped GitHub at setup, or the project was set up before this change. Agents
still never push; the studio does. Tests still use a stub `gh`.

After setup, everything lives in the **GitHub row of the health board** (`Health` in `office/Board.tsx`,
f2-app-port.png). That row is already the first line of the repository box. The row grows one inline area under
itself when needed, the same pattern as the App row's `Details`. There is no new sheet: the health board is
already a zoomed board, and a sheet on top of it would be a third layer.

### 2a. Setup: the default path

**The choice: one quiet line on the Name step** (`setup/NameStep.tsx`), under the name fields. The Setup step
starts working the moment it opens, so the choice has to be made before that step, not during it.

```
Project name   [ Tip Splitter                          ]
What is it?    [ a tiny web app that splits a bill      ]

⎇ GitHub · private repo                                   [●══]
```

- **The switch is on by default.** Its label is `GitHub · private repo`. When off, the line reads
  `GitHub · skipped — you can publish later from Health` (muted).
- **No visibility choice here.** A new repo is always private. Going public is a deliberate act on the health
  board (2d), with its own confirm.
- **No repo name field here.** The repo name is the folder's slug, the same slug the Name step already previews
  as the folder path. If the name is taken, see the failure row below.
- **Adopting a folder:**
  - Folder has a GitHub remote: the line reads `GitHub · keeps origin (stage/recipes)` with no switch.
  - Folder has a non-GitHub remote: the line reads `GitHub · keeps origin (gitlab.com/…)` with no switch.
  - Folder has no remote: same as a new project, the switch is on by default.
- **`gh` missing or not logged in when the Name step opens:** keep the switch on and add the muted hint
  `GitHub CLI isn't signed in — setup will finish without a repo, and you can publish later.`
  Do not block Continue and do not ask the user to fix it now.
- **The draft remembers the choice** (`github: boolean` on the draft, name per G1), so resuming a draft keeps it.
- **Accessibility:** a `Switch` labelled `Create a private GitHub repo`. The hint is tied to it with
  `aria-describedby`.

**The work: one more checklist row in Rivet's Setup step** (`SETTER_STEPS` in `setup/flow.ts`). It sits after
`First commit`, labelled `GitHub`. It uses the existing row states (doing / done / kept / skipped), so the step
needs no new UI.

| Situation | Row state | Detail text |
|---|---|---|
| Waiting | — | `a private repo` |
| Working | doing | `creating stage/tip-splitter · pushing main` |
| Done | done | `stage/tip-splitter · private` |
| Adopted with an existing remote | kept | `kept origin (stage/recipes)` |
| User switched it off | skipped | `skipped — publish later from Health` |
| `gh` missing or not logged in | skipped | `skipped — GitHub CLI not signed in · publish later from Health` |
| Name already taken on GitHub | skipped | `skipped — stage/tip-splitter already exists · publish later from Health` |
| Repo created, push failed | done | `stage/tip-splitter · private · first push didn't go through` |
| Any other GitHub error | skipped | `skipped — couldn't reach GitHub · publish later from Health` |

- **GitHub never fails the setup.** Every GitHub problem lands as `skipped`, and the step still ends with
  `All set up` and the `Call in <orchestrator> →` button. A missing repo is something to fix later, not a reason to
  stop the user here.
- The sub line on a new project changes from `The standard AI Studio scaffold, nothing more.` to
  `The standard AI Studio scaffold and a private GitHub repo.` (or the old line when GitHub is switched off).

### 2b. Row states on the health board

Each row keeps the existing structure: `⎇  GitHub   <status text>   <action on the right>`. Since setup now
creates the repo, **Published** is the normal state, and it is listed first.

| State | Status text | Right side |
|---|---|---|
| Published, in sync | `stage/tip-splitter ↗` · `Private` [switch] · `pushed 2 min ago` | — |
| Published, pushing | … · `pushing…` | — |
| Published, nothing pushed yet | … · `not pushed yet` | — |
| Push failed | … · `last push didn't go through` (amber) | `Try again` (ghost small) |
| Repo gone (gh says not found) | `Can't see stage/tip-splitter on GitHub any more` | `Details` |
| Checking `gh` | `…` | — |
| Not on GitHub, `gh` ready | `Not on GitHub yet` | `Publish to GitHub…` (ghost `Button small`) |
| Not on GitHub, `gh` missing | `Not on GitHub yet · needs the GitHub CLI` | `Publish to GitHub…` |
| Not on GitHub, `gh` not logged in | `Not on GitHub yet · sign in to the GitHub CLI` | `Publish to GitHub…` |
| Publishing | `Publishing… creating the repo` → `Publishing… pushing main` | — |
| Has a non-GitHub remote | `Has another remote (origin) — publishing is off` | — |
| No git repo yet | `No git repository yet` | — (the Project Setter makes one) |

- **`Publish to GitHub…` is always the same button.** When `gh` isn't ready, it opens the how-to hint in place of
  the form (one line under the row):
  - CLI missing: `Install the GitHub CLI (brew install gh), then sign in with gh auth login in Terminal.`
  - Not logged in: `Run gh auth login in Terminal, then come back.`
  Each hint has a `Check again` button. When the check passes, the hint is replaced by the publish form (2c), so
  the user moves straight on without pressing Publish twice. The commands are in `<code>`, which is selectable
  and not clickable. AI Studio never runs `gh auth` itself.
- **Repo link.** `owner/name ↗` opens the GitHub page in the browser (via `shell/external.ts`).
- **Time ago** uses the same `ago()` helper as "Checked just now". Live-update it with the board's existing
  refresh; no new timers.

### 2c. Manual publish: the fallback (inline, two presses)

This is for projects that came out of setup without a repo, and for projects set up before this change. When
the user presses `Publish to GitHub…` and `gh` is ready, the row expands:

```
⎇  GitHub   Not on GitHub yet
   Name        github.com/stage/ [ tip-splitter                 ]
   Visibility  (•) Private — only you        ( ) Public — anyone can see the code
               [ Continue ]  [ Cancel ]
```

- **Name** is pre-filled with the project folder's slug. The owner prefix comes from the logged-in `gh` user. Only
  letters, digits, `-`, `_`, and `.` are allowed, validated as the user types, with the inline message
  `Use letters, numbers, - _ or . only`.
- **Visibility** is a radio group with **Private** checked by default, matching what setup does.
- Pressing `Continue` replaces the form with a single confirm sentence:

  ```
  Create github.com/stage/tip-splitter as a private repo and push main (12 commits)?
  [ Publish ]  [ Back ]
  ```
  For Public, the sentence reads `…as a public repo — anyone can see the code and its full history — and push
  main (12 commits)?` and the button reads `Publish publicly`.
- Pressing **Publish** collapses the form, and the row shows the Publishing states. On success, show the toast
  `🚀 Tip Splitter is on GitHub — private` and switch the row to Published.
- After publishing, the Projects card chip reads `GitHub · private` / `GitHub · public` (it already exists).

**Publish errors** appear as one `role="alert"` line under the row, with the form restored and values kept:
- Name taken: `You already have a repo called tip-splitter — pick another name.`
- Auth expired mid-way: `GitHub signed you out — run gh auth login, then try again.`
- Repo created but the push failed: the row moves to **Published / push failed**, because the repo exists. The
  note reads `The repo is ready but main didn't push — Try again.` The user is never asked to publish twice.
- Offline or anything else: `Couldn't reach GitHub — nothing was published.` (or the server's one-sentence message).

### 2d. The public/private switch (published only)

- This is an inline `Switch` labelled with the current word: `Private` (off) / `Public` (on). The visible text
  next to it always names the current state, so it is never icon-only. Its accessible name is
  `Public on GitHub`, with `aria-checked`.
- **Going public** expands an inline confirm under the row (the switch does not flip yet):
  `Make tip-splitter public? Anyone will see its code and full history.`
  The buttons are `Make public` and `Keep private`. Initial focus goes on **Keep private**.
- **Going private** happens at once, with no confirm. Toast: `🔒 tip-splitter is private`.
- While a change is in flight, the switch is disabled and the text reads `Making public…` / `Making private…`.
  On failure the switch reverts and one alert line appears: `GitHub didn't change it — still private.`
- **Voice:** "make it public" from the director opens this confirm. It never skips it.

### 2e. Auto-push status

- The status is shown only as the small trailing text on the row. There is no log and no list of pushes.
- **Failed push note (amber, one line under the row):** `Last push didn't go through — <server's one sentence,
  e.g. "GitHub has commits that aren't here">. Your work is safe locally.` Then `Try again`. If the same error
  comes back, the note stays and nothing escalates.
- No pager entry for a failed push. It is not blocking work, and the health board is where the user looks.
  (If G1 finds pushes failing silently for days, revisit this. It is noted here, not built.)

### 2f. Keyboard and accessibility
- Every action is a real button in DOM order: status, link, switch, then action.
- When the inline area opens, focus moves to its first input (Name) or to the confirm's safe button. When it
  closes, focus returns to the button that opened it. Escape inside the inline area acts as Cancel/Back.
- Status changes (Publishing → Published, push failed) go to a polite `aria-live` region on the row. Elapsed-time
  ticks are not announced.

### 2g. Cut on purpose
- Choosing an org or owner, repo description, topics, a license or `.gitignore` picker, and branch choice. The
  repo is published as the logged-in user's, from `main`.
- "Unpublish" or deleting the repo. That is done on GitHub, never from here.
- A manual "Push now" button while things are healthy. Pushes follow merges; `Try again` appears only after a
  failure.
- Push history, commit lists, and PR views.
- A "GitHub not connected" chip on every unpublished Projects card. **Drop that chip**: it showed on most cards
  and was noise. Show the chip only when a project is published (now the usual case: `GitHub · private`).
- At setup: a repo name field, a public option, and an "add later" nag. Setup always creates a private repo named
  after the folder, and the one switch is the only choice.
- Auto-publishing existing projects that were set up before this change. They keep `Publish to GitHub…`.
- Blocking setup on GitHub. A missing repo never stops the user from calling in the orchestrator.
- Signing in to GitHub inside AI Studio. `gh` owns auth.

---

## 3. The Ports room ("The Switchboard")

### 3a. Where it lives, and why

| Option | Verdict |
|---|---|
| A new top-nav tab "Ports" | **No.** It would be a fifth tab for something looked at maybe once a week. The user cut the top row in the office for exactly this reason. |
| A switchboard object in each office | **No.** The office is per project, and v4 feedback said "too many interactive things". Ports are studio-wide anyway. |
| Only per project, in the health board | **Necessary, but not enough.** It can't answer "who is on 3291?" across projects. |
| **A studio-level sheet opened from the Projects page's count line, plus one line in each project's App row** | **Chosen.** It adds zero new buttons and zero new tabs. The count line already summarises the lot, so `· Ports` is a quiet text link there. |

The Ports room is **mostly read-only**. The studio allocates the ports, and the user only watches.

### 3b. Entry points
1. **Projects page count line:** `7 on set · 6 in the back lot · Ports`. `Ports` is a text button styled like the
   count (not a chip, not a pill), and it opens **The Switchboard** sheet.
2. **Health board → App row → Details:** one new line above "Run command":
   `Ports 3290–3299 · app on 3290 · 3291 also listening (node) · All ports`. `All ports` opens the same sheet
   with this project's row highlighted and scrolled into view.
3. **Voice:** "which ports is Atlas using?" makes the director answer in one line and offer `All ports`.

### 3c. The Switchboard (Sheet, `wide`)

```
The Switchboard                                                              ✕
Every project owns a block of ports. Its agents get them as PORT and
AI_STUDIO_PORTS — no one else uses them.

  Project            Block          App              Also listening
  [▢] Aurora         3100–3109      3100 · running   3101 node
  [▢] Atlas          3240–3249      3240 · stopped   —
  [▢] Tip Splitter   3290–3299      3290 · running   3291 node · 3292 python
  [▢] Hello Studio   3410–3419      3410 · stopped   —

  Outside any project                                           ← only if non-empty
  3305 · node (pid 4412) — inside the studio range, not in any block
```

- **Rows** list every project that has a folder: active first, then the back lot (muted), each sorted by name.
  Drafts are left out, because they have no block yet.
- **Project** shows the tile mark and name. Clicking the name goes to that project's office and closes the sheet.
- **Block** is mono, e.g. `3290–3299`. The block size is whatever G1 sets.
- **App** shows `3290 · running` (`ob-ok` green) or `3290 · stopped` (muted). This is the same truth as the App
  row.
- **Also listening** lists the other ports in the block with a listener, as `port process-name`, or `—`.
- **Outside any project** is a single muted group, shown only when something is listening inside the studio's
  3100–3999 range but outside every block. It is informational, so you know why a port might be busy.
- **Refresh:** read the data when the sheet opens, then quietly every 5 s while it is open. There is no "refresh"
  button and no "checked at" stamp, and updates do not animate.

**"Free this port": kept, narrowly.** It earns its place for one real case: a crashed agent run leaves a dev
server holding a port in its project's block, and then the app can't start. So it appears **only** on an
*Also listening* port inside a project's block, and **only** when the App is not the listener. It is a small
`Free` text button after the port.
- Pressing it shows an inline confirm in the row: `Stop node (pid 4412) on 3291?` with the buttons `Stop it` and
  `Leave it`. On success, show the toast `3291 is free`. On failure, show one line in the row:
  `Couldn't stop it — it may belong to another user.`
- It never appears on the app port (use Stop on the App row) or on "Outside any project" ports. AI Studio does not
  kill things it doesn't own.
- **If G1 does not expose a stop-listener endpoint, cut this entirely.** The room works without it.

**States**
- Loading: `Reading the switchboard…`
- Error: `ErrorState` with the title `Couldn't read the switchboard` and a retry.
- Empty (no project with a folder): `No project holds ports yet — each gets a block when it's set up.`
- If the listener scan fails but the allocations load: show the table with `—` in *Also listening* and one muted
  line under the table, `Couldn't see what's listening right now.`

### 3d. Keyboard and accessibility
- The table is a real `<table>` with `<caption class="sr-only">Port blocks by project</caption>` and `<th scope>`
  headers. Running/stopped is shown as text, not colour alone.
- The 5 s refresh is **not** announced (there is no live region on the table).
- When opened from `All ports`, focus moves to that project's row (the project name link) and the row gets the
  existing highlight background.
- `Free` buttons are labelled `Free port 3291 (node)`. The confirm takes focus on `Leave it`.
- The sheet is responsive: below 640 px, *Also listening* wraps under the project name, and the table never
  scrolls sideways.

### 3e. Cut on purpose
- Editing, reassigning, or reserving ports, and changing block size. Allocation is deterministic and the studio
  owns it.
- A history of who held what, per-agent port use, and graphs.
- A "free" action for the app port or for anything outside a project's block.
- A ports badge, count, or warning anywhere outside the room. A busy port shows up where it hurts: the App row's
  start failure, which can link `All ports`.
- An office "switchboard" object and a top-nav tab (see 3a).

---

## Hand-off notes for G3
- Rename the user-facing word *key* → *access* everywhere in the UI. *Key* stays in code names only where renaming
  would be churn.
- Lock in with tests:
  - Secret inputs are cleared before the request, and no secret appears in the DOM after save.
  - Turning Secret off on a saved field clears its value.
  - Templates set the secret flags correctly.
  - The "new" dot stays visible until close, then clears.
  - The setup GitHub switch is on by default, and an adopted folder with a remote shows `keeps origin`.
  - Every GitHub failure during setup lands as `skipped`, and setup still finishes.
  - Going public needs confirmation and going private does not.
  - Every GitHub row state renders its exact copy.
  - The Switchboard shows `Free` only on an in-block, non-app listener.
- Screenshots to add to `shots/`:
  - `g3-access`, `g3-access-edit`, `g3-access-template`, `g3-safe-new`
  - `g3-setup-github`, `g3-setup-github-skipped`, `g3-gh-missing`, `g3-gh-publish`, `g3-gh-confirm`, `g3-gh-published`, `g3-gh-public-confirm`,
    `g3-gh-push-failed`
  - `g3-ports`, `g3-ports-app-row`
