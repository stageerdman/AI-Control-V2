# How people will read "where tokens go" (user-behavior research, MVP)

By Columbo, 2026-11-25. For Jony (design and build) and Eraser (clutter check). This file is a copy of the report in Reports.
Based on `findings.md` (same folder), `design/user-model.md`, `design/credits-line.md` and today's Agent Performance
sheet (`app/src/features/office/performance/model.ts`).

## Summary
The person opening this view isn't asking "how many tokens?". They're asking **"is my studio spending its usage on real
work, or wasting it, and is that getting better?"** They come for it at three moments: right after the credits line
warns them, after a goal finishes, and on a weekly check once fixes ship. The biggest risks are a scary-big number, a
chart that looks like blame on Uncle Bob or Jony, and "fresh starts" that look bad when they're in fact the cheap,
healthy thing. The data says the costly thing is the opposite: reopening long old sessions.

## Scope
**In (MVP):** one office (one project), the four questions in the brief:
1. who uses the most (share and cost)
2. working vs getting ready
3. how many fresh starts
4. the trend over time

It covers the existing ranges (7 days, 30 days, all time), on a desktop.

**Out, and why:**
- Studio-wide, cross-project view. The view lives in one office's Agent Performance, and the home screen is another
  feature.
- Live "this agent is ballooning right now". It needs live session data. It's Phase 2+ of the roadmap.
- Cost per goal or per feature. The data is per run, and rolling it up by goal is new work. It's listed as an open
  question.
- Knobs, budgets and per-agent limits. The roadmap deleted "budget per agent", and this research only covers reading.
- Phone use. It's a local desktop studio, and there's no evidence of phone use.

**Assumptions (marked, check them):**
- **A1:** The user is the one person who owns the studio, and pays by subscription. Plan windows (credits line), not
  dollars, are what they feel.
- **A2:** Uncle Bob's session data exists at least from now on, and older runs are "not measured".
- **A3:** "Getting ready" means each session's first step: reading the prompt, tools, rules and brief. See the open
  question on this.

## Who and when
The same person, in different states:
- **The alarmed owner:** the credits line just turned warm, or a run was cut off.
- **The satisfied owner:** a goal just finished, and they're curious what it took.
- **The tuner:** they asked for the waste fixes (this goal is marked PRIORITY) and want proof they worked.
- **The skeptic:** they don't trust a big number until it's explained.
- **The tired evening checker:** a quick glance, no reading.

How similar tools are read today: people read the **single most visible number** and rarely open a breakdown. Cursor's
users file "bug" reports when cache-read counts dwarf everything else. Engineers argue publicly over whether cached
tokens should count at all. GitHub had to add a per-model breakdown to its usage report. Re-reads are 95% of our tokens,
so if the view shows a raw total, it will be misread the same way.

## Behavior table
L = likelihood, F = frequency (1–10). Sorted by L + F.

| # | Behavior | L | F | Reason |
|---|---|---:|---:|---|
| 1 | **Who's using it all?** Scan for the biggest agent. | 9 | 7 | It's the first question for any "where did it go" view. They'll look on every visit. |
| 2 | **Why did my credits go so fast?** They arrive from a credits warning or a cut-off. | 8 | 7 | The credits line warns often on busy days, and the card answers "how much is left", not "why". F is 7, not 8: not every day hits a warning. |
| 3 | **Is this normal?** Sanity-check a big number. | 8 | 7 | 1.7 billion tokens in 10 days looks alarming without a yardstick. It happens on the first visits and after any spike. |
| 4 | **Is it getting better?** Check the trend after a fix ships. | 8 | 7 | This is the reason the goal exists. A weekly habit while Phase 4 lands. Some risk it fades after the fixes (L is held at 8). |
| 5 | **What did that take?** A glance after a goal or a big item finishes. | 7 | 7 | "Agent time" already trained this habit on the sheet. They'll want the token side in the same moment. |
| 6 | **Real work or overhead?** Read "working vs getting ready". | 7 | 7 | It's part of every look once it's on screen, and it's the most direct "am I wasting?" signal. Scored low-side: the term is new to them. |
| 7 | **Are fresh starts a problem?** Read the fresh-start count. | 7 | 6 | The brief asks for it, and the number will be large (≈1,860 in 10 days). People notice large counts, but rarely come *for* this one. |
| 8 | **What did the send-back cost?** Rework after a review. | 6 | 6 | Rework is the #1 waste (57% of tokens on reopened sessions). Users feel send-backs, but seldom link them to tokens unless told. |
| 9 | **Turn it into money or plan share** ("what's that in $ / in my weekly limit?") | 7 | 5 | Tokens mean nothing to most people, and $ or % of plan is how they reason. It's asked once and then remembered. |
| 10 | **Which project eats the most?** | 7 | 4 | A natural question, but out of scope (one office). It would come from the home screen. |
| 11 | **Look for a knob** ("can I make Uncle Bob use less?") | 6 | 3 | Comes after reading #1. Nothing to set in the MVP, and the roadmap rejects per-agent budgets. |
| 12 | **Watch a running agent grow** | 5 | 5 | Only the "alarmed owner" mid-run does this. It needs live data (out of scope). |
| 13 | **Screenshot or share it** | 3 | 2 | One owner, no team to report to. Rare. |

## Deep dives (top behaviors)

### 1. Who's using it all?
- **The moment:** at the desk, in the office of a busy project, after a few items ran. They opened Agent Performance to
  see the team.
- **The trigger:** curiosity or worry. "Something's using a lot."
- **Thoughts:** "Who is it? Is one agent stuck in a loop? Should I replace them?"
- **Emotions:**
  - before: a mild suspicion
  - during: relief or alarm, depending on the first bar
  - after: wanting a reason
- **Expectations:** a ranked list, biggest first, with names and avatars they know, in under a second and zero clicks.
  Shares in %, not raw counts.
- **Success:** "Uncle Bob uses 58%, but he did most of the building. Fine." The share makes sense next to the work done.
- **Friction and fears:**
  - a big share with no context reads as blame
  - "Pixel pays more per token" reads as "Pixel is inefficient", when in fact Pixel's turns are just short and cold
  - an agent at 0% looks broken
- **Product insight:** never show a token share alone. Show it **next to the share of work** that agent did. The sheet
  already says "used X% of the tokens in Y% of the time", so reuse that idea and don't repeat that number. The ranking
  is the headline. Builders being on top is normal, and the words should say so ("builders use the most; that's
  expected").

### 2. Why did my credits go so fast?
- **The moment:** mid-afternoon. The rainbow line at the top just turned warm, or a run stopped at the limit. They're
  annoyed, maybe blocked.
- **The trigger:** the credits line. They hover the card, see "12% left", and want to know why.
- **Thoughts:** "I barely did anything today. What ate it? Is something running away? Do I need to stop it?"
- **Emotions:**
  - before: stressed and a little betrayed
  - during: impatient
  - after: calm only if there's a clear cause and nothing is still burning
- **Expectations:** a recent range ("today" or the last 7 days), one sentence of cause, at most one click from where
  they are. They expect it to agree with the credits line.
- **Success:** "Most of it went to Jony's long build this morning, mostly real work. Nothing's running wild."
- **Friction and fears:**
  - numbers that don't match the credits line (the studio is only part of the plan; the user may use Claude elsewhere)
  - a 30-day default when they care about the last few hours
  - jargon
- **Product insight:**
  - The view must work in a short range, and its words must say "of the studio's use" so it never seems to contradict
    the credits line.
  - Don't repeat the credits line's "% left". That's its job.
  - Open question: should the credits card point here? (The credits design removed "who burned it" on purpose and gave
    it to Agent Performance.)

### 3. Is this normal?
- **The moment:** the first time they ever open the view, or after a spike.
- **The trigger:** a number with many digits.
- **Thoughts:** "464 million?! Is that bad? What's a lot? Am I being ripped off?"
- **Emotions:**
  - before: neutral
  - during: a jolt of alarm
  - after: shame or distrust, unless the view explains itself
- **Expectations:** a yardstick:
  - compared to last week
  - compared to the work done
  - a plain sentence: "Most tokens are the agent re-reading its notes on each step. That's cheap and normal."
- **Success:** "Big number, but that's how it works, and it's going down." Fear goes away in one read.
- **Friction and fears:**
  - billions
  - raw totals with re-reads included and unexplained (the Cursor "this must be a bug" pattern)
  - dollar totals when they pay a flat subscription ($911 sounds like a bill they owe)
- **Product insight:**
  - Lead with **shares and a sentence**, not totals.
  - Round hard (k, M, never billions in big type).
  - If money shows, label it as a comparison ("about $X if paid by the API") and keep it secondary.

### 4. Is it getting better?
- **The moment:** a week after "rework starts fresh" or "forget earlier" ships. They remember asking for it.
- **The trigger:** they want proof. "Did the fix work?"
- **Thoughts:** "It should be lower now. Is it? Or did we just do less work this week?"
- **Emotions:** hopeful, then satisfied, or quietly disappointed.
- **Expectations:** weekly bars, this week vs last, with an arrow and a %. The sheet already does "↓ 12% vs last week".
- **Success:** "Same amount of work, a third fewer tokens." That's the headline they'd tell someone.
- **Friction and fears:**
  - **raw totals follow how busy they were**: a heavy week looks like the fix failed, and a quiet week looks like a win
  - a gap before measuring began looks like a drop
- **Product insight:**
  - The honest trend is **tokens per piece of work** (per finished item, or per hour of agent time), not the raw total.
    Show the total if needed, but compare per item.
  - Mark "not measured before {date}" instead of drawing zeros.

### 5. What did that take?
- **The moment:** evening. A goal just finished, and the team sheet is open because they were looking at "How long
  work takes".
- **The trigger:** closure. A sense of "that was big, what did it cost?"
- **Thoughts:** "Was it worth it? Which part was expensive: the build or the review rounds?"
- **Emotions:** pride, a little guilt about the cost, curiosity.
- **Expectations:** the same range and the same agents as the rest of the sheet, so it reads as one story.
- **Success:** "The build took most of it; the reviews were small; one send-back added a chunk."
- **Friction and fears:** they can't tie numbers to *this* goal (the view is by agent and time, not by goal).
- **Product insight:**
  - In the MVP, a short range (7 days) mostly covers one goal, and that's enough.
  - Per-goal cost is an open question, not MVP.
  - Rework and reopened sessions are where cost hides, so if anything gets a one-line call-out, it's that.

### 6. Real work or overhead?
- **The moment:** any visit, after #1 is answered.
- **The trigger:** the follow-up "...and is it wasted?"
- **Thoughts:** "If half of it is just starting up, that's waste I can fix."
- **Emotions:** analytical, then reassured.
- **Expectations:** two words they understand ("working", "getting ready") and one bar or two numbers.
- **Success:** "Almost all of it is real work. Starting up is small."
- **Friction and fears:**
  - **A definition mismatch.** In the data, the start of a session is small: a cold start is about 8–13 k tokens. But
    the *same fixed text re-read on every step* is about 22% of all tokens. If "getting ready" shows only the first
    step, it'll be tiny, and the user may conclude there's no waste when the real waste is long and reopened sessions.
  - Jargon like "cache", "context", "prefix".
- **Product insight:**
  - Pick one definition and say it in a short line ("getting ready = reading the rules and the task before starting").
  - Expect "getting ready" to look small, and that's fine and true.
  - Don't present it as *the* waste measure. See the open question.

### 7. Are fresh starts a problem? (just under the bar, kept because the brief asks for it)
- **The moment:** reading the fresh-start count next to the agents.
- **The trigger:** a big number, ≈1,860 in 10 days.
- **Thoughts:** "Restarting 1,800 times sounds wasteful. Why can't they remember?"
- **Emotions:** confusion, then wrongly placed worry.
- **Expectations:** a count, and a hint whether high is good or bad.
- **Success:** "Fresh starts are cheap. It's picking up old long sessions that costs."
- **Friction and fears:** the intuition is backwards. The data says:
  - forgets save tokens
  - fresh starts cost about 20 k context per step
  - reopened old sessions cost 54 k per step, and are 57% of everything

  A bare count invites the wrong conclusion.
- **Product insight:**
  - Show fresh starts **neutrally**, with a plain meaning ("started with a clean slate").
  - Don't colour it as a warning.
  - If there's room for one more number, "picked up old work" is the one that matters. That's a choice for Jony and
    Eraser. Keep it to one count each, not a breakdown of the six reasons.

## Watch out (low score, but could break trust or cause harm)
- **Blame on one agent.** "Uncle Bob 58%" reads as "Uncle Bob is wasteful". The user may edit or remove a good agent
  (deleting agents has hurt them before). Always pair the share with the work done.
- **Scary numbers.** Billions of tokens and a $911 total on a flat subscription. Use shares, rounding, and money only as
  a labelled comparison.
- **"Re-read" sounds like waste.** It's 95% of tokens but only about a tenth of the price per token. Avoid the word in
  headlines. The open agent row already says "new + re-read tokens", so don't repeat it.
- **Fresh starts look bad but are good** (see #7).
- **Pixel "costs more per token".** That's true, but it's because of short, cold turns. Don't show cost per token per
  agent in the MVP.
- **Disagreeing with the credits line.** The studio's share isn't the whole plan. Say "the studio's use" and don't show
  "% left".
- **Zeros that are really "not measured".** Older runs have no session data. Show "not measured yet", never 0.
- **Trends that punish busy weeks** (see #4).
- **Feeling judged.** Words like "wasted" or "inefficient" make the owner feel blamed for how the studio works. Use calm,
  factual words, and let the fixes speak.
- **A knob-shaped hole.** Seeing "who uses most" makes people want a slider. Don't add one, and don't imply one ("reduce"
  buttons).
- **A clash with an earlier decision.** The Agent Performance code says "No money anywhere", but the brief asks for
  "share and cost". Decide on purpose (see the open questions).

## Key insights for Jony
1. **Answer with a sentence first, numbers second.** For example: "This week, most of the studio's use went to building,
   mainly Uncle Bob and Jony. Almost all of it was real work." People read the most visible thing, so make it the
   explanation.
2. **Share beside work, always.** Token share next to share of agent time (or items done) kills blame. Reuse the sheet's
   existing callout instead of a second copy.
3. **Shares and rounded numbers. No billions in big type.** Money, if shown, is secondary and labelled as an API-price
   comparison.
4. **"Working" vs "getting ready" in one line,** with a one-sentence definition. Expect "getting ready" to be small, and
   don't frame it as the waste meter.
5. **Fresh starts are neutral to good.** One count, no warning colour. If one extra number earns its place, it's
   "picked up old work" (where the cost hides).
6. **The trend compares like with like.** Per finished item or per hour of work, week over week, with the sheet's
   existing "↓ 12% vs last week" style. Mark "not measured before {date}".
7. **It works in short ranges.** People arrive from a credits warning wanting "today" or "this week", and the words say
   "the studio's use" so it never contradicts the credits line.
8. **Calm empty and partial states.** "Nothing measured yet — this fills in after the next run." Never zeros for
   unmeasured.
9. **Read-only, no knobs.**

## Open questions
- **What does "getting ready" mean?** (a) only each session's first step (small, honest about start-up), or (b) the
  fixed text re-read on every step (≈22%, closer to "overhead"). My recommendation is (a), because it's simpler to
  explain, but then the view needs another way to hint at the long-session cost. Who decides: Jony with Elon.
- **Money: show it or not?** The brief says "cost", Agent Performance says "no money anywhere", and the user is on a
  subscription. My suggestion is to show it small, as "≈ $X at API prices", or ask the user.
- **Per-goal cost** (behavior #5): is it worth a follow-up feature?
- **Should the credits card link here?** That's a second way in, so it's Eraser's call against "only one way to reach
  it".
- **Trend unit:** per finished item, or per hour of agent time? This depends on what Uncle Bob records.
- **Uncertainty:** all scores are reasoned from the findings, the user model and forum evidence, not from watching this
  user. Check in the live pass whether the first thing they do is #1 or #2.

## Sources
- `updates/2026-11-25 CONTEXT WINDOW MANAGEMENT - OPEN/findings.md` and `update v1.md`
- `design/user-model.md`, `design/credits-line.md`, `app/src/features/office/performance/model.ts`
- Cursor forum, "Bug Report: Abnormal Cache Token Counting / Billing Display Issue":
  https://forum.cursor.com/t/bug-report-abnormal-cache-token-counting-billing-display-issue-in-cursor-usage-dashboard/173469
- Cursor forum, "Understanding LLM Token Usage": https://forum.cursor.com/t/understanding-llm-token-usage/120673
- Digg summary of the debate on counting cached tokens: https://digg.com/ai/onfl2d4w
- GitHub changelog, per-model token breakdown:
  https://github.blog/changelog/2026-08-11-per-model-token-breakdown-in-the-usage-report
