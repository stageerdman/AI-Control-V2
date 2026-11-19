# Times and estimates in the app

**User goal:** "How long did that take?" and "How long will this take?" Answered where the work already
sits, without opening anything new.

## What I removed (and why)
- **No new screen, no new button.** The time sits next to what it describes: the task card, the feature
  row, the team sheet.
- **No tokens on the board.** Tokens are for the team sheet; the board is about time.
- **No goal totals in the Main Quest header.** The steps already show their times, and a second number up
  there only repeats them.
- **No wall-clock ("3h start to finish") on the card.** It's in the tooltip. Agent time is the number that
  adds up and that the estimates use.
- **No "time left" math.** "40m of ~2h" says it without a sum that's wrong half the time.
- **No estimate under 3 finished samples.** The server returns none, and we show nothing. A shaky guess
  is worse than no guess.

## One tag, four states (`timeTag` in `features/office/estimates.ts`)
| Work | Shows | Screen reader |
|---|---|---|
| Finished (done / failed / stopped / shipped) | `1h 20m` | "took 1h 20m" |
| Open, working, with a guess | `40m of ~2h` | "40m so far, usually about 2h" |
| Open, working, no guess | `40m` | "40m so far" |
| Open, not started, with a guess | `~2h` | "usually about 2h" |
| Nothing known | nothing | nothing |

- **Running long:** once agent time passes the top of the usual range, the tag turns sun-coloured. It's a
  quiet heads-up, not an alarm.
- **Tooltip:** finished work shows "1h 20m of agent time, 3h start to finish". Guessed work shows "Usually
  40m–2h, from 6 finished tasks by Pete".
- **Guesses** are rounded: to 5 min under an hour, to 15 min above. "~1h 15m", not "~1h 13m".
- **Type:** 12.5px, weight 800, ink-soft, tabular numbers. It's the same voice as the card's status word,
  so there's no new type size.

## Where
- **Task card** (whiteboard, quest trail, side quests): after the people, before the sign-offs. Members'
  parts show no tag of their own, because the team item's time already includes them.
- **Features folder rows:** before the chevron. Shipped features show their time, ones in progress show
  time so far, planned ones show the guess for a feature.
- **How the team works** (team sheet), last section, **"How long work takes"**:
  - Up to three lines: "A task · usually ~1h 10m · 40m–2h · from 12".
  - "Latest done": the 5 most recently finished tasks, each with its face, title and time.
  - Empty state: "Guesses start once 3 tasks are done."
  - This section covers all time, so the range picker doesn't change it. The heading says so: "all
    finished work".

## Data
One read per office: `GET /projects/:id/timesheet` (key `office:<pid>:time:sheet`, which sits under the
clock's key, so starts and ends of runs read it again). While anything is running, it's read again every
30s so "so far" keeps moving. Each open task carries its assignee's own guess (`estimate`), which falls
back to the whole office's.

## Assumptions (check)
- People read agent time as "how long it took". Check: do people ask why a task "took 3h" when it finished
  in 1h of real time? If they do, show wall time first.
- A median with a middle-half range is precise enough to plan with. Check: compare the guess with the real
  time once 20+ tasks are done.
