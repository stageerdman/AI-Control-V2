# PROGRESS — A0 App shell

Resume notes for the `app/` builder (Tauri 2 + React + Vite + Tailwind v4).

## Done
- [x] Scaffold: `app/package.json`, Vite/TS/Biome config, `src-tauri/` (Cargo.toml, tauri.conf.json,
      capabilities), icon set generated from `app/assets/icon.svg` (`npm run icons`).
- [x] Backend launcher (`src-tauri/src/backend.rs`): reuse-or-spawn, /health poll, group kill on exit.
- [ ] Tailwind theme + primitives (Button, Card, StatusDot)
- [ ] Home screen + health client tests
- [ ] Real launch verified (screenshot), child gone after quit
- [ ] README, update v1 status line, wiki lessons

## Notes
- `cargo check` / `cargo test` in `app/src-tauri` use the shared target (no local `target/`).
