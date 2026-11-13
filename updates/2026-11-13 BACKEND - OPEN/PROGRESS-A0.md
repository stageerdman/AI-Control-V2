# PROGRESS — A0 App shell ✅

Resume notes for the `app/` builder (Tauri 2 + React + Vite + Tailwind v4). See `app/README.md`.

## Done
- [x] Scaffold: `app/package.json`, Vite/TS/Biome config, `src-tauri/` (Cargo.toml, tauri.conf.json,
      capabilities), icon set generated from `app/assets/icon.svg` (`npm run icons`).
- [x] Backend launcher (`src-tauri/src/backend.rs`): reuse-or-spawn, /health poll (30 s), process-group
      kill on exit, watchdog for hard app death. 4 cargo tests.
- [x] Tailwind theme (`src/styles.css` @theme = prototype palette) + Button, Card, StatusDot.
- [x] Home screen (`src/App.tsx`) + health client (`src/lib/health.ts`, 6 vitest tests).
- [x] Verified: tauri dev window up (pid + 1100×720 window seen in CGWindowList), server spawned in its
      own group and healthy; app SIGTERM → whole group gone; bundled .app quit → server gone; reuse of
      a manually started server → left running on quit. `tauri build` → AI Studio.app 9.9 MiB.
- [x] README, update v1 status line, wiki lessons.

## Notes for the next phase
- `screencapture` is blocked in agent shells (no Screen Recording permission); UI screenshots were
  rendered with headless Chrome + mocked `__TAURI_INTERNALS__` against the live Vite server.
- Server has no CORS → front-end can't `fetch` it directly yet (see wiki).
- Release build points at the repo's `server/` via `CARGO_MANIFEST_DIR` (dev-machine only);
  packaging the server as a sidecar binary is future work.
