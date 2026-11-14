# ACCESS & GITHUB — wiki

Durable decisions and lessons from this update.

- Deterministic infrastructure (ports) is a studio service with a visible room, not an agent: robots are for judgement.
- The dev server (Vite) tolerates invalid CSS that the production minifier (lightningcss) rejects. Run `vite build` before calling a UI phase done.
- Never mark a project up to date only when the text changed: a compile that produces the same text is still current. Commit only files that git sees as changed.
- A director that decides "work or chat" must fail toward chat: only a valid, explicit `work` answer starts a goal —
  plain words, broken JSON or a question are replies. Never auto-start on a guess.
- Agent time adds parallel runs up, so show hours, never days ("3d" reads like calendar time); crew calls that never
  become runs (planning, splits, health, Rivet) need their own timing or "thinking" and "setup" read as zero.
