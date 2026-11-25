# Review: Menu bar design (one clear Quit)

Reviewer: Eraser. 2026-11-25. Reviewed: `## Menu bar design` in `plan.md` (as of commit 0cf095d).

**User goal:** switch the studio fully off in one step from wherever they are, knowing nothing is lost, and get it back in one step.

## What I checked

- **Exactly one Quit.** Yes. The tray item, ⌘Q, the app menu's Quit, the Dock's Quit and logout/restart all call the same single quit. The word "Quit" appears nowhere else. I also searched the app, office and server code: there is no in-app "Stop studio" or "Shut down" button that would be a second way to quit.
- **Menu has only Open and Quit.** Yes. No status, counts, separator or settings, and left and right click do the same thing.
- **Stopping view.** One line ("Pausing your agents. They'll carry on next time."), no buttons, spinner, countdown or dialog, and nothing to dismiss. It only shows if stopping takes longer than 400 ms. It's calm and has no extra steps or choices.
- **Close hides, Quit stops.** Red button and ⌘W hide. Nothing else stops the studio.

## Step count

| Path | Steps | Verdict |
|---|---|---|
| Quit with ⌘Q | 1. Press ⌘Q. (Then 0–3 s reading one line, or nothing.) | Keep |
| Quit from the menu bar | 1. Click icon. 2. Click Quit. | Keep. Two is the minimum for a tray menu. |
| Quit from the Dock | 1. Right-click Dock icon. 2. Click Quit. | Keep. This is the system's menu, not ours. |
| Open from the menu bar | 1. Click icon. 2. Click Open. | Keep for now. The plan already checks whether a left click should open directly. |
| Open from the Dock | 1. Click Dock icon. | Keep |
| Close (hide) | 1. Red button or ⌘W. | Keep |

**Current:** 1–2 steps on every path, with no questions or confirmations. **Target:** the same. The steps are already as few as they can be.

## Fixes (Jony's to make)

1. **Make "while stopping" one rule, not a list.** Section 3 lists "⌘Q again, Quit in the Dock, Open/Quit in the menu bar". It leaves out a plain **Dock icon click** (which is Open) and **Quit in the app menu**, so a builder could treat those differently. Replace the list with one rule: *"While stopping, any Open or Quit, from anywhere, does nothing new."* — **Merge**
2. **Remove the doubled "nothing shown" rule.** "No agents working: quits right away" and the table rows "Quit, nothing working" and "Quit, agents stop in under 400 ms" describe the same thing the user sees. Fold them into the 400 ms rule ("if stopping is done within 400 ms, the app just closes and nothing is shown"), and keep one row in the table. That way there's one rule for builders to follow and test. — **Merge**

## Keep an eye on later (not blocking)

- **Bringing a hidden window forward to show the line** is the one thing the user didn't ask for: they closed the window, then it pops up. It's already in the plan's assumptions. If the first live pass shows it feels odd, the lighter option is to leave the window hidden and let the icon disappearing be the signal.
- **The default Tauri app menu** may add items such as "Close Window", "Hide" and "Quit". When it's built, "Close Window" must hide (the same as ⌘W) and that menu's "Quit" must be the same single quit. Don't add any extra items.
- **"⌘Q" next to the tray item** is a hint only (tray menus don't take shortcuts). That's fine, so keep it.

## Verdict

**RETURNED.** These are two small wording merges. The flow itself is lean: one Quit, two menu items, one calm line, and no confirmations. Once both fixes are in `plan.md`, I'll check them and sign off below.

## Sign-off

Both merges are in `plan.md` (checked by Columbo, captain, at integration):

1. Section 3 now has one rule: "While stopping, any Open or Quit, from anywhere, does nothing new."
2. "No agents working" and "under 400 ms" are folded into one rule ("If stopping is done within 400 ms, the app just closes and nothing is shown") and one table row.

The plan also now states the app-menu note from "Keep an eye on later": Close Window hides, its Quit is the same single quit, no other items. **APPROVED**: one Quit, two menu items, one calm line, no confirmations.
