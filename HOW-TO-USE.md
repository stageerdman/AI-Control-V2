# How to use AI Studio

AI Studio is a desktop app. You describe what you want, and a studio of robot agents builds it in a real
git project on your Mac. The agents run on your Claude Code subscription, using the `claude` CLI; no API key is needed.

## Start it

- **Open the app:** `~/.cargo-shared-target/release/bundle/macos/AI Studio.app`. Drag it to `/Applications` if you like.
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
- **Setup** — Rivet, the technician, prepares the folder: git, `.project`, `CLAUDE.md`, `.gitignore`.
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
- **Access** — the safe behind the director: which keys this project can reach. Values are never shown.
- **Blueprint** — the global rule modules that build each project's `CLAUDE.md`.

## Good to know

- **Building is local only.** Agents commit locally and never push or create GitHub remotes. The studio does the merging.
- **Example projects:** four apps built overnight are in the sandbox, ready to adopt:
  - `f3-habit-hatch`
  - `f3-bookmark-box`
  - `f3-recipe-scaler`
  - `f3-todo-cli`
- **Limits:**
  - Agents check their work with tests and scripted requests, not by looking at a real browser.
  - Shell commands with an environment prefix (`PORT=… npm start`) are refused; agents work around it.
- **More detail:** see `server/README.md`, and the progress notes in `updates/2026-11-13 APP UI - OPEN/`.
