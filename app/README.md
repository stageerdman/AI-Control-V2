# AI Studio — desktop app

Tauri 2 shell + React/TypeScript/Vite + Tailwind v4. On launch it starts (or reuses) the local
backend in `../server`, waits for `/health`, and shows the studio status.

```sh
npm install              # once (also run `npm install` in ../server)
npm run dev              # tauri dev: Vite on :1420 + the native window
npm run build            # release .app → ~/.cargo-shared-target/release/bundle/macos/
npm test                 # vitest (health client / status logic)
npm run typecheck && npm run lint
cd src-tauri && cargo test   # launcher unit tests
npm run icons            # regenerate icons from assets/icon.svg
```

**Backend lifecycle** (`src-tauri/src/backend.rs`): if something already answers
`GET http://127.0.0.1:$PORT/health` (default 4319) it is reused and left running on quit.
Otherwise the app runs `npm --prefix ../server run dev` in its own process group, polls `/health`
(30 s timeout, early fail if the child exits; log in `~/.ai-studio/logs/app-server.log`), and kills
the group on quit. A shell watchdog in that group also stops the server if the app dies hard.
Overrides: `PORT`, `AI_STUDIO_SERVER_DIR`, `AI_STUDIO_HOME`.

Rust builds go to the shared `~/.cargo-shared-target` — there is no local `target/`.
