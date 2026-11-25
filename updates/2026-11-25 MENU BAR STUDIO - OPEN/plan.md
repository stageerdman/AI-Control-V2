# Plan: Menu bar studio and clean quit

## Menu bar design

Designer: Jony. 2026-11-25. Built on `research.md` in this folder.

**User goal:** keep agents working while the window is out of the way, get the studio back in one step, and switch it fully off in one step, knowing nothing is lost.

**The rule everything follows:** closing hides, Quit stops. The icon in the menu bar means "still running". When the icon goes, the studio is off.

### What I removed, and why

- **A busy mark on the icon.** If the icon is there, the studio is running, and that's all people check for (research, behavior 7). A second state is one more thing to read, and it can look like an alert.
- **Status, counts and notifications in the menu.** These don't help with the three reasons people click the icon. If they want status, Open shows it.
- **A "Quit anyway?" dialog.** Nothing is lost on Quit, so we tell people what's happening and don't ask them anything.
- **A spinner, progress bar or countdown while stopping.** Each one suggests that something could go wrong. A steady sentence doesn't.
- **A one-time "still running in the menu bar" hint on first close.** The icon already says it. Add one only if the check below shows people are confused.
- **A separator in the menu, and different left-click and right-click behavior.** With two items there's nothing to group, and two click rules would be one more thing to learn.
- **Launch at login, hiding the Dock icon, settings.** Out of scope for this version.

### 1. The icon

- **What it is:** the studio's robot head, drawn as one flat shape. It has a rounded head with two eyes cut out, a short stem and the four-point spark from the app icon. It's solid, with no outlines, so it still reads at 16 px.
- **Files:** `app/src-tauri/icons/tray-template.png` (16×16 px, 16 pt @1x) and `tray-template@2x.png` (32×32 px, 16 pt @2x). Both are pure black with alpha, made to the glyph's shape with anti-aliased edges and no colour.
- **Template image:** load it with `icon_as_template(true)` so macOS tints it. It shows black on light menu bars and white on dark ones, and is dimmed or highlighted like the system icons. On a Retina display, use the @2x file. Tauri's tray takes one image and macOS scales it to the bar.
- **Accessibility:** set the tooltip and accessible name to "AI Studio", so VoiceOver reads it.
- **When it shows:** from the moment the app launches until everything has stopped. It's never hidden while the studio runs.
- **While agents work:** it doesn't change. No badge, no animation, no colour.

### 2. The menu

Any click on the icon (left or right) opens the same menu:

```
Open AI Studio
Quit AI Studio      ⌘Q
```

- **Open AI Studio:** shows the one existing studio window and brings it to the front. It's the same page and the same agent as before, with any draft still in the box. There's no reload, no splash screen and never a second window. If the window is already open, it just comes to the front. **Clicking the Dock icon does exactly the same thing.**
- **Quit AI Studio (⌘Q):** the real quit, described in the next section. The ⌘Q next to it is the app's ordinary Quit shortcut, so the menu item, ⌘Q, Quit in the app menu, Quit in the Dock and a Mac logout or restart all call **the same single quit**. The word "Quit" appears nowhere else.

### 3. While Quit is stopping agents

**If stopping is done within 400 ms, the app just closes and nothing is shown.** This covers no agents working too. The icon and the Dock icon disappear.

**If stopping is still going after 400 ms,** the window shows one calm line, centred, with nothing else:

> Pausing your agents. They'll carry on next time.

- **Look:** the line replaces the window's content on a plain background (the app's normal surface colour). It uses the body text size in the secondary text colour. There are no buttons, icons, spinner or colours. It isn't a dialog or a sheet, so there's nothing to click and nothing to dismiss. It meets the normal text contrast (4.5:1 or better). VoiceOver announces it once as a polite live region.
- **If the window was hidden:** after the same 400 ms, the window comes to the front, showing only the line. That way every Quit looks the same, from the menu bar, ⌘Q or the Dock.
- **How long it stays:** until the agents have stopped, and then the app closes at once. There's no minimum time on screen and no "Done" step.
- **If stopping takes longer:** the server gives each agent 3 s and then stops it by force, so the line stays for about 3 s at most. It doesn't change, count down or turn into a warning. If the server still hasn't reported back after **5 s**, the app quits anyway. The watchdog finishes the cleanup, and the user never sees a second message.
- **While stopping, any Open or Quit, from anywhere, does nothing new.** The same stop continues, so the studio is never left half-quit.
- **The icon** disappears only once the app has really exited, which is the visible sign that the studio is off.
- **Next launch:** the existing "Paused: the studio closed during this run" note keeps it calm, with no red and no error styling, and the agent carries on.

### 4. Closing the window

- The red close button and **⌘W hide the window**. Agents keep working and the app keeps running, with its icon in the menu bar and the Dock. There's no dialog and no hint.
- Minimise works as it does now.
- Open AI Studio in the menu, or a click on the Dock icon, brings the same window back as it was.
- Only Quit stops the studio.
- **The app menu:** Tauri's default macOS menu may add Close Window, Hide and Quit. Close Window hides, the same as ⌘W. Its Quit is the same single quit. Add no other items.

### States checklist

| State | Icon | Window | Shown |
|---|---|---|---|
| Running, window open | visible | open | normal studio |
| Running, window closed | visible | hidden | nothing |
| Quit, stopping done within 400 ms | goes at exit | closes | nothing |
| Quit, agents still stopping after 400 ms | visible until exit | at the front | the one line |
| Stopping hits 3 s | same | same | same line, unchanged |
| No answer after 5 s | goes at exit | closes | nothing new |

### Assumptions (to check)

- Showing the menu on a left click (not opening the window straight away) doesn't slow people down, because Open is the first item. Check: count how often people click the icon and then pick Open. If that's almost every time, try having a left click open the window.
- People don't need a busy mark. Check: do people open the window just to see whether agents are still going? Also check whether anyone closes the window thinking it quits, then gets surprised that agents are still working. If that happens, the lightest fix is a quiet busy mark on the icon, not a dialog or a hint.
- The spark and the head stay separate shapes at 16 px in both light and dark menu bars. Check on a 1x display in the first live pass.
- 400 ms is long enough to avoid a flash and short enough that the line shows up before anyone wonders. Check this in the first live pass.
- Bringing a hidden window forward to show the line feels right, not odd. Check: watch the first few quits from the menu bar with the window closed.
