# Ready to Test — wiki

- **Links are `localhost`, never `127.0.0.1`.** Passkeys (WebAuthn) and OAuth redirects
  are bound to the host name. A `127.0.0.1` link opens the site but breaks sign-in.
  `toLocalhost` (app-runner.ts) rewrites every printed address; the Start link is
  always built as `http://localhost:<PORT>/`.
- **Only answer once it answers.** Start waits until the app's port accepts a
  connection (checking 127.0.0.1 and ::1), so the browser never opens on an
  error page. If the app ignores PORT, the address it printed is used. If it exits
  first, the reply is a 409 with its last log lines. If it is still building after
  90 s, it keeps running and the reply says to press Start again.
- **Desktop = Tauri config, Package.swift or .xcodeproj.** Start opens the newest
  build. It does not rebuild: building is the team's job, and the user tests what
  was built. A `run:` line like `npm run app` (rebuild + open) is left to "Run the app".
- **Tauri bundles share one folder.** Every project builds into
  `~/.cargo-shared-target/{release,debug}/bundle/macos/`, so the bundle is matched by
  `productName`. "Newest" means the newest `Contents/Info.plist`, which every
  build rewrites.
- **The button (phase 2) is one control, four words.** Start → Starting… → (after
  8 s) Still building… → Opened (desktop) or the "Open app" link (website). If it
  can't, it reads Try again and a note shows the server's own sentence plus the last
  8 lines. No separate status chip, no settings — Stop and the run command stay on
  the health card's App row, where the people who need them already look.
- **The link opens through `openExternal`.** In the desktop window a `_blank` link
  does nothing, and in a browser a pop-up opened after a long wait can be blocked —
  so once the site runs, the button itself becomes the "Open app" link: one more tap
  always works.
- **Live check of the button:** start a scratch studio
  (`AI_STUDIO_HOME=<scratch> PORT=<spare> npm --prefix server start`), then in `app/`
  `AI_STUDIO_LIVE_API=http://127.0.0.1:<spare> npx vitest run src/features/office/start.live.test.tsx`.
  The test page sits at `http://localhost:1420/` so the studio's CORS lets it in.
- **Live check:** `npm run check:start` (in `server/`) runs a throwaway studio on the
  real `~/dev`. Erdman Knowledge must answer at `http://localhost:3980/` and MagicCut
  must open.
