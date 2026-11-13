# Disney v3 — SYNTHESIS (master build contract)

Read with: `BRIEF.md`, `user-feedback-v3.md` (ground truth), `spec-cast.md`
(CANONICAL character system), `spec-teams.md` (CANONICAL emblems + squad zoom),
`spec-office.md` (CANONICAL workspace). Base code: `../disney-v2/ai-control-disney-v2.html`.
Where a spec and this file disagree, **this file wins**.

## 1. Seam resolutions

1. **One `hero()` with the union of options.** spec-cast §1.6 plus:
   - `role` — render gear for an override role without mutating the agent (team-only roles).
   - `armband: <hex>` — captain armband drawn *on* the arm at md/xl; at xs/sm the
     captain is a star pip over the head (`captainPip`). `captain:true` + team hue ⇒ both handled inside `hero()`.
   - `holding: 'mug'|'envelope'|'paper'|'binder'|'pen'|'none'` — swappable held item (office R6).
   - Extra poses: `thinking`, `frustrated`, `waiting`, `pressing`, `waving`, `salute`
     (office R2–R5, R9; teams §7.2). Total pose list = spec-cast's 11 + these 6.
   - Numeric `size` (px), `dir:'left'` = mirror, `seated` anchors at hip (already in spec-cast).
   - `setFacing()` is THE turn transition (head first, 250ms) — office R10.
   - Every pose has an explicit reduced-motion static frame (R11).
   - `hero()` exposes a head anchor (CSS var / data attr) for overlays ("!", Zz, pip).
2. **One save model: auto-save.** Agent zoom and squad zoom behave identically:
   edits apply immediately with a quiet "Saved ✓" pip; destructive actions (remove
   member, delete line) get an Undo toast. **Drop** spec-cast §3.5's dirty bar /
   Save / Discard. Create mode: the record is created on first valid name; Back with an
   empty name discards the draft silently.
3. **One role list** — spec-cast `ROLES` + `ROLE_GEAR`. Teams' per-team role overrides
   the agent's role on that team only (data: `members[].role`).
4. **Data shapes:** `AGENTS` per spec-cast §4; `TEAMS` per spec-teams §3 (4 teams);
   `WS` per spec-office §7. The Aurora office cast = Pixel (director) + Ship-It Squad +
   Polish Patrol + Querious solo (as in v2). Engine Room / Expedition exist in the
   library only.
5. **Captains in the office** wear the armband/pip; pod pennants show `emblem(team)`.
6. **Navigation unchanged:** Projects · Cast · Access · Blueprint. Cast = Agents / Teams
   tabs. The v2 Factory designer screens are **removed** — hero zoom (create mode) and
   squad zoom (draft) replace them. Opening Aurora → **The Office** (replaces v2 workspace).
7. Emblems are original designs — homage, never real insignia (spec-teams §5).

## 2. Build architecture (modular → one file)

The deliverable stays ONE self-contained `ai-control-disney-v3.html`, but the
source is split into isolated modules and **assembled by a build script**:

```
disney-v3/
  build.py                      # concatenates src → ai-control-disney-v3.html (stdlib only)
  ai-control-disney-v3.html     # GENERATED — never hand-edit
  src/
    shell.html                  # skeleton with /*@CSS*/ and /*@JS*/ markers
    manifest.txt                # ordered list of css/js files to inline
    css/  base.css  hero.css  emblem.css  studio.css  cast.css  office.css
    js/   core.js        # palette, shade, escapeHtml, toast, confetti, announce, router go()
          hero.js        # character system v3 (spec-cast §1 + seam 1)
          emblem.js      # emblem library + emblem() + captainPip (spec-teams §5)
          data-studio.js # PROJECTS, CREDENTIALS, BLUEPRINT, PRINCIPLES, FRESHNESS
          data-cast.js   # AGENTS, TEAMS, ROLES
          data-office.js # WS, THEME_OFFICE, SIM_SCRIPT
          studio.js      # Projects / Access / Blueprint scenes (ported from v2)
          cast.js        # roster lineup + hero zoom
          teams.js       # roll call + squad zoom
          office-*.js    # theme art, engine, panel(chat), board(whiteboard+dossier)
          app.js         # boot, nav wiring, hash routes
```

Module rule: each module exposes a small set of functions on purpose (plain
globals with a module prefix are fine — no bundler) and only reads others'
documented interfaces. A dev route `#gallery` renders every role × pose × facing ×
size and every emblem × hue for visual verification.

## 3. Build phases

- **F — Foundation (one builder):** build.py + shell + manifest; port v2 into the
  modules (Projects/Access/Blueprint unchanged in behaviour); new data shapes;
  `hero.js` + `emblem.js` complete; `#gallery`. Cast and workspace may be stubs.
  Gate: build → open headless → no console errors; gallery screenshots reviewed.
- **C — Cast + Teams (builder, parallel with O):** owns `cast.js`, `teams.js`,
  `cast.css`, may edit `data-cast.js`.
- **O — The Office (builder, parallel with C):** owns `office-*.js`, `office.css`,
  `data-office.js`.
- **I — Integrate (orchestrator):** full click-through in a browser, fixes, user review.

Builders touch only their own files; a needed change to a shared module
(`core.js`, `hero.js`, `emblem.js`, `app.js`) is kept minimal and noted in the
commit message. Commit only your own paths (`git add <paths>`), `git pull --rebase`
before `git push`.

## 4. Verification (every phase)

`python3 build.py` then headless Chrome:
`"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --window-size=1440,900 --screenshot=<out>.png "file://<abs path>/ai-control-disney-v3.html#<route>"`
(and `--enable-logging=stderr --v=0` / `--dump-dom` to catch JS errors). Look at the
screenshots yourself (Read the PNG) — judge legibility and polish, not just "renders".
Screenshots go in `disney-v3/shots/` (gitignored is fine: not needed in repo).

## 5. Non-negotiables (carried from v2)
Single self-contained HTML, no external resources, never an Artifact. Secrets
masked. Access project-held. One-press voice in chat (simulated). Keyboard +
screen-reader equivalents, focus rings, `prefers-reduced-motion`, never state by
colour/motion alone. Few primitives: one font stack, the 7-hue palette, a small
spacing scale.
