# Cast look editor — wiki

Durable decisions and lessons from this update.

## The stage is the editor
The hero zoom already puts the bot in the middle with arrows at each slot's height. Any new look feature
adds to that stage (a tag that opens a tray, a chip under the dice). No separate "edit look" screen or mode.

## Two save rules, on purpose
- **Looks save at once** (arrows, tray, dice). Clothes are cheap, visible and easy to change back, and
  **↺ Undo look** restores the look from when you opened the agent.
- **Tinker's changes wait for Save changes.** Tinker can rewrite the prompt, which changes how the agent works.
  That needs a look before it lands.

## Thumbnails are the agent, not loose parts
In the parts tray each option is the agent's own bot wearing it. One rule for every slot, nothing new to
draw, and you see the part *on this agent's body and colour*. That is the real question when you pick.
Colour is the exception: a swatch with its name, because a colour has no shape to read when small.

## Try-on is free, picking is a save
Hover / focus tries an option on the big bot without saving; leaving puts it back. Only a click / Enter
saves. On touch a tap picks (there is no hover), which is fine because Undo look is right there.

## Esc closes the innermost thing
The tray's Esc calls `preventDefault`; HeroZoom ignores a prevented Esc. Keep this rule for any new popover
on the stage.

## One restore point beats a history
A step-by-step undo is a second thing to learn. One "back to how they looked when I opened them" covers
playing around, and it resets when you step to another agent.

## Improve sessions belong to one agent
A Tinker chat for an existing agent carries its `agent_id`; there is at most one per agent, and opening it
again resumes it. Accepting updates the agent in place (same id, teams and access untouched). The agent's own
name doesn't count as "taken".
