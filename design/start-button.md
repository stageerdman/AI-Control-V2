# Start button (Ready to Test, phase 2)

**User goal.** Try what the team built — one tap, nothing to set up.

**Removed.** The running-only "Open app" link as a separate control (it is now one
state of Start). No Stop, no run command, no port, no kind picker here: the server
knows desktop vs website, and Stop / command / ports stay on the health card's App row.

**Where.** The office stage's bottom-right controls, first in the row, sun-coloured
(the one thing in the office you press to try the product). Every project office has it.

**Flow.** Tap Start → website: it starts, opens at `http://localhost:<PORT>/`, and the
control becomes "Open app" · desktop app: its newest build opens, the button reads
"Opened" for 3 s, then Start.

**States.**

| State | Shows |
| --- | --- |
| Idle | `▶ Start` |
| Starting | `… Starting…`, disabled, aria-busy; after 8 s `Still building…` |
| Opened (desktop) | `✓ Opened`, 3 s |
| Website running | `▶ Open app` link (title: port) |
| Failed | `▶ Try again` with a coral ring + a note above: the server's sentence (not built yet / stopped early / still building) and up to 8 last lines; × dismisses |

**Accessibility.** Real button / link; status words go to a polite live region; the
failure note is `role="alert"`; 32 px dismiss target; sun focus ring; ink on sun and
ink on cream both pass AA.

**Build.** `app/src/features/office/StartButton.tsx`, words in `start-button.ts`, styles
`.o-start*` in `office.css`; calls `POST /projects/:id/start` (`officeApi.start`).
