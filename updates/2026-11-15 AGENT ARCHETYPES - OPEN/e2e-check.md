# End-to-end check: the nine archetype agents (2026-11-15)

**Result: works.** One gap remains: the Cast doesn't show an agent's tools.

## What was checked

| Check | Result |
|---|---|
| `.project` `run: npm --prefix app run dev` starts the app | ✅ Vite on :1420, Rust build, the window opens, and the app starts its own server (no separate start needed). The line is unchanged. |
| Server installs the pack on a fresh studio | ✅ The log says "Added a cast pack to the studio" (`archetypes-2026-11`). |
| `GET /agents`: all nine with the right name, role, look and tools | ✅ |
| Each one can be picked into a team | ✅ API: all nine joined two test teams (201). Captains were set automatically. |
| Cast shows all nine with name, role and costume | ✅ `shots/e2e-cast.png` |
| New hats and tools have readable labels and work by keyboard in the look picker | ✅ Every arrow is a real, named `<button>`. Rows read e.g. "Hat: Launch visor". Locked in by the test below. |
| App tests | ✅ 36 files, 319 tests. Typecheck and lint are clean. |
| Server tests | ✅ 85 files, 546 tests (after the fix below) |

New test: `app/src/features/cast/archetypes.e2e.test.tsx`. It loads the server's own pack at run time and checks that the app can draw it, label it, pick it for a team and use the picker by keyboard. If the pack and the app's kits drift apart, this test fails.

## Fixed

- `server/test/office/director-work.test.ts` failed every run. The director's `report-in` call can land before the assertion runs. This is a timing race in the test, and it fails on the code from before this team's commits too. The test now ignores the extra report-in.

## Broken / missing (for the captain)

- **The Cast doesn't show an agent's tools.** The server sends `agent.tools` (edit scope, shell, web and the "works with" lines). The app's `Agent` type (`app/src/api/types.ts`) has no `tools` field, and no panel renders it. See `shots/e2e-agent-panel.png`: Brisk's panel shows role, brain, mail and teams, but no tools. This is UI work for the Founders. It also matters for the project rule "make what each agent can reach visible".
- Minor: Bramble's chassis shows the **Research** badge because the mortarboard implies it. The design card says this is on purpose.
