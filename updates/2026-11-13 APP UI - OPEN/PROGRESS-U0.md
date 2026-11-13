# PROGRESS — U0 Front-end foundation ✅

Resume notes for the `app/src/` foundation builder. See `app/src/README.md`.

## Done
- [x] Characters port (`app/src/characters/`): hero-svg.ts + emblem-svg.ts = prototype JS typed; hero.css/emblem.css verbatim.
      Parity: `scripts/characters-golden.mjs` runs the PROTOTYPE's JS in happy-dom → 823 golden hashes; `parity.test.ts`
      replays them through the port — byte-identical (heroes, all poses/facings/sizes/looks, setPose/setFacing ops, emblems, pips).
- [x] `<Hero>` / `<Emblem>` / `<CaptainPip>` React components (in-place pose/facing changes, imperative ref).
- [x] design/ (theme.css tokens = one source; prototype.css = base.css primitives), no Tailwind preflight (prototype relies on browser defaults).
- [x] api/ (client + ApiError, studio endpoints, types, query cache, SSE hook), shell/ (router, layout, gate, placeholders), ui/ primitives, #gallery.
- [x] Visual check vs the prototype gallery (headless Chrome, same viewport, reduced motion): poses/facings/sizes/looks/emblems 0 px diff;
      roster 15 px, zoom 6 px (antialiasing); extras differs only in the randomLook() cell.

## Lessons
- Tailwind v4 scans TS for class names: the robot's `<rect class="h-screen">` got Tailwind's `h-screen` (100vh) → giant dark rect.
  Fix: `@source not "./characters"` + guard.css pins the rect to 34 units.
- macOS FS is case-insensitive: `Emblem.tsx` vs `emblem.ts` collide → generators are `*-svg.ts`.

- [x] Tests: 60 vitest (parity 823 cases, hero/emblem snapshots + in-place pose/facing/ref, router round-trips, ApiError
      mapping, SSE resume/reconnect/backoff/dedupe with a mock EventSource, query cache + mutation, Sheet/Toast/ErrorState,
      health gate). typecheck + biome clean; `cargo check` ok.
- [x] Live: Vite :1420 against a fake-runner server (:4329, scratch home): gate → shell; in-page `studio.*` list/get,
      ApiError 404/422 from the real server, `openEventStream` received a published `progress` event live (CORS ok).
      Shots: `shots/u0-*.png` (shell, gate error, gallery poses/extras/emblems, pixel diff vs prototype = 0).
- [x] `app/src/README.md` (folders, add a page, Hero/Emblem/API/SSE usage, gotchas).

## Notes for feature builders
- Register pages in `src/pages.tsx` (one line); build in `src/features/<name>/`; port prototype screen CSS beside it.
- U1's new endpoints (features, threads, office, reports, asks inbox) aren't in `api/studio.ts`/`types.ts` yet — add them
  there with the screen that first needs them (+ their event types to `EVENT_TYPES`).
- The cast zoom card (`.zoom`) is Cast-specific (cast.css) — U3 ports it; `ui/Sheet` is the generic dialog.
