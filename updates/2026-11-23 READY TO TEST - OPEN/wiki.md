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
- **Live check:** `npm run check:start` (in `server/`) runs a throwaway studio on the
  real `~/dev`. Erdman Knowledge must answer at `http://localhost:3980/` and MagicCut
  must open.
