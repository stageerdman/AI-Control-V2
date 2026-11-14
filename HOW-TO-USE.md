# How to use AI Studio

AI Studio is a desktop app. You describe what you want, and a studio of robot agents builds it in a real
git project on your Mac. The agents run on your Claude Code subscription, using the `claude` CLI; no API key is needed.

## Start it

- **Open the app:** **Applications → AI Studio** (`/Applications/AI Studio.app`). After a rebuild (`npm run build` in `app/`),
  copy the fresh `~/.cargo-shared-target/release/bundle/macos/AI Studio.app` over it. It always runs this repo's `server/`.
- **Backend:** the app starts its backend from this repo's `server/` folder on port 4319. If a backend is already
  running on your data, the app reuses it. If the backend crashes, the app restarts it.
  - Logs: `~/.ai-studio/logs/`
  - Data: `~/.ai-studio/`
- **Projects:** they live only in `~/dev/AI-Studio-Sandbox/`.
- **Needs:** Node, with `npm install` done once in `server/`, and the `claude` CLI logged in.
- **Free practice mode:** start the backend with `AI_STUDIO_RUNNER=fake` to try the whole flow without using your plan.

## Make a project

**Projects → New** walks you through **Start · Name · Orchestrator · Setup · Team**.
- **Start** — begin from scratch or *Adopt* an existing folder in the sandbox. Adopting never changes your files on its own.
- **Orchestrator** — pick the director. Directors see the big picture only.
- **Name** — the **GitHub · private repo** switch is on by default: setup creates a private repo named after the folder and
  pushes `main`. Switch it off to stay local. An adopted folder that already has a remote keeps it ("keeps origin").
- **Setup** — Rivet, the technician, prepares the folder: git, `.project`, `CLAUDE.md`, `.gitignore`, the first commit, and
  the GitHub repo. A GitHub problem (no `gh`, not signed in) never stops setup; publish later from the health board.
  Unfinished setups wait as "In setup" cards. Deleting one never deletes the folder.
- **Team** — the director proposes teams and specialists and how they'll work: who reviews whom, and send-back rules. You can change any of it.

## Get work done (the office)

1. **Ask the director.** Chat in plain words, for example "Build a habit tracker with a weekly view".
2. **Press Start work.** The director's plan becomes a goal on the **whiteboard**.
3. **The team works.** Captains split team work among their members. Each piece is built in its own checkout,
   reviewed at the gates, sent back if needed, and merged into `main`. You see it as the robots walking papers between desks.
4. **Answer questions.** If an agent needs you, the **pager** tells you which office is asking.
5. **See what shipped.** When everything has merged, the feature moves to **Shipped** in the features folder.
6. **Run the app.** Open the **health board** and press Start; each project gets its own port in 3100–3999.
   Then press **Open app ↗**. The run command comes from the `run:` line in `.project`, and you can edit it there.
7. **Read reports.** Reporters file reports in the office **filing cabinet**. All of them are also on the studio-wide **Reports** page.

Other places:
- **Cast** — agents and teams: looks, roles, prompts, "Job on this team", and reporter and own-tools switches.
- **Access** — the Key Cabinet. **＋ Add new access** saves everything one service needs as one access: several fields
  (keys, a username, a URL), each with its env var and a secret switch. Templates: *API key*, *Username + password*,
  *URL + token*. Edit an access to replace one field's value; secrets are never shown again, only `••••last4`.
  The **safe** behind the director grants whole accesses to that project; a coral dot marks accesses added since you
  last opened it. Granted agents get every field in their environment.
- **Ports** — the **Ports** link on the Projects count line opens the Switchboard: each project's block of 5 ports,
  its app port, and what is listening. The health board's App → Details shows the same line for one project.
- **Blueprint** — the global rule modules that build each project's `CLAUDE.md`. **Rebuild** on an outdated project
  recompiles it and keeps its own "Project-specific rules". The Starter Kit tab has the studio-wide switch
  **A private GitHub repo** (turn it off and new projects stay local by default).

## Good to know

- **GitHub:** agents never push; the studio does. After each merge to `main`, a published project is pushed
  automatically. The health board's GitHub row shows the repo link, a **Private / Public** switch (going public asks
  first) and the last push, with **Try again** if it failed. Projects that aren't on GitHub get **Publish to GitHub…**;
  it needs the GitHub CLI signed in (`brew install gh`, then `gh auth login`).
- **Example projects:** four apps built overnight are in the sandbox, ready to adopt:
  - `f3-habit-hatch`
  - `f3-bookmark-box`
  - `f3-recipe-scaler`
  - `f3-todo-cli`
- **Limits:**
  - Agents check their work with tests and scripted requests, not by looking at a real browser.
- **Ports for agents:** every agent run gets its own free port as `PORT` (plus the project's spares in
  `AI_STUDIO_PORTS`), so agents can run setting-prefixed commands such as `PORT=3331 npm start`. Literal values only;
  `$(…)`, pipes and `;` are refused.
- **More detail:** see `server/README.md`, and the progress notes in `updates/2026-11-13 APP UI - OPEN/` and `updates/2026-11-14 ACCESS & GITHUB - OPEN/`.
