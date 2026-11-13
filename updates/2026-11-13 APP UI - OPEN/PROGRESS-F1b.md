# PROGRESS — F1b Engine for real work (server) — ⏳ in progress

Resume notes. Plan: `update v1.md` (Overnight final build → F1b). Backend docs: `updates/2026-11-13 BACKEND - OPEN/`
(+ `idea-collaboration-design.md`), API: `server/README.md`. Commits prefixed `ENGINE F1b:`.

## Items
1. ⏳ Collaboration design (B8) — plan `collaboration` (orchestrator ↔ captains/everyone, review gates), project storage,
   dispatch build → review(s) → done with bounded send-backs, events `handoff` / `review.*`.
2. ☐ Agent toolkits — `toolsmith` roles (QA, Quality), `~/.ai-studio/toolkits/<agentId>/` via `--add-dir`, `tools/<agent>/`.
3. ☐ Git worktrees per item — parallel-safe runs, merge back on accept, conflicts → calm send-back.
4. ☐ Project lifecycle & progress — live / needs / idle automatically, overall progress (features + goal) + target.
5. ☐ Gaps — goal replies in the orchestrator thread, report follow-ups carry the report, turn caps.
6. ☐ Live check (real runner, once).
