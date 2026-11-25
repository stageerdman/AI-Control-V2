# Project isolation — wiki

- The Cast agent is shared across projects by design. What it *is* (prompt, look, role) is global. Everything about what it
  *did* must be keyed by (project, agent). A query or cache key with only an agent id is a leak waiting to happen.
- The reported "memory" leak was not in the agent's session at all. It was an office view (the tap-recap) that asked
  "latest chat of this agent" with no project. Look at what the user is shown before blaming the model.
- Claude Code has its own auto memory (`~/.claude/projects/<folder>/memory/`), on by default, keyed by folder.
  The studio already has its own memory (desk, to-dos, history), so turn the CLI's off (`CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`).
- A repro that must stay green until fixed: vitest `it.fails`. Flip it to `it` in the phase that fixes it.
