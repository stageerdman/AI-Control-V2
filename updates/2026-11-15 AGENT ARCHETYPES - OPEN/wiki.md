# AGENT ARCHETYPES — wiki

- **Capture the vibe, never the signature.** Every famous archetype has one signature item
  (a beam sword, a scar, a turtleneck). Leave that item out and push a fresh one instead
  (a crystal staff, a star hat, an eraser).
- **Tall antennas clash with tall hats.** Pair crowns, crests and caps with short antennas
  (`bob`, `bun`, `none`), or the antenna ball floats over the hat.
- **Headgear draws over the screen face.** A hood must cut a hole around the screen
  (an evenodd path with an inner hole at about y −21 and x ±27).
- **Previewing parts without node_modules:** Node 25 strips TS types, and
  `spike/ts-resolve.mjs` adds the missing `.ts` extensions. `spike/render.mjs` monkey-patches
  `ROLE_GEAR`/`HATS`/`TOOLS` and writes HTML. `spike/shoot.mjs` takes a screenshot with headless Chrome.
