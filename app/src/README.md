# app/src — the AI Studio front end

React 19 + TS + Tailwind v4 (no preflight), on the prototype's own CSS. Prototype = spec:
`updates/2026-10-17 INIT - OPEN/concepts/disney-v3/`. Check: `npm test`, `npm run typecheck`, `npm run lint`.

| folder             | what                                                                                                                                                                                                                                                                                                     |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `design/`          | `theme.css` = THE tokens (palette, radii, shadows, fonts, easings → `bg-sun`, `rounded-lg`, `shadow-panel`…); `prototype.css` = the prototype's base.css (`.btn .chip .pill .panel .sheet .toast .field .progress .switch .scene`…) aliased to those tokens; `palette.ts` (PALETTE, HUES, hueHex, shade) |
| `characters/`      | robots + emblems: `hero-svg.ts` / `emblem-svg.ts` are the prototype's generators, typed and **byte-identical** (`parity.test.ts`, 823 golden cases from `npm run golden`). Never redraw — change the prototype, re-run golden                                                                            |
| `api/`             | `studio.*` typed endpoints, `ApiError`, `useQuery`/`useMutation`/`invalidate`, `useEventStream`, wire `types.ts`                                                                                                                                                                                         |
| `shell/`           | backend gate, layout (studio / office / gallery layers), hash router, "Building…" placeholder                                                                                                                                                                                                            |
| `ui/`              | Button, Chip, Pill, Progress, Switch, Field, TextArea, Sheet, toast()/Toaster, EmptyState, Loading, ErrorState, Panel, SceneHead                                                                                                                                                                         |
| `gallery/`         | `#gallery[/roster                                                                                                                                                                                                                                                                                        | zoom | poses | facings | sizes | looks | extras | emblems]` dev route |
| `features/<name>/` | **yours** — one folder per feature (pages, components, CSS ported from the prototype)                                                                                                                                                                                                                    |

## Add a page

1. Build it in `src/features/<name>/`: `export function CastPage({ route }: PageProps<'cast'>) {…}`.
2. Register one line in `src/pages.tsx`: `cast: CastPage,` (lazy() is fine). Same component may serve
   several routes (`cast`, `cast.agent`, `cast.team`) — it stays mounted while the stage doesn't change.
3. Routes (`shell/router.ts`): `projects · cast{tab} · cast.agent{id} · cast.team{id} · access · blueprint ·
   new{draftId} · office{projectId, sub: room|board|health|features|feature|reports|report, id?} · gallery`.
   Navigate with `<a href="#cast/teams">` or `go({ name: 'office', projectId, sub: 'board' })`; read with `useRoute()`.
   New route = add it to `Route`, `parseRoute`, `formatRoute` + a test line in `router.test.ts`.
4. Studio pages render inside `<section class="scene">` under the nav; `office` gets the full-screen
   `#office` layer (bring your own back button). The pager: set `Pager` in `pages.tsx` (gets `route`).
5. Prototype screen CSS can be ported as-is next to your page (it uses the same class names/vars).

## Characters

```tsx
<Hero agent={agent} size="md" pose="typing" facing="three-quarter" dir="left" seated label />
<Hero agent={a} look={{ hue: 'coral' }} captain armband="sun" />   // look = costume override
<Hero ghost size="md" />                                            // "+ New" slot
const ref = useRef<HeroHandle>(null); ref.current?.setFacing('front'); ref.current?.setPose('needs-input')
<Emblem team={team} size={88} />  <Emblem id="rocket" color="grape" size="sm" decorative />  <CaptainPip hue={team.color} />
```
`agent` = anything with `name` + `look` (a server `Agent` fits). Changing pose/facing/gaze/seated/holding props
animates in place; changing the costume/size rebuilds. `label` makes it `role="img"`. Sizes: xs 48 · sm 96 ·
md 160 · xl 360 or px; < 64 px uses LOD. Reduced motion stops every animation (static key poses stay).
Imperative (office engine): `hero(agent, opts)` → element, `setPose/setFacing/setLook(el, …)`, `heroHeadAnchor(el)`.

## Data

```ts
const agents = useQuery('agents', studio.agents.list);            // {data, error, loading, fetching, refetch}
const save = useMutation((p: AgentPatch) => studio.agents.update(id, p), { invalidate: ['agents'] });
useEventStream(studio.projects.eventsUrl(id), (e) => { if (e.type === 'progress') setQueryData(`project:${id}`, …) });
```
Keys are strings; `invalidate(prefix)` refetches what's on screen. Errors are always `ApiError {status, code, message,
details, issues}` (server codes + `network`, `bad_response`) → show with `<ErrorState error={e} onRetry={…} />`.
The SSE hook resumes after the last id (browser Last-Event-ID, or `?after=` with backoff when the stream dies) and
drops duplicates; new server event types go in `types.ts` (`EventPayloads` + `EVENT_TYPES`). Base URL:
`VITE_API_URL` or `http://127.0.0.1:4319`. Never put a secret value in state, logs or the DOM.

## Gotchas

- Don't use Tailwind's `h-screen` on anything inside a hero (the face screen is `rect.h-screen`; guarded anyway).
- No preflight: headings/lists keep browser defaults, as in the prototype. Utilities still override `.btn` etc.
- Files differing only in case collide on macOS (`Emblem.tsx` vs `emblem.ts`).
