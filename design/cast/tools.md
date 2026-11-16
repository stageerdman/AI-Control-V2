# Cast panel — Tools (Edit / Run / Reach)

## User goal
"What can this agent actually do?" — answered at a glance, honestly, before handing them work
(goal 1 and 2 in `design/user-model.md`). Project rule: make what each agent can reach visible and honest.

## What I removed, and why
- **The old "works with" lines** (`tools.works`, e.g. "Run tests", "Git (branch and commit)"). They were
  prose claims that overlapped the real permissions and could disagree with them. The three groups come
  from the runtime's own rules (`server/src/domain/tool-list.ts`), so they can't lie. One truth, shown once.
  (`works` stays in the data for Tinker's design card; the panel just doesn't repeat it.)
- **Chips, icons, colours per group.** Three short labelled rows read faster than badges.
- **A hint sentence under the heading.** The row labels already say it.
- **Editing controls.** Tools are shaped by Tinker / the pack; the panel only shows them. (Mail keeps its
  existing switch below — the Reach list updates from the server's reply when it's flipped.)

## Layout
Sits right under the description (Brain for agents, the "about" line for crew), above "Can send mail".

```
TOOLS
Edit    Any file in the project
Run     git · ls · cat · pwd · mkdir · npm · npx · node
Reach   Reads every file in the project
        The web (search and fetch)
        Mail to other projects and HQ
        Keys granted to its project (never their values)
```

- A two-column grid: label column 56px (`--cream-45`, 12px, weight 800), values `--cream-72`, 13.5px,
  line-height 1.55. Rows 10px apart. Same section rule/heading as every other panel section (`zp-sec`, `zp-label`).
- Edit and Reach: one line each. Run: commands on one wrapping line, joined by " · " — they're short words.
- Narrow panel: the grid holds (labels are 5 letters); long values wrap under themselves, never under the label.

## States
| State | Shows |
|---|---|
| Full kit (no toolset) | Edit "Any file in the project", Run = the studio shell, Reach = reads + keys (+ web if reporter, + mail if on) |
| Read only (edit `none`) | Edit "Nothing — reads only" (muted) |
| No shell | Run "Nothing" (muted) |
| Scoped edits | Each path on its own line, e.g. `updates/**` |
| New recruit / Tinker draft | Section hidden — the server hasn't decided their kit yet |
| Data missing (older server) | Section hidden, never a guess |

## Accessibility
- `<section aria-labelledby>` → a named region "Tools".
- `<dl>`: each label is a `<dt>`, its lines are `<dd>`s, so a screen reader says "Edit: Any file in the project".
- Muted "Nothing" still meets contrast (`--cream-45` on the dark glass is the panel's existing hint colour).
- Nothing interactive — no tab stops added.

## Voice path
"What can Brisk do?" → the orchestrator reads the same three lists (the Cast API carries `toolList`; Phase 3
gives agents the same line in the room).

## Build notes
- Component: `app/src/features/cast/ToolList.tsx` — `ToolList({ list })`, pure, reusable (Phase 3's room view can use it).
- Data: `Agent.toolList` from the Cast API (`GET /agents`). Never computed in the app.
