# Thinking power in the Cast panel

**User goal:** make one agent think harder (design, hard bugs) or lighter (chores) by default — without
choosing a model or an effort level. (User model: goal 2, "Shape the Cast"; and goal 1, work that gets done well.)

## What was removed, and why
- **Model and effort pickers.** Two knobs for one intent. The server pairs them per step
  (`server/src/runtime/thinking.ts`); the panel never names a model.
- **An "Auto / role default" option.** Normal *is* the default: picking Normal clears the agent's own setting
  (`thinking: null`), so reviews and planning still go Deep by themselves. One less segment, nothing to explain.
  (Cost: you can't force Normal on reviews. Nobody asked for that; Light is there for "always lighter".)
- **Cost numbers per step.** Not until Phase 4 has this office's own figures — no made-up estimates.
  The line says it in words: "slower, more tokens".
- **A Save button.** Like every panel field, a pick saves at once and the "Saved ✓" pip answers.

## Flow
Open an agent in the Cast → **Thinking** (right under Brain) → pick a step. Done. Hover a step to read its line
before picking.

## Layout
```
THINKING  how hard it thinks
[ Light | Normal | Deep | Deepest ]      ← one segmented control, four equal segments
Balanced, right for most work. Thinks harder on its own for reviews and planning.
```
- Section order: Brain → **Thinking** → Tools → Can send mail → Teams. It sits next to Brain because both say
  how the agent thinks.
- Reuses the panel's segmented control (`.tk-mode` + `Radios`); segments stretch to the panel width, 36px tall.
- The line keeps a fixed height (`min-height: 3em`) so the panel never jumps when it changes.

## The words
| Step | Line |
|---|---|
| Light | Quick and light. A faster model for simple chores. |
| Normal | Balanced, right for most work. Thinks harder on its own for reviews and planning. |
| Deep | Thinks it through. For design and hard bugs — slower, more tokens. |
| Deepest | As hard as it can. For rare, stuck problems — slowest, the most tokens. |

## States
- **Nothing stored / `normal`:** Normal checked.
- **Hover a step:** its line shows, a little dimmer (`.peek`); leaving brings the chosen step's line back.
- **Saving:** optimistic — the step moves at once; the "Saved ✓" pip on success. On failure the store's usual
  error toast and refetch put the old step back.
- **New recruit (no id yet) / Tinker draft:** hidden (there's nothing to save to yet; Normal applies).
- **Crew (orchestrator, setter, creator):** shown — crew calls use the agent's own step too.

## Accessibility
- `radiogroup` "Thinking power", `aria-describedby` → the line, so a screen reader hears the meaning with the choice.
- Roving tabindex: Tab enters once, arrows / Home / End move and pick; sun focus ring.
- Text: 13px labels, 13.5px line on cream-72 over the dark glass.

## Build
- `app/src/features/cast/thinking.ts` — pure: the steps, their lines, `shownStep` (null → Normal),
  `savedStep` (Normal → null).
- `app/src/features/cast/ThinkingDial.tsx` — the reusable dial (the goal/task override will use it too).
- `AgentPanel.tsx` — the section; saves with `saveAgent(id, { thinking })` (`PATCH /agents/:id`).
- Tests: `ThinkingDial.test.tsx` (pure mapping, dial, panel saves and visibility).

## Later (not this item)
Per-step averages from this office under the line (Phase 4), the task override on goals/tasks, a badge on a
working agent showing its step.
