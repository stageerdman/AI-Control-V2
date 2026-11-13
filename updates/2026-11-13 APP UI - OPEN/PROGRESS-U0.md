# PROGRESS — U0 Front-end foundation

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

## Next
- Tests for api/router/sse/query/hero snapshots, README, cargo check, shell screenshots.
