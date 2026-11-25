# Research: how people use the menu bar icon and Quit

Goal: Menu bar studio and clean quit. Researcher: Columbo. 2026-11-25. First version only.

## Summary

People don't hire AI Studio to sit in a window. They hire it to **keep working while they look away**. So the window is just a view, and the menu bar icon is the proof that the work goes on. Users click the icon for three reasons, in this order: **to bring the studio back**, **to quit it**, and, much less often, **to check that it's still running**.

Today, closing the only window **quits the whole app and stops every agent** (`app/src-tauri/src/lib.rs:40`, Tauri default; see `updates/2026-11-25 SHUTDOWN QUESTION - CLOSED/wiki.md`). People close windows without thinking, so this is the biggest trust risk in the feature. After the change, closing the window should only hide it. The studio keeps running, and the icon in the menu bar is the only sign of that.

Quitting is already safe. Agents get stopped (the server gives each one 3 s, then forces it), the chat shows "Paused: the studio closed during this run", and the next launch picks up the same session on the same branch. Nothing is marked failed. The user doesn't know any of this. All they need at Quit is **one calm line saying their work will carry on**, and it has to be gone within a few seconds.

## Scope

**In:** clicking the menu bar icon; its two items (Open, Quit); closing the window; quitting from the menu bar, Cmd+Q, the Dock and the app menu; force quit; Mac logout or restart; what people feel while agents are being stopped.

**Out (and why):**
- Status in the menu (agent counts, progress, notifications). The brief allows only two items. A "busy" mark on the icon is Jony's call; see open questions.
- Launch at login, hiding the Dock icon, settings. Not in the first version, and each one adds a choice.
- The hard-crash gap in the wiki (orphaned agent processes when the *server* dies). That is engineering work, but it's on the watch-out list because users would see it as "Quit didn't work".

## How similar apps set expectations

These are well-known patterns on the Mac, so users arrive with them already in mind:
- **Background tools with a menu bar icon** (Docker Desktop, Ollama, Tailscale, Dropbox, Raycast): closing the window keeps the tool running, the icon brings it back, and the icon menu has a Quit. Users already know this rule: *if there's an icon up there, it's still running*.
- **Ordinary Mac document apps** (Notes, Safari): closing the window leaves the app running in the Dock, and Cmd+Q quits. Mac users expect "close" and "quit" to be different things. Windows switchers and newer users often don't.
- **Apps that warn at Quit** (Terminal with a running process, browsers with many tabs) show a dialog that asks for a choice. People find it irritating, but it saves them now and then. In our case nothing is lost, so **there's no need to ask, only to tell**.

## Behaviors

Scores run 1–10. L = likelihood that real users do this. F = how often they do it. Sorted by L+F. When I wasn't sure, I picked the lower score.

| # | Behavior | L | F | Why |
|---|---|---|---|---|
| 1 | **Close the window to get it out of the way** (red button or Cmd+W) while agents work | 9 | 9 | It's a reflex several times a day. Many people "clean up" windows without thinking about the app behind them. |
| 2 | **Click the icon to bring the studio back** after closing or losing the window | 9 | 8 | Once the window is closed, this is the main way back (alongside the Dock). It happens every time they check in on agents. |
| 3 | **Quit with Cmd+Q** at the end of the day or before a restart | 8 | 6 | Mac users quit by keyboard. Done daily by tidy users, weekly by others. |
| 4 | **Quit while agents are still working** (on purpose: closing the laptop, battery, leaving) | 8 | 6 | Agents work for long stretches, so most quits happen in the middle of something. That's why the stopping line matters. |
| 5 | **Click the icon, then Quit AI Studio** | 7 | 5 | Common with menu bar tools, especially when the window is closed and the Dock isn't in view. Less common than Cmd+Q. |
| 6 | **Quit from the Dock** (right-click, then Quit) | 6 | 4 | Mouse users and people who see the Dock icon first. Also used when "Cmd+Q didn't seem to do anything". |
| 7 | **Glance at the menu bar to confirm it's still running** (no click) | 7 | 3 | Happens after closing the window, or after the first time they find out closing doesn't quit. Worth very little once trust is built. |
| 8 | **Click the Dock icon to bring the window back** | 7 | 6 | It's the Mac habit. It must work the same as "Open AI Studio", or people will think the app is broken. |
| 9 | **Log out, restart or shut down the Mac with the studio open** | 6 | 3 | macOS quits the app for them, so it's the same path as Quit. Weekly at most. |
| 10 | **Quit by accident** (Cmd+Q aimed at another app, or Cmd+Q pressed for Cmd+W) | 5 | 2 | Q sits next to W. It's rare per user but certain across many users. Mild, because work resumes. |
| 11 | **Force quit** (Option-Cmd-Esc, Activity Monitor) because it seems frozen or quit seems slow | 3 | 1 | Only when stopping looks stuck. The watchdog turns it into a clean stop within about 1 s. |
| 12 | **Quit, then reopen right away** to "restart" it when something feels off | 4 | 2 | An old IT habit. It works, since work resumes, so this is fine. |
| 13 | **Click the icon expecting status** ("what are they doing?") and find only Open and Quit | 4 | 3 | Some power users will want that. For the first version, Open is the answer. |

Merged: "close with red button" and "Cmd+W" (same intent). "Dock right-click Quit" and "app menu Quit" (same path, same expectation).

## Deep dives

### 1. Closing the window while agents work (L9 F9)

- **The moment:** mid-afternoon, laptop, many windows. They've just handed Pixel a task and want their screen back for email or their editor.
- **The trigger:** the work has started, so they don't need to watch it. The window is clutter now.
- **Thoughts:** "OK, they're on it. Get this out of my face." First time after the change: "…wait, did I just stop them?" Today, before the change: "Why is everything paused?"
- **Emotions:** relief and confidence before. During, nothing at all (that's the goal). After, one jolt of doubt the first time, which settles once they see the icon.
- **Expectations:** the window disappears at once with no dialog. Agents keep going. The icon in the menu bar shows it's alive.
- **Success:** they come back an hour later and the work is further along, without them having had to think about it.
- **Friction and fears:** a dialog asking "Keep running in background?" (a choice they don't want to make). Finding out later that closing had stopped the work, which breaks trust badly. Not knowing it's still running and wondering about battery or privacy ("is it still doing things on my machine?").
- **Product insight:** closing should hide the window, quietly, every time. The icon is the whole explanation, so it has to be there from launch, not only after closing. A one-time hint is optional. If Jony wants one, it should be a single line the first time the window closes (for example, "Still working: AI Studio is in the menu bar"), never a question. Jony decides; I'd lean toward no hint if the icon is clear.

### 2. Clicking the icon to bring the studio back (L9 F8)

- **The moment:** any time after closing. Often they come back from a meeting or a break and want to see how far the agents got.
- **The trigger:** curiosity ("Are they done?"), a page from the studio, or needing to answer an agent's question.
- **Thoughts:** "Where did it go? Oh, up there." Then "Show me."
- **Emotions:** a little impatient before (they want the answer now). Satisfied when the window comes back exactly as they left it.
- **Expectations:** **one click, maybe two**. Many people expect a single click on the icon to open the window straight away. Others expect a menu. With a two-item menu, "Open AI Studio" must be the first item, so it's click and click. The window comes back **on the same page, same agent, draft still in the box**, within a moment and with no reload or splash screen. If the window is already open but behind other windows, it must come to the front.
- **Success:** it feels like flipping back to a tab, not like launching an app.
- **Friction and fears:** a reload or "starting server" screen (it makes them think it had quit). Opening a second window. Landing on a different page than they left.
- **Product insight:** "Open" means show and focus the one existing window, and keep its state. The Dock icon click (behavior 8) must do exactly the same thing. Open question for Jony: should a plain left-click open the window directly and right-click show the menu? Many people expect this from menu bar icons. The brief says a menu with two items, so I'd keep the menu and put Open first.

### 3. Quitting while agents are working (L8 F6), whatever the path (Cmd+Q, icon, Dock)

- **The moment:** end of the day, the laptop is about to close, the train is arriving. Or before a Mac update. Most often an agent is halfway through something.
- **The trigger:** they're leaving, the battery is low, or they want the machine quiet.
- **Thoughts:** "Will this break what they're doing? Will I lose an hour of work? Do I have to wait for them to finish?" Then "I don't have time for a dialog."
- **Emotions:** a small worry before. During, impatience, which grows quickly after about 2 seconds. After, they want calm certainty, not "hope it's fine".
- **Expectations, and how long they'll wait:**
  - Under about 1 s: feels instant, and nothing needs to be shown.
  - 1–3 s: acceptable **if** something on screen says what's happening.
  - 3–5 s: they start to wonder if it's stuck. Some press Cmd+Q again or reach for force quit.
  - Over 5 s: it feels broken.
  The server's limit fits this: 3 s grace per agent, then forced. The whole thing should finish in about 3 s at worst.
- **What reassures them** (in order): (1) words saying the work isn't lost: *it pauses and picks up next time*; (2) it's quick; (3) they don't have to decide anything; (4) next launch, the chat shows "Paused: the studio closed during this run" and the agent carries on, which confirms the promise.
- **Success:** "I quit, it said my work will pick up where it left off, it was gone in a second or two, and tomorrow it carried on."
- **Friction and fears:** a confirm dialog ("Agents are working. Quit anyway?"). It adds a step and suggests something bad will happen, which isn't true. A spinner with no words. Technical words ("terminating processes", "SIGTERM"). Text that counts down. Having to wait for an agent to *finish*. An agent that seems to "start over" next time instead of continuing.
- **Product insight:** don't confirm, just tell. One short, calm line while stopping, only when agents are actually working. It should promise continuity ("work picks up next time"), not describe the mechanics. With no agents working, quit at once with nothing shown. Every path (icon, Cmd+Q, Dock, app menu, logout) must lead to this same stop and the same line. Pressing Cmd+Q a second time while it's stopping should not do anything different or scary.

### 4. Quitting from the icon or the Dock when the window is closed (L7 F5 / L6 F4)

- **The moment:** the window is already hidden. They want the studio fully gone, maybe because a fan is spinning or they're about to share their screen.
- **The trigger:** "I want it *off*, not just hidden."
- **Thoughts:** "Is it really off now? The icon is gone, good."
- **Emotions:** they want closure. A small worry if any trace stays.
- **Expectations:** the same stopping line as with Cmd+Q, even though no window is open. (Where it appears is Jony's call. It may need to appear in the menu or a small panel, since there's no window.) After quitting, the icon disappears from the menu bar and the Dock.
- **Success:** the icon goes away, which visibly confirms "it's off".
- **Friction and fears:** the icon lingering. Quit from the Dock acting differently from Quit in the menu (for example, one shows the stopping line and the other doesn't). Quit only closing the window.
- **Product insight:** the icon disappearing is the "it's off" signal, so it must go only when everything has really stopped. Quit should never be confused with Close: the word "Quit" appears only on the real quit.

### 5. Glancing to confirm it's still running (L7 F3)

- **The moment:** right after closing the window, or later when they wonder whether a long task is still going.
- **The trigger:** doubt.
- **Thoughts:** "Is it still on?"
- **Expectations:** the icon is there. That's enough. Some will hope for a small "busy" sign; very few will miss it if it isn't there.
- **Product insight:** being there means running. If Jony adds a busy sign, it must be subtle and single-color (template image), and must never look like an alert. Leaving it out is safe for the first version.

## Watch out

These are low-scoring things that could still break trust:

1. **Not knowing the studio is still running.** Someone closes the window, forgets, and wonders why their battery or fan is busy, or worries that agents keep touching files "behind their back". The icon must always be visible, and Quit must be one click away from it.
2. **Accidental Quit halfway through an agent's work** (Cmd+Q for Cmd+W, or aimed at another app). No data is lost, but if the user doesn't know that, it feels like damage. The stopping line and the "Paused…" note in chat are what calm them. Don't add a confirm dialog: it would slow down every intended quit to protect a rare, harmless mistake.
3. **People who expect "close = quit"** (Windows switchers, tidy users). They think it's off, but it keeps running. This is why the icon has to be clear and the app has to be easy to fully quit.
4. **Stopping takes longer than about 3 s and they force quit.** That's harmless (the watchdog makes it a clean stop within about 1 s), but they'll remember it as "the app hangs on quit". Keep the line steady, with no countdown, and show nothing alarming.
5. **"Paused" read as "failed".** On the next launch, the "Paused: the studio closed during this run" note must read as normal, and the agent should visibly carry on. Red or error styling would undo the reassurance.
6. **Quit that doesn't fully quit.** If the server dies hard (crash, killed in Activity Monitor), agent processes can be left running and keep editing while the next launch resumes the same session (wiki "Gap"). Users would experience this as "I quit and it kept going". That's engineering work, not design, but it's flagged here so the Quit promise stays true.
7. **Apps the user started with Start.** It isn't clear from the wiki whether a clean quit stops them too. *Assumption:* the user expects Quit AI Studio to stop everything the studio started. If a started app outlives Quit, that breaks the "it's off" expectation.
8. **Two ways to bring the window back acting differently** (icon Open vs Dock click), for example one showing a fresh page. Both must show the same window in the same state.
9. **A dev server is never stopped by the app** (wiki). Only internal users hit this, but Quit can look like it "didn't work" for them.

## Key insights for the design

1. **Close means hide, and Quit means stop.** Use the word "Quit" only on the real quit.
2. **One Quit everywhere.** Menu bar, Cmd+Q, Dock, app menu and Mac logout all lead to the same stop and the same line.
3. **Tell, don't ask.** No confirm dialog, because nothing is lost. One calm line that promises the work picks up next time.
4. **Fast or silent.** If no agents are working, quit at once with nothing shown. If agents are working, show the line for at most about 3 s.
5. **The icon is the proof of life.** It's visible from launch, gone only once everything has really stopped, single-color, and quiet.
6. **Open brings back the same window, in the same state, at the front.** The icon menu and the Dock click behave the same.

## Open questions (for Jony)

- Does a plain left-click on the icon open the window directly, or always show the two-item menu? The brief implies the menu. If so, Open goes first.
- Where does the stopping line appear when no window is open (behavior 4)? Bringing the window up to show it is one option.
- Should the icon show a subtle busy state? My research says it's optional, and leaving it out is safe.
- Should a one-time hint appear the first time the window is closed? I lean no, if the icon is clear.

*Assumptions:* the wait times are based on common response-time guidelines (about 1 s feels instant, about 10 s loses attention, and people grow uneasy in between when nothing explains the wait). I haven't tested them with our users. Behavior scores are my estimates from how people use similar Mac tools, not from usage data.
