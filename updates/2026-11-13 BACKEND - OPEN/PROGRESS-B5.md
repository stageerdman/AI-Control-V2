# PROGRESS — B5 Agent runtime (headless Claude Code CLI)

Resume notes. Plan: `update v1.md`; lessons: `wiki.md`; API: `server/README.md`.

## Done (24 new tests → 175 total)
- `src/runtime/runner.ts` — `Runner` seam (`start(spec, {emit, ask}) → {done, cancel}`), `unavailableRunner`.
- `src/runtime/fake.ts` — scripted FakeRunner (activity/tokens/text/ask/wait/fail/result).
- `src/runtime/claude-cli.ts` — `claude -p --output-format stream-json --input-format stream-json
  --verbose --model … --append-system-prompt … --restricted --tools Read,Edit,Write,Glob,Grep,Bash
  --allowed-tools <list> --permission-mode dontAsk --permission-prompts none --strict-mcp-config
  --mcp-config <only ours> --disable-slash-commands --no-chrome --max-budget-usd N
  --session-id <runId> | --resume <session>`; spawned directly (no shell), `detached` → own process
  group, cancel = SIGTERM group then SIGKILL; turn cap enforced by us (the CLI has no max-turns flag);
  raw redacted stream → `~/.ai-studio/runs/<runId>.jsonl`.
- `src/runtime/stream.ts` — stream-json → session / activity (reading, searching, editing, running,
  thinking, asking) / tokens (deduped per message id) / outcome (result, usage, cost, turns).
- `src/runtime/env.ts` — env from scratch: HOME/USER/… + fixed PATH + `envFor(projectId)`; auth
  overrides (`ANTHROPIC_API_KEY`, …) never passed so the CLI always uses the user's login.
- `src/runtime/compose.ts` — brain ▸ team does ▸ team codes ▸ job ▸ project rules pointer ▸ how to work.
- `src/runtime/config.ts` — `AI_STUDIO_CLAUDE_BIN` (absolute + executable, realpath) or known
  locations; `AI_STUDIO_MODEL` (default `claude-opus-5-5`).
- `src/mcp/ask-server.ts` — standalone stdio MCP server (`node ask-server.ts`), tool `ask_user`
  → `POST /internal/runs/:runId/asks` (per-run token) + long-poll `…/:askId/wait`.
- `src/runtime/service.ts` + `src/db/runs.ts` + migration 5 — runs/asks, one live run per agent per
  project, events `run.started`, `agent.status` (+runId), `tokens`, `ask.opened/answered`,
  `run.finished`; granted values masked out of every event; boot marks stale runs failed and
  cancels their asks; shutdown cancels live runs.
- Routes: `POST/GET /projects/:id/runs`, `GET /projects/:id/runs/:runId`, `POST …/cancel`,
  `GET /projects/:id/asks[?status]`, `POST /projects/:id/asks/:askId/answer`, internal ask routes.

## Live run (the one approved) — 2026-11-13, run 47ac8df8…
- hello-studio, Pixel Pete, caps 8 turns / $0.50. Real init line: `apiKeySource: none` (login, no
  key), `permissionMode: dontAsk`, only our `studio` MCP server (connected), `skills: []`,
  `slash_commands: []`, plugins = built-in only (no personal plugins).
- Events arrived over SSE: run.started → thinking → `cat CLAUDE.md; ls -a` (allowed) →
  compound `printf … > hello.txt && git add && git commit …` **denied** (printf/redirect not
  allow-listed) → it used **Write** instead (hello.txt = "Hello from AI Studio") → called
  **ask_user** ("Bash is blocked, can you enable it for git?") → `ask.opened` event, run waiting.
- Then the server process serving the run went away: port 4319 was already held by the
  **Tauri app's own backend** (A0 launches/reuses one), so my `npm start` exited with EADDRINUSE and
  the run lived in the app's backend; when that app quit, the run died before I answered.
  On the next boot the run was marked failed ("Interrupted") and its ask cancelled.
- Usage (from the run's stream log): 4 turns; input 8, output 79, cache read 29,264, cache write
  11,341 tokens. No `result` line, so no cost figure. `hello.txt` exists, **uncommitted**.
- Not re-run (exactly one live run was approved). A follow-up is ONE call: `POST
  /projects/hello-studio/runs {agentId:'a-pete', resumeRunId:'47ac8df8-c075-4577-bc37-8fd175b357b9',
  task:'Bash allows plain git commands one at a time; commit hello.txt (no push, no remote).'}`
  — the prompt now also tells agents to run one plain command at a time.

## Gotchas
- Check port 4319 before starting a dev server: the app may already run a backend.
- The CLI's `--restricted` ignores user/project/local settings; `--bare` would also skip CLAUDE.md
  and refuses OAuth (needs an API key) — don't use it.
