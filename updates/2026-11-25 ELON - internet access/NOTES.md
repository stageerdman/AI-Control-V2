# Do agents have internet access, and who decides? (2026-11-25)

Feature: f-do-agents-have-access-to-the-internet. Read-only research; no product code changed.

## How it works today (code)
- Web tools = `WebSearch`, `WebFetch` (`server/src/runtime/claude-cli.ts:59`). Added to a run only when `spec.web` is set (`claude-cli.ts:117`).
- `spec.web` is set when `reporter || perms?.web` (`server/src/runtime/service.ts:696`):
  - `reporter` = the agent may file reports: its role has `reporter` (seeded: role "Research", `db/migrations.ts:319`) or the run is for a reporter team (seeded: "expedition") — `reports/reports.ts:132`.
  - `perms.web` = the agent's own Toolset has `web: true` (`runtime/permissions.ts:37`, `domain/toolset.ts:20`). Of the cast-pack archetypes only Brisk Ignis (Moonshot) has it (`cast-packs/archetypes.ts:62`).
  - Agents with no own Toolset (the "full studio kit") get **no** web tools unless they are reporters.
  - Big-picture runs (orchestrator, Agent Creator) run with `tools: []` → no web. Tinker's design chat has its own web (`crew/creator-chat.ts:23`).
- The Cast shows it: "The web (search and fetch)" in an agent's reach list (`domain/tool-list.ts:37`).
- Decided by: the user, statically — by giving a role the reporter flag, a team the reporter flag, or an agent a toolset with web on. Nobody decides per task; there is no ask step.

## Leak: the shell already reaches the network
- `curl`/`wget` are not allowed (dev shell = git, ls, cat, pwd, mkdir, npm, npx, node — `runtime/config.ts:94`).
- But `node -e "fetch(...)"`, `npx <any package>`, `npm install` and `git pull/push` all reach the internet. No network sandbox in the CLI args (`claude-cli.ts:137-169`).
- So "no web" today means "no *search/fetch tool*", not "no internet". Every builder with the studio shell can reach any URL if it tries.

## Gap to what the user wants
- Research agents have internet: yes (reporter role → web).
- Others ask the orchestrator, orchestrator allows if the reason is good: missing. Only `cant_do` exists (item goes back to the orchestrator; no way to hand it back *with* web).

## Suggested design (delete steps first)
1. Per-item web flag on a checklist item: the orchestrator sets `web: true` when it writes the item, if the task needs it (most needs are known up front, so most asks disappear).
2. Mid-task need: the builder calls a new `ask_for_web(reason)` bridge tool. The orchestrator gets the reason in its chat and answers allow/deny with one tool; on allow the same item resumes (same session, same branch) with web on. One ask per item; a deny is final.
3. Scope: the grant is for that item only, never stored on the agent.
4. Separately decide whether `node`/`npx` network use should be fenced; otherwise "no web" is advisory.
