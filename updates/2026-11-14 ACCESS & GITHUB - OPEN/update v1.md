# ACCESS & GITHUB — update v1

Status: **OPEN** · Opened 2026-11-14 · Request: `user-request.md`

## Goal
Close the gaps the user named after the overnight build: publish projects to GitHub, a public/private switch,
agents that can run setting-prefixed commands with ports managed by the studio, "Add new access" where an
access holds several keys or other private info, and a director chat that doesn't drift back to old ideas.

## Decisions (orchestrator, 2026-11-14)
- **Ports = a studio service + a "Ports" room, not an agent.** Port allocation is deterministic, so a robot
  deciding it would add a run and nothing else. Each project owns a stable port block (its app port 3100–3999 from F3,
  plus a few spares). Every agent run gets them as env (`PORT`, `AI_STUDIO_PORTS`) and in its brief. The Ports room
  shows who holds what and what is listening. Any agent may run `NAME=value … <allowed command>`.
- **Setting-prefixed commands:** `VAR=value cmd` is allowed when `cmd` is on the dev allow-list, VAR is a plain name,
  and the value is a literal. No `$(…)`, backticks or `$VAR` expansion; this is checked in the hook.
- **Access, not keys:** an *access* (e.g. "Stripe", "Postgres prod") is a named bundle of fields: keys, tokens,
  usernames, URLs, passwords. Each field has a label, its env var, secret yes/no, and masked last-4. Grants are per
  access per project (all its fields). Values stay in `~/.ai-control/.env` via the credentials API only; metadata is in sqlite.
  Existing single-key credentials migrate to one-field accesses with no loss. A project's cabinet shows a "new" dot on
  accesses added since the project last looked.
- **GitHub by default (user, 2026-11-14: "repo github must be also established by default"):** setup (Rivet) creates a
  private repo and pushes `main`. There is a per-project skip toggle and a studio-wide default, and adopted projects keep an existing remote. If `gh`
  is missing, setup still finishes and health offers Publish. The manual publish below is the fallback.
- **GitHub publishing (manual fallback):** "Publish to GitHub" creates the repo with `gh`
  (private by default, visibility chosen at publish time), sets `origin` and pushes `main`. After that, merges to main
  push automatically when the project is published. The public/private switch wraps `gh repo edit --visibility`, and
  going public asks for confirmation. Agents still never push; the studio does. Tests use a stub `gh`. No real repo
  is created without the user pressing Publish.
- **Director chat freshness:** each orchestrator turn gets a fresh project snapshot (goals, whiteboard, features,
  team) marked as the source of truth over earlier chat. The resumed session is rotated after N turns or when the
  snapshot contradicts it.

## Roadmap
- **G1 — Server:** accesses (migration + API + `.env` sync + grants + seen/new), GitHub publish, visibility, auto-push,
  ports service and env-prefixed commands, director freshness, plus Blueprint rebuild endpoint if cheap. Tests.
- **G2 — UX spec (parallel with G1):** Access with "Add new access" and multi-field, Publish/visibility in health,
  the Ports room. Calm and minimal, in the prototype's language.
- **G3 — App UI:** build G2 on G1's API, tests, screenshots.
- **G4 — Verify + ship:** a real run where an agent uses `PORT=… npm start` and an access with 2 fields reaches an
  agent's env; release `.app` **installed to `/Applications/AI Studio.app`** (user: "I want to see AI Studio.app in my Applications … so that everything is functional"). Open it from there, confirm the backend starts or is reused, the UI loads and a project flow works; guide updated.

## Status
- ✅ G2 UX spec (`spec-ux-G2.md`).
- ⏳ G1 server running.
