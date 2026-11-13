# PROGRESS — U5 Access + Blueprint ✅

Spec = prototype `concepts/disney-v3/src/js/studio.js` (renderAccess / openAccessForm / openProjectAccess /
renderBlueprint) + `css/studio.css`, `disney-v2/spec-global.md` §2–3. Shots: `shots/u5-*.png` vs
`concepts/disney-v3/shots/s-access.png`, `s-blueprint.png`.

## Built
- **`app/src/features/access/`** — `#access`, the Key Cabinet on the real `/credentials` API.
  - Rows: mark chip (derived from the name: GitHub GH, OpenAI AI, Anthropic ✳ … else initials + a stable hue),
    name, env var (hidden when it equals the name), `••••last4` or "no key yet", serves, Docs ↗, Details
    (instructions, env var, which projects hold it, masked tail), Replace key / Add key, Edit, Used by N projects.
  - Add / Edit / Replace in one sheet. **The key field is uncontrolled**: read once on submit, cleared before the
    request goes out, never in React state, the DOM as text, a toast or an error message; closing unmounts it.
    Add has an optional env var (placeholder previews the server's name rule; fixed once saved). Edit can paste a
    new key too. Replace disables the metadata (prototype).
  - Delete (from Edit): confirm says it **can't be restored** and lists the projects whose `.env` still holds it
    until their next sync; the toast repeats that list from the DELETE response.
  - "Import from .env" → `POST /credentials/import`, toast "N new keys imported · M entries refreshed — masked".
- **`ProjectAccessPanel`** (`features/access`, exported from `features/access/index.ts`) — **for U4's office safe**:
  ```tsx
  import { ProjectAccessPanel } from '../access';
  <Sheet open={open} onClose={close} label={`${project.name} access`}>
    <ProjectAccessPanel projectId={project.id} projectName={project.name} />
  </Sheet>
  ```
  Every cabinet entry as a `.toggle-row` + switch (optimistic, auto-saves via `PUT …/access`, rolls back on error,
  toast "🔑 Stripe granted to Aurora"), "X can reach **n of m**", "Sync to .env" → one line of env var NAMES only
  ("Wrote STRIPE, GITHUB · no value yet for RESEND."). Query key `credentials:project:<id>` — any cabinet change
  (`invalidate('credentials')`) refreshes it too.
- **`app/src/features/blueprint/`** — `#blueprint`, Starter Kit / Principles tabs + the Quartermaster.
  - Starter Kit: the Setter's real scaffold (`GET /blueprint` tree) under `my-project/`, `updates/` showing the
    first update it opens (`<today> INIT - OPEN/` → `update v1.md`, `wiki.md`). Read-only.
  - Principles: the four modules (tag, description, **Read** → the full module text in a sheet, rendered with
    U4's sanitised markdown `features/reports/markdown.tsx`) + one principle card per `## section` (first sentence).
    Says where to edit: "Read-only here. The source is `~/.ai-control/modules` — edit the module files there".
  - Per-project freshness (each project with a folder, not archived → `GET /projects/:id/scaffold`):
    "✓ Up to date · CLAUDE.md compiled on Nov 13, 2026" / "⚠ Needs rebuild — Structure, Workflow changed since
    Sep 25, 2026" / "⚠ Missing issues.txt" / "⚠ Folder not found on disk". Icon + text, never colour alone.
- **Server (small, U5-owned):** `GET /blueprint` modules now carry `body` (the markdown) + `updatedAt` (file mtime);
  `GET /projects/:id/scaffold` carries `claudeMdGenerated` (from `.project`, regular file only). Tests + README.

## Verified
- vitest: access 11 (mapping, summaries, **UI leak tests**: add → the value is sent once, the field is empty before
  the request resolves, the list shows `••••abcd` and the secret is nowhere in `outerHTML`/input values; replace
  incl. a failed save; Escape discards a typed key; delete confirm + holders; details; panel toggle + sync),
  blueprint 5 (kit tree, principles, freshness states, page render + module sheet). App 148/148, server 243/243,
  typecheck + biome clean.
- Live (FakeRunner server, TEMP `AI_STUDIO_HOME` / `AI_STUDIO_SANDBOX` / `AI_CONTROL_HOME` with a `cp -p` of the
  modules dir only — real `~/.ai-control/.env` never touched), production build, headless Chrome over CDP:
  import from the temp .env → `••••7Qx2`; add Stripe → `••••wxyz`; replace → `••••q9r8`; delete GitHub; after each
  step a scan of the whole DOM + input values found no secret; server + vite logs contain no secret. Blueprint shows
  the real module texts from the temp copy; 3 projects (fresh / stale by back-dated `.project` / missing
  `issues.txt`). Panel (harness page, not committed): 3 grants, sync wrote STRIPE + GITHUB to a 0600 `.env`.

## Gaps / deviations (honest)
- **No "Rebuild" buttons** in freshness (prototype has Rebuild / Rebuild outdated): there's no rebuild endpoint —
  the row says "Rebuild with the `rebuild-claude-md` routine" instead. A `POST /projects/:id/claude-md/rebuild`
  would let us restore the buttons (+ confetti).
- **Starter-kit descriptions are read-only** (prototype: click to edit): the tree is code (`SCAFFOLD_TREE`). Same
  for module text — edit in `~/.ai-control/modules`.
- No `src/` node in the kit tree: the Setter doesn't create one (prototype showed it).
- Masks are `••••last4` without the provider prefix (`ghp_`, `sk-`): the server never stores a prefix. Keys
  shorter than 12 chars show `••••` only (server rule).
- "New" dot for entries added after a project (spec 2B) not built — no created-vs-granted signal yet.
- Freshness compares the module file's mtime (local day) with `claude_md_generated`; a same-day edit counts as
  up to date.
- `.logo-tile` CSS duplicated into blueprint.css (3 rules) because projects.css loads only with that page; the
  component is U2's `features/projects/LogoTile`.
