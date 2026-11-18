# LIVE ACCESS — wiki

- **A running Claude Code process can't learn new env vars.** `CLAUDE_ENV_FILE` is read when the session
  starts and never again (spike: written before start → seen; rewritten mid-run → `UNSET`). Don't build on it.
- **Files are live.** A `.env` written into the agent's working folder mid-run is read by its next command
  (`node --env-file=.env …`, app .env loaders). That is the live path.
- **Fresh sessions must rebuild env and prompt.** `forget` / limit carry-on used to reuse the first spec, so an
  access granted mid-run never arrived even after a restart. `nextSession` now reads current grants.
- **Scrub list is shared by reference.** The run's `secrets` array is the runner's `secretValues`; pushing a
  newly granted value into it scrubs the stream, chat and events from then on.
- Notices carry names, labels and env vars — never a value.
