# BACKEND — decisions & lessons

Durable knowledge from this update. Status lives in `update v1.md`.

## Principles
- **Fake first, live opt-in.** Every flow runs end-to-end on a scripted FakeRunner; live Claude
  runs cost money and are opt-in.
- **The sandbox is a wall.** All project file writes resolve inside the sandbox root; tested.
- **Secrets never cross the API.** Masked last-4 only, in every response and log.

## Lessons
- *(to be filled as the update progresses)*
