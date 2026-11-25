# Token view: cleanliness review (Eraser)

What I reviewed: `app/src/features/office/performance/tokens/` (model.ts, TokensView.tsx) and where it mounts, `TeamSheet.tsx:226`. Built from commit 7e56a14.

**User goal:** "Is my studio spending its usage on real work, and is that getting better?"

## Step count
1. Open "How the team works"
2. Tap the Tokens card
3. Read the lead sentence. You're done; the other lines are optional.

Now: 3. Target: 3. The path is already lean.

## The three checks
| Check | Result |
|---|---|
| 1. No repeated numbers (credits line, Agent Performance) | **FAIL.** The lead's "Rivet (65%)" matches the "Worth a look" flag ("used 65% of the tokens…") and the token-ranked "Who does the work" list. Nothing repeats the credits line, which shows plan left, not dollars. |
| 2. One way in | **PASS.** It's mounted only under the chart while the Tokens card is picked. The credits line doesn't link to it. |
| 3. Plain labels | **FAIL.** "at API prices", "session" in both hints, and the vague labels "When" and "Over time". |

## Line by line
| Line | Mark | Why |
|---|---|---|
| Lead: names, share %, $ | **Cut** the % | The % is already on screen twice. Only the money is new. |
| Lead: total cost | Keep, **rename** "API prices" | The cost is new information. "API" is jargon. |
| When: working / getting ready bar | Keep, **rename** "When" | The number is new, but the label doesn't say what it measures. |
| Starts: fresh / picked up | Keep | It's new and in plain words. |
| Over time: per hour + trend | Keep, **rename** | The like-for-like rate is a solid reason to keep it. But with the label "Over time" it reads like a second copy of the Tokens card's trend with a different number. |
| Definition hints | Keep, **reword** "session" | They're one line and they explain the new words. |
| TeamSheet.tsx:5 "No money anywhere" | **Docs** | Stale now that the sheet shows dollars. |

## Verdict: RETURNED to Jony (small fixes)
Jony accepted all four items: drop the % and keep the dollars, "Per hour of work", "if paid per use", "Spent on", hints without "session", and updated docs.

What I'll check on the return: each item is fixed; the new hint wording still names the word it explains (for example "Getting ready: the first step…"), so a definition isn't left without its subject; the office/performance tests pass; the app builds and Start answers.

## Sign-off
_Pending Jony's fixes._
