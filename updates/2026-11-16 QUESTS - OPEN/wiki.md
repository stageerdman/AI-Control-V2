# Main Quests & Side Quests — wiki

What was decided while building the server side, and why.

- **One column.** `goals.quest` (`'main' | 'side'`, default `'main'`, migration 39). Every older goal and every
  caller that doesn't say otherwise stays a main quest. No new table, no second dispatch path (Elon's report:
  same path, so stop, carry-on, cost and history keep working).
- **A side quest never serves a feature.** `add_goal` with `quest: "side"` and a `feature` is refused with a
  plain message. A feature's progress is main-quest work only.
- **Who makes side quests.** Pixel, with `add_goal { quest: "side" }`. A colleague's `call_agent` with
  `work: true` always lands as a side quest (`server/src/app.ts`, `addWork`). Planned goals and "Start it" stay main.
- **The rule is pure and lives in `server/src/domain/quests.ts`.** `mainFirst` orders the queue (stable within
  each kind); `heldForMain` names the agents whose side quests must wait: they have main work that could start
  now (not waiting on an earlier task). Dispatch's `pump` only applies them.
- **The pump reads each goal fresh.** A task skipped earlier in the same loop changes the gates later tasks see,
  so the goal is not cached across the loop.
- **Known limit.** A side quest that started while its agent's main work was waiting on someone else can delay
  that main work by the side quest's length. Side quests never stop running work; preempting would lose more.
- **Where the client sees it.** The goal JSON (`GET /projects/:id/work`) and the `goal.changed` event carry
  `quest`; the director's board text prints `Side quest <id>`.
