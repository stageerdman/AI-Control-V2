# Agent thinking power — wiki

- **Two levers, one dial.** Quality and cost of thought come from the model (price, ability) and the effort
  (how much it reasons). Users get one four-step dial; the step → (model, effort) table is the only place both
  are named.
- **Claude Code's `--effort`** takes `low | medium | high | xhigh | max` (and `ultracode`); availability depends
  on the model. It is a session flag: it can't change mid-session, so a "think harder" switch takes effect from
  the next session (resume or `forget`).
- **Before this update** the studio passed `--model` (one studio-wide `AI_STUDIO_MODEL`) and no `--effort`, so
  every run used the CLI's default effort. `runs.model` was already recorded.
- **Extra thought before extra loops.** Higher effort already does in-model self-critique; a separate
  "call yourself again" loop costs a whole run. Try the cheap prompt step and measure before building loops.
- **No money in the studio's numbers** (Agent Performance rule): cost per step is shown as tokens and time,
  with the model named, because tokens on different models aren't priced the same.
