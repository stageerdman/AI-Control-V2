# Office config — what an AI writes when it sets up a project

The Office is **generated** from one small declarative object. You say who is on
the project; the layout (`src/js/office-layout.js → officeLayout(cfg)`) places
desks, pods, the director's corner, the couch and the wall objects, and grows
the room so nothing overflows. Works from 2 agents up to ~24.

## Shape

```js
{
  project: 'aurora',            // project id (PROJECTS)
  director: 'pixel',            // always present, big picture only; has its own corner
  teams: [                      // one pod per team, in this order (≤ 6 desks per pod row)
    { id: 'ship-it', members: ['a-pete', 'a-semic', 'a-scar'] },          // existing team (TEAMS)
    { id: 'night-shift', name: 'The Night Shift', color: 'coral',          // new team, defined inline
      emblem: 'lantern', captain: 'g-5', members: ['g-5', 'g-6'] },
  ],
  solo: ['a-baron', 'a-query'], // agents without a team: plain desks, no rug
}
```

- `members` / `solo` are agent ids from the roster (`AGENTS`). Desk order = list order.
- A team entry with only `id` + `members` reuses the team's name/colour/emblem;
  add `name`, `color` (palette key), `emblem` (emblem id), `captain` to define a new one.
  Captain defaults to the team's captain if present, else the first member.
- Everything else (what each agent is doing, sleeping, asks, features, health)
  is live **state**, not config.

## What the layout guarantees

- ≤ 2 desk rows; pods are packed left→right and the room widens (from 1600) until they fit.
  One pod → one centred row. 3+ pods → both rows.
- Wall, left → right: door + clock · push box + deploy station · features folder ·
  whiteboard · health board · windows (if room) · director's glass corner. Only the
  folder, whiteboard and health board are interactive.
- Right column: director's desk (top), couch with 3 seats (bottom) for off-shift agents.
- Walkers use two lanes (behind each desk row) and cross only through gaps between pods.

## Demo sizes

`?demo=size2` (one team of 2) · `size6` (Aurora story, default) · `size12` (3 teams + 3 solo)
· `size20` (5 teams + 2 solo, extras minted from FUNNY_NAMES). Also a tiny switch at the
bottom of the List panel. Configs live in `OFFICE_CONFIGS` in `src/js/data-office.js`.
