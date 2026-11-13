# PROGRESS — B6 Orchestrator & Agent Creator — ✅ done (210 tests, live smoke test run once)

Resume notes. Plan: `update v1.md`; lessons: `wiki.md`; API + contracts: `server/README.md`.
Built on the FakeRunner; one approved live smoke test afterwards (below).

## Done (28 new tests → 206 total)
1. ✅ `src/domain/plan.ts` (PlanSchema + `planIssues`/`assertPlan`, `pendingBriefs`, `staffingOf`),
   `src/domain/catalog.ts` (emblem ids, hues, look slots, crew-only gear); `drafts.plan` validated on PATCH (422/409);
   `/finish` refuses pending briefs (409) and staffs from `plan.teams` / `plan.specialists`.
2. ✅ `src/crew/structured.ts` — contract line, JSON extraction, zod + rules validation, one repair (resumes the
   session), `agent_error` 502; tool-less runs in `$AI_STUDIO_HOME/scratch`. `src/crew/setup-chat.ts` +
   `POST/GET /drafts/:id/chat` (atomic turn, one at a time per draft, events `chat.message` / `plan.changed` / `tokens` /
   `agent.status` on the draft stream).
3. ✅ `src/domain/creator.ts` (AgentDef/TeamDef + rules), `src/crew/creator.ts` (design → persist), `POST /drafts/:id/accept`
   (all briefs designed first, then ONE tx: roles + agents + teams + resolved plan + creator chat lines; `cast.created`).
4. ✅ `src/crew/dispatch.ts` + `src/db/work.ts` + migration 6 (goals, checklist_items); `POST/GET /projects/:id/work`,
   `GET …/work/:goalId`, `POST …/work/:goalId/cancel`; runtime `onFinished` hook; boot recovery.
5. ✅ `src/crew/fake-brain.ts` (default FakeRunner answers for every contract), `AI_STUDIO_RUNNER=fake` in main.ts,
   end-to-end test (`test/crew/flow.test.ts`), real-server check below, docs.

## Real check (free) — 2026-11-13
`AI_STUDIO_RUNNER=fake PORT=4329` with a temp home/sandbox (4319 left alone): draft → chat ("design a new team for docs")
→ accept minted *The Night Shift* (+ role, 2 agents) → finish scaffolded `fake-live-check` staffed with ship-it + the new
team → work "Write a hello page" → 2 items (a-semic for ship-it, the new captain) ran → goal done, 100 %. The project SSE
stream replayed setup.step ×18, chat.message ×3, plan.changed ×2, cast.created ×4, goal.changed ×2, checklist.item ×6,
progress ×3, run.started/finished ×2.

## Live smoke test — run once (approved), 2026-11-13, "Smoke Six"
Real CLI (`claude-cli`, model claude-opus-5-5, the user's Claude Code login — `apiKeySource: none`), port 4339 (4319
untouched), real `~/.ai-studio`. Usage below is plan usage; `total_cost_usd` is the CLI's API-equivalent estimate, not money.

| step | what happened |
|---|---|
| chat 1 (open) | 1 crew call, 1 turn, valid first time: two specialists (Pixel Pete, Twinkle) for a one-page site. |
| chat 2 "add a specialist for accessibility" | 1st answer broke teams-first (3 individuals, no team) → **repair** in the SAME scratch session (`--resume`, cache read 5,150) → valid: Ship-It Squad + Twinkle + a `newAgents` brief. |
| accept | 1 Creator call, 1 turn, valid first time: **Ally Alt-Text** (new role *Accessibility*, studio look slots, full prompt) minted; plan resolved. |
| finish | `smoke-six` scaffolded, local commit `3861cca`, no remote. |
| work "Add index.html saying hello" (caps 8 turns) | dispatch call valid first time: 4 items (Semicolon/ship-it ×2, Twinkle, Ally). Items 1+2 started together (cap 2). **First failure: item 1 (Semicolon) hit the 8-turn cap** while staging his commit. I stopped there (cancelled the goal) — but item 4 (Semicolon again) had already started automatically and was waiting on an `ask_user` ("ship behind a flag?"); it was cancelled. Twinkle committed `421bf06` in its 9th turn and was then stopped by the cap; Ally ran after and passed the page (4 turns, succeeded). |

Checks:
- `--tools ""` + `--restricted` accepted: crew init lines show `tools: []`, `mcp_servers: []`, `permissionMode: dontAsk`, cwd `~/.ai-studio/scratch`. ✅
- JSON contract: 4 of 5 crew answers valid first time, 1 repaired (rule, not shape). Plain JSON, no fences. ✅
- Scratch-session resume for the repair: same `session_id` on both, cache read 5,150. ✅
- `~/.claude/CLAUDE.md`: **does not exist** on this Mac (nor `~/CLAUDE.md`, `~/.ai-studio/CLAUDE.md`), so nothing can leak; crew
  input was ~5k tokens total (prompt + Cast), consistent with no extra memory. Re-check if the user ever creates one. ✅ (by absence)
- Runs stay inside the project: every Read/Write/Edit path under `smoke-six/`, Bash only `ls`/`git`; all 4 inits cwd = the project. ✅
- Commit: `421bf06 Add friendly hello page style` (index.html + issues.txt). ⚠️ It also swept in Semicolon's staged
  `issues.txt` (two agents, one git index); Semicolon's staged `update v1.md` is still staged, uncommitted.

Project git log (`~/dev/AI-Studio-Sandbox/smoke-six`): `421bf06 Add friendly hello page style` ← `3861cca AI Studio: set up Smoke Six`.

Usage (9 CLI processes; from the stream logs):
- crew: 5 calls × 1 turn — input 10, cache read 9,118, cache write 12,926, output 2,530 (≈ $0.20 API-equivalent).
- agent runs: 4 runs, 25 turns (9 capped, 9 capped, 4 ✅, 3 cancelled) — input 48, cache read ≈ 259k, cache write ≈ 33.4k,
  output ≥ 1,630 (stopped runs carry partial per-message usage); only Ally's run has an estimate (≈ $0.09).

Diagnosed + fixed at no cost (no re-run):
1. **Runs stopped before their result line recorded zero usage** → the parser now sums per-message usage as the fallback
   (regression test on the real capped stream).
2. **Checklist items ran concurrently in one working tree** (Semicolon and Twinkle both wrote index.html; Twinkle's commit took
   Semicolon's staged file) and a later item still started after an earlier one failed → items now run **in order**
   (migration 8: `parallel` flag lets an item start with the one before it) and items after a failed one are **skipped**.
   The orchestrator is told so and to keep a one-page task to 1–2 items.
3. Per-goal run caps (`POST /projects/:id/work {caps}`, migration 7) — needed to run with 8-turn agent runs.
Not changed (decide with the user): 8 turns is too tight for a run that reads CLAUDE.md + the update plan, writes, keeps the
status file current and commits (both capped runs needed ~10); the default stays 12. The teams-first rule (≤ 2 individuals
without a team) pushed a one-page site onto a whole team — maybe allow 3 for tiny projects.
Fixtures: `test/fixtures/live-b6-*.jsonl` (setup-chat open / rule-broken / repaired, mint-agent, dispatch, agent-turn-cap).

## Gotchas
- Port 4319 may belong to the Tauri app's backend — use another PORT for checks.
- Captains do their item themselves for now; real in-team delegation (captain → members) is a later phase.
- After a restart running items fail and queued ones are cancelled — post the goal again (nothing spends money unasked).
