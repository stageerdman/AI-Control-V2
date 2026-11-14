# ACCESS & GITHUB — wiki

Durable decisions and lessons from this update.

- Deterministic infrastructure (ports) is a studio service with a visible room, not an agent: robots are for judgement.
- The dev server (Vite) tolerates invalid CSS that the production minifier (lightningcss) rejects. Run `vite build` before calling a UI phase done.
- Never mark a project up to date only when the text changed: a compile that produces the same text is still current. Commit only files that git sees as changed.
